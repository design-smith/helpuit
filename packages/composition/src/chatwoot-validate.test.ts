import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { validateChatwoot } from './chatwoot-validate.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

interface StubOpts {
  validToken: string
  accounts?: Array<{ id: number; name: string }>
  inboxes?: Array<{ id: number; name: string }>
}

/** A real Chatwoot-shaped REST server: /api/v1/profile + /accounts/:id/inboxes. */
async function chatwootServer(opts: StubOpts): Promise<string> {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.api_access_token !== opts.validToken) {
      res.statusCode = 401
      res.end(JSON.stringify({ error: 'invalid token' }))
      return
    }
    const url = req.url ?? ''
    if (url.endsWith('/api/v1/profile')) {
      res.end(JSON.stringify({ name: 'Bot Operator', accounts: opts.accounts ?? [{ id: 3, name: 'Acme' }] }))
      return
    }
    if (/\/api\/v1\/accounts\/\d+\/inboxes$/.test(url)) {
      res.end(JSON.stringify({ payload: opts.inboxes ?? [{ id: 2, name: 'Support' }] }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  }
  const server = createServer((req, res) => handler(req, res))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

describe('validateChatwoot', () => {
  it('validates a good token and prefills account + inbox from the API', async () => {
    const base = await chatwootServer({ validToken: 'good-token' })

    const result = await validateChatwoot({ baseUrl: base, token: 'good-token' })

    expect(result.ok).toBe(true)
    expect(result.accountId).toBe(3)
    expect(result.inboxId).toBe(2)
    expect(result.accounts?.[0]?.name).toBe('Acme')
    expect(result.detail).toMatch(/bot operator/i)
  })

  it('distinguishes an invalid token (rejected by Chatwoot) — no prefill', async () => {
    const base = await chatwootServer({ validToken: 'good-token' })

    const result = await validateChatwoot({ baseUrl: base, token: 'wrong-token' })

    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/token rejected/i)
    expect(result.accountId).toBeUndefined()
  })

  it('reports a clear error when Chatwoot is unreachable', async () => {
    const result = await validateChatwoot({ baseUrl: 'http://127.0.0.1:1', token: 'x' })

    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/could not reach/i)
  })

  it('requires both a base URL and a token', async () => {
    expect((await validateChatwoot({ baseUrl: '', token: 'x' })).ok).toBe(false)
    expect((await validateChatwoot({ baseUrl: 'http://x', token: '' })).ok).toBe(false)
  })
})
