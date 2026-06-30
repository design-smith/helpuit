import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import type { FastifyInstance } from 'fastify'
import {
  createDb,
  DrizzleInvestigationRepository,
  DrizzleDraftRepository,
  DrizzleGithubLinks,
  DrizzleJobQueue,
  DrizzleAuditRepository,
  type DbHandle,
} from '@helpuit/db'
import { buildAdminApi } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
let extraServer: Server | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
  extraServer?.close()
})

// buildAdminApi only reads github.*, security.encryptionKey, budget.perDay.
const config = {
  github: { owner: 'o', repo: 'r', token: 't', productionBranch: 'main' },
  security: { encryptionKey: 'test-key' },
  budget: { perDay: 1000 },
} as unknown as HelpuitConfig

const TOKEN = 'admin-secret'

async function start() {
  handle = await createDb(':memory:')
  const investigations = new DrizzleInvestigationRepository(handle.db)
  const drafts = new DrizzleDraftRepository(handle.db)
  const inv = await investigations.create({ conversationId: 7, customerId: 'u1' })
  const draft = await drafts.save({
    investigationId: inv.id,
    conversationId: 7,
    title: '[new_bug] broken',
    body: 'summary',
    labels: ['helpuit'],
    severity: 'medium',
  })

  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  return { base, inv, draft }
}

const bearer = { authorization: `Bearer ${TOKEN}` }

describe('admin API', () => {
  it('401s without auth and 200s with a bearer token', async () => {
    const { base } = await start()
    expect((await fetch(`${base}/admin/overview`)).status).toBe(401)
    const ok = await fetch(`${base}/admin/overview`, { headers: bearer })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ investigations: { total: 1 } })
  })

  it('logs in and authorizes via the session cookie (dual auth)', async () => {
    const { base } = await start()
    const bad = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong' }),
    })
    expect(bad.status).toBe(401)

    const login = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
    })
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie')
    expect(setCookie).toContain('helpuit_admin=')
    const cookie = setCookie!.split(';')[0]! // helpuit_admin=<token>

    const viaCookie = await fetch(`${base}/admin/overview`, { headers: { cookie } })
    expect(viaCookie.status).toBe(200)
  })

  it('lists filed GitHub issues at /admin/issues (newest first, with total)', async () => {
    handle = await createDb(':memory:')
    const investigations = new DrizzleInvestigationRepository(handle.db)
    const links = new DrizzleGithubLinks(handle.db)
    const inv = await investigations.create({ conversationId: 9, customerId: 'u9' })
    await links.link({ investigationId: inv.id, issueNumber: 42, issueUrl: 'https://github.com/o/r/issues/42' })

    const api = buildAdminApi(config, { db: handle.db })
    app = buildServer({ admin: { token: TOKEN, api } })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`

    expect((await fetch(`${base}/admin/issues`)).status).toBe(401)
    const res = await fetch(`${base}/admin/issues`, { headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Array<{ issueNumber: number; issueUrl: string }>; total: number }
    expect(body.total).toBe(1)
    expect(body.items[0]?.issueNumber).toBe(42)
    expect(body.items[0]?.issueUrl).toContain('/issues/42')
  })

  it('serves the live Chatwoot transcript for a conversation, and 404s an unknown one', async () => {
    handle = await createDb(':memory:')
    const investigations = new DrizzleInvestigationRepository(handle.db)
    const inv = await investigations.create({ conversationId: 55, customerId: 'u' })

    const chat = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.url === '/api/v1/accounts/9/conversations/55/messages') {
        res.end(
          JSON.stringify({
            payload: [
              { content: 'help, the export is broken', message_type: 0, created_at: 1000 },
              { content: 'on it', message_type: 1, created_at: 1001 },
            ],
          }),
        )
      } else {
        res.statusCode = 404
        res.end('{}')
      }
    })
    await new Promise<void>((r) => chat.listen(0, '127.0.0.1', () => r()))
    extraServer = chat
    const chatUrl = `http://127.0.0.1:${(chat.address() as AddressInfo).port}`

    const txConfig = {
      ...config,
      chatwoot: { baseUrl: chatUrl, accountId: 9, inboxId: 1, apiToken: 'cw' },
    } as unknown as HelpuitConfig
    const api = buildAdminApi(txConfig, { db: handle.db })
    app = buildServer({ admin: { token: TOKEN, api } })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`

    const res = await fetch(`${base}/admin/conversations/${inv.id}/transcript`, { headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { available: boolean; messages: Array<{ author: string; text: string }> }
    expect(body.available).toBe(true)
    expect(body.messages.map((m) => `${m.author}:${m.text}`)).toEqual(['customer:help, the export is broken', 'agent:on it'])

    expect((await fetch(`${base}/admin/conversations/nope/transcript`, { headers: bearer })).status).toBe(404)
  })

  it('refreshes GitHub issue open/closed status from GitHub, and filters by it', async () => {
    handle = await createDb(':memory:')
    const investigations = new DrizzleInvestigationRepository(handle.db)
    const links = new DrizzleGithubLinks(handle.db)
    const inv = await investigations.create({ conversationId: 1, customerId: 'u' })
    await links.link({ investigationId: inv.id, issueNumber: 42, issueUrl: 'https://gh/issues/42' })

    const gh = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ number: 42, state: 'closed' }))
    })
    await new Promise<void>((r) => gh.listen(0, '127.0.0.1', () => r()))
    extraServer = gh
    const ghUrl = `http://127.0.0.1:${(gh.address() as AddressInfo).port}`

    const cfg = {
      ...config,
      github: { owner: 'o', repo: 'r', token: 't', productionBranch: 'main', apiBaseUrl: ghUrl },
    } as unknown as HelpuitConfig
    const api = buildAdminApi(cfg, { db: handle.db })
    app = buildServer({ admin: { token: TOKEN, api } })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`

    const refreshed = await fetch(`${base}/admin/issues/refresh`, { method: 'POST', headers: bearer })
    expect(refreshed.status).toBe(200)
    expect(((await refreshed.json()) as { synced: number }).synced).toBe(1)

    const closed = (await (await fetch(`${base}/admin/issues?status=closed`, { headers: bearer })).json()) as {
      items: Array<{ issueNumber: number; status: string }>
      total: number
    }
    expect(closed.total).toBe(1)
    expect(closed.items[0]?.status).toBe('closed')

    const open = (await (await fetch(`${base}/admin/issues?status=open`, { headers: bearer })).json()) as { total: number }
    expect(open.total).toBe(0)
  })

  it('expands a job into its conversation step trail at /admin/jobs/:id/logs', async () => {
    handle = await createDb(':memory:')
    const investigations = new DrizzleInvestigationRepository(handle.db)
    const audit = new DrizzleAuditRepository(handle.db)
    const queue = new DrizzleJobQueue(handle.db)

    const inv = await investigations.create({ conversationId: 77, customerId: 'u' })
    await audit.record({ investigationId: inv.id, type: 'created', at: 1000 })
    await audit.record({ investigationId: inv.id, type: 'guidance', data: { decision: 'resolved' }, at: 1001 })
    // a job whose stored payload carries the conversation it processed
    const jobId = await queue.enqueue({
      type: 'investigation',
      payload: { payload: { conversation: { id: 77 } }, context: {} },
    })

    const api = buildAdminApi(config, { db: handle.db })
    app = buildServer({ admin: { token: TOKEN, api } })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`

    const res = await fetch(`${base}/admin/jobs/${jobId}/logs`, { headers: bearer })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      conversationId: number
      investigationId: string
      entries: Array<{ type: string }>
    }
    expect(body.conversationId).toBe(77)
    expect(body.investigationId).toBe(inv.id)
    expect(body.entries.map((e) => e.type)).toEqual(['created', 'guidance'])

    expect((await fetch(`${base}/admin/jobs/nope/logs`, { headers: bearer })).status).toBe(404)
  })

  it('lists investigations and returns 404 for an unknown one', async () => {
    const { base, inv } = await start()
    const list = await fetch(`${base}/admin/investigations`, { headers: bearer })
    expect(list.status).toBe(200)
    const page = (await list.json()) as { total: number; items: Array<{ id: string }> }
    expect(page.total).toBe(1)
    expect(page.items[0]!.id).toBe(inv.id)

    const detail = await fetch(`${base}/admin/investigations/${inv.id}`, { headers: bearer })
    expect(detail.status).toBe(200)
    expect(((await detail.json()) as { investigation: { id: string } }).investigation.id).toBe(inv.id)

    const missing = await fetch(`${base}/admin/investigations/nope`, { headers: bearer })
    expect(missing.status).toBe(404)
  })

  it('lists pending drafts and rejects one (200 then 409 on a second decision)', async () => {
    const { base, draft } = await start()
    const list = await fetch(`${base}/admin/drafts`, { headers: bearer })
    expect(((await list.json()) as { total: number }).total).toBe(1)

    const reject = await fetch(`${base}/admin/drafts/${draft.id}/reject`, {
      method: 'POST',
      headers: { ...bearer, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'not a bug' }),
    })
    expect(reject.status).toBe(200)
    expect(((await reject.json()) as { status: string }).status).toBe('rejected')

    const again = await fetch(`${base}/admin/drafts/${draft.id}/reject`, { method: 'POST', headers: bearer })
    expect(again.status).toBe(409)
  })

  it('pauses and resumes a conversation, and lists jobs/tickets', async () => {
    const { base } = await start()
    const paused = await fetch(`${base}/admin/conversations/7/pause`, {
      method: 'POST',
      headers: { ...bearer, 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'manual' }),
    })
    expect(await paused.json()).toEqual({ status: 'paused', conversationId: 7 })

    const list = await fetch(`${base}/admin/conversations/paused`, { headers: bearer })
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1)

    await fetch(`${base}/admin/conversations/7/resume`, { method: 'POST', headers: bearer })
    const after = await fetch(`${base}/admin/conversations/paused`, { headers: bearer })
    expect(((await after.json()) as { items: unknown[] }).items).toHaveLength(0)

    expect((await fetch(`${base}/admin/jobs`, { headers: bearer })).status).toBe(200)
    expect((await fetch(`${base}/admin/tickets`, { headers: bearer })).status).toBe(200)
  })
})
