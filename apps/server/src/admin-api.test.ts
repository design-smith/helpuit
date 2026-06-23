import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import {
  createDb,
  DrizzleInvestigationRepository,
  DrizzleDraftRepository,
  type DbHandle,
} from '@helpuit/db'
import { buildAdminApi } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  handle?.close()
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
