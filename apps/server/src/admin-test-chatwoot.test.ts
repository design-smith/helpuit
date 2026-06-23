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

async function chatwootServer(): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.api_access_token !== 'good') {
      res.statusCode = 401
      res.end('{}')
      return
    }
    const url = req.url ?? ''
    if (url.endsWith('/api/v1/profile')) {
      res.end(JSON.stringify({ name: 'Op', accounts: [{ id: 9, name: 'Acme' }] }))
    } else if (/\/inboxes$/.test(url)) {
      res.end(JSON.stringify({ payload: [{ id: 4, name: 'Support' }] }))
    } else {
      res.statusCode = 404
      res.end('{}')
    }
  }
  const server = createServer((req, res) => handler(req, res))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

const TOKEN = 'admin-secret'
const config = { github: { owner: 'o', repo: 'r' }, security: { encryptionKey: 'k' }, budget: { perDay: 1000 } } as unknown as HelpuitConfig

async function start() {
  handle = await createDb(':memory:')
  const api = buildAdminApi(config, { db: handle.db })
  app = buildServer({ admin: { token: TOKEN, api } })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

async function post(base: string, body: unknown) {
  return fetch(`${base}/admin/test/chatwoot`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /admin/test/chatwoot (FCW-12)', () => {
  it('401s without auth', async () => {
    const base = await start()
    expect((await fetch(`${base}/admin/test/chatwoot`, { method: 'POST' })).status).toBe(401)
  })

  it('validates a good token and prefills account + inbox', async () => {
    const cw = await chatwootServer()
    const base = await start()

    const res = await post(base, { baseUrl: cw, token: 'good' })
    expect(res.status).toBe(200)
    expect((await res.json()) as { ok: boolean; accountId: number; inboxId: number }).toMatchObject({
      ok: true,
      accountId: 9,
      inboxId: 4,
    })
  })

  it('rejects a bad token (green/red distinguished)', async () => {
    const cw = await chatwootServer()
    const base = await start()

    const res = await post(base, { baseUrl: cw, token: 'nope' })
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false)
  })
})
