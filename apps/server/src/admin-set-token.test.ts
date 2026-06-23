import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
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

async function chatwootStub(): Promise<{ base: string; attrs: () => Record<string, unknown> }> {
  let stored: Record<string, unknown> = {}
  const handler = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.api_access_token !== 'cw-token') {
      res.statusCode = 401
      res.end('{}')
      return
    }
    if (/\/conversations\/\d+\/custom_attributes$/.test(req.url ?? '')) {
      const parsed = JSON.parse(body) as { custom_attributes?: Record<string, unknown> }
      stored = { ...stored, ...(parsed.custom_attributes ?? {}) }
      res.end(JSON.stringify({ id: 7, custom_attributes: stored }))
      return
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
  return { base: `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`, attrs: () => stored }
}

const SECRET = 'hmac-secret'
const hmacToken = (userId: string) => `${userId}.${createHmac('sha256', SECRET).update(userId).digest('hex')}`
const TOKEN = 'admin-secret'
const json = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

async function start(cwBase: string) {
  handle = await createDb(':memory:')
  const config = {
    chatwoot: { baseUrl: cwBase, accountId: 3, inboxId: 1, apiToken: 'cw-token' },
    github: { owner: 'o', repo: 'r' },
    security: { encryptionKey: 'k' },
    budget: { perDay: 1000 },
  } as unknown as HelpuitConfig
  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

describe('POST /admin/chatwoot/set-token (FCW-20)', () => {
  it('401s without auth and 400s on bad input', async () => {
    const cw = await chatwootStub()
    const base = await start(cw.base)
    expect((await fetch(`${base}/admin/chatwoot/set-token`, { method: 'POST' })).status).toBe(401)
    const bad = await fetch(`${base}/admin/chatwoot/set-token`, { method: 'POST', headers: json, body: JSON.stringify({}) })
    expect(bad.status).toBe(400)
  })

  it('sets the token on the conversation so the orchestrator can extract + verify it', async () => {
    const cw = await chatwootStub()
    const base = await start(cw.base)
    const token = hmacToken('user-9')

    const res = await fetch(`${base}/admin/chatwoot/set-token`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ conversationId: 7, authToken: token }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)

    // Chatwoot now holds the verified token under the key the orchestrator reads,
    // and it's a valid HMAC token for user-9 (verifiable with the same secret).
    const stored = cw.attrs().helpuit_auth_token as string
    const [userId, mac] = stored.split('.')
    expect(userId).toBe('user-9')
    expect(createHmac('sha256', SECRET).update(userId!).digest('hex')).toBe(mac)
  })
})
