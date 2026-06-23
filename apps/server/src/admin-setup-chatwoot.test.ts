import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { createDb, type DbHandle } from '@helpuit/db'
import { buildAdminApi } from '@helpuit/composition'
import type { HelpuitConfig } from '@helpuit/config'
import { buildServer } from './server.js'

let app: FastifyInstance | undefined
let handle: DbHandle | undefined
const servers: Server[] = []
afterEach(async () => {
  await app?.close()
  handle?.close()
  for (const s of servers) s.close()
  servers.length = 0
})

async function chatwootStub(): Promise<{ base: string; count: () => { bots: number; hooks: number } }> {
  const bots: Array<{ id: number; name: string; outgoing_url: string }> = []
  const hooks: Array<{ id: number; url: string }> = []
  let bs = 0
  let hs = 0
  const handler = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.api_access_token !== 'tok') return void ((res.statusCode = 401), res.end('{}'))
    const url = req.url ?? ''
    if (/\/agent_bots$/.test(url)) {
      if (req.method === 'GET') return void res.end(JSON.stringify(bots))
      const b = JSON.parse(body) as { name: string; outgoing_url: string }
      bots.push({ id: ++bs, name: b.name, outgoing_url: b.outgoing_url })
      return void res.end(JSON.stringify(bots[bots.length - 1]))
    }
    if (/\/webhooks$/.test(url)) {
      if (req.method === 'GET') return void res.end(JSON.stringify({ payload: hooks }))
      const w = (JSON.parse(body) as { webhook: { url: string } }).webhook
      hooks.push({ id: ++hs, url: w.url })
      return void res.end(JSON.stringify({ payload: hooks[hooks.length - 1] }))
    }
    res.statusCode = 404
    res.end('{}')
  }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => handler(req, res, body))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    base: `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`,
    count: () => ({ bots: bots.length, hooks: hooks.length }),
  }
}

const TOKEN = 'admin-secret'
const bearer = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

async function start(publicUrl?: string) {
  handle = await createDb(':memory:')
  const config = {
    github: { owner: 'o', repo: 'r' },
    security: { encryptionKey: 'k' },
    budget: { perDay: 1000 },
    runtime: { publicUrl },
  } as unknown as HelpuitConfig
  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('POST /admin/setup/chatwoot (FCW-13)', () => {
  it('creates bot + webhook, and a second run does not duplicate', async () => {
    const cw = await chatwootStub()
    const base = await start('https://helpuit.example.com')
    const body = JSON.stringify({ baseUrl: cw.base, token: 'tok', accountId: 3 })

    const first = await fetch(`${base}/admin/setup/chatwoot`, { method: 'POST', headers: bearer, body })
    expect(first.status).toBe(200)
    expect((await first.json()) as { ok: boolean; created: unknown }).toMatchObject({
      ok: true,
      created: { agentBot: true, webhook: true },
    })

    const second = await fetch(`${base}/admin/setup/chatwoot`, { method: 'POST', headers: bearer, body })
    expect((await second.json()) as { created: unknown }).toMatchObject({ created: { agentBot: false, webhook: false } })
    expect(cw.count()).toEqual({ bots: 1, hooks: 1 })
  })

  it('refuses without HELPUIT_PUBLIC_URL', async () => {
    const cw = await chatwootStub()
    const base = await start(undefined)

    const res = await fetch(`${base}/admin/setup/chatwoot`, {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ baseUrl: cw.base, token: 'tok', accountId: 3 }),
    })
    const json = (await res.json()) as { ok: boolean; detail: string }
    expect(json.ok).toBe(false)
    expect(json.detail).toMatch(/HELPUIT_PUBLIC_URL/)
  })
})
