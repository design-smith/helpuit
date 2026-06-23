import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { IdentityResolver, createTokenVerifier, extractToken } from '@helpuit/identity'
import { setChatwootAuthToken } from './chatwoot-token.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

/** A real, stateful Chatwoot stub storing per-conversation custom attributes. */
async function chatwootStub(validToken = 'cw'): Promise<{ base: string; attrs: () => Record<string, unknown> }> {
  let stored: Record<string, unknown> = {}
  const handler = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.api_access_token !== validToken) {
      res.statusCode = 401
      res.end('{}')
      return
    }
    if (/\/conversations\/\d+\/custom_attributes$/.test(req.url ?? '') && req.method === 'POST') {
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

describe('setChatwootAuthToken', () => {
  it('writes the token into the conversation custom_attributes via the Chatwoot API', async () => {
    const cw = await chatwootStub()

    const result = await setChatwootAuthToken(
      { baseUrl: cw.base, accountId: 3, apiToken: 'cw' },
      { conversationId: 7, authToken: hmacToken('user-1') },
    )

    expect(result.ok).toBe(true)
    expect(cw.attrs().helpuit_auth_token).toBe(hmacToken('user-1'))
  })

  it('reports a clear failure when Chatwoot rejects the token', async () => {
    const cw = await chatwootStub('cw')
    const result = await setChatwootAuthToken(
      { baseUrl: cw.base, accountId: 3, apiToken: 'WRONG' },
      { conversationId: 7, authToken: 'x' },
    )
    expect(result.ok).toBe(false)
  })

  it('end-to-end: a token set this way is extracted and verified the way the orchestrator does', async () => {
    const cw = await chatwootStub()
    const token = hmacToken('user-42')

    await setChatwootAuthToken({ baseUrl: cw.base, accountId: 3, apiToken: 'cw' }, { conversationId: 7, authToken: token })

    // What Chatwoot now holds is exactly what a future message webhook delivers.
    const context = { customAttributes: cw.attrs() }
    const extracted = extractToken(context)
    expect(extracted).toBe(token)

    const identity = await new IdentityResolver(createTokenVerifier({ mode: 'hmac', secret: SECRET })).resolve(extracted)
    expect(identity).toEqual({ userId: 'user-42' })
  })
})
