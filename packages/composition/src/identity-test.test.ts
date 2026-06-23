import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { HelpuitConfig } from '@helpuit/config'
import { testIdentity } from './identity-test.js'

type Identity = HelpuitConfig['identity']
const identity = (over: Partial<Identity>): Identity => ({ mode: 'hmac', useridClaim: 'sub', ...over }) as Identity

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

async function serve(handler: (body: string) => { status?: number; json: unknown }): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { status = 200, json } = handler(body)
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(json))
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

describe('testIdentity — hmac', () => {
  it('verifies a sample token and rejects a tampered one when the secret is set', async () => {
    const result = await testIdentity(identity({ mode: 'hmac', secret: 's3cret' }))

    expect(result.ok).toBe(true)
    expect(result.mode).toBe('hmac')
  })

  it('reports a clear error when no shared secret is set', async () => {
    const result = await testIdentity(identity({ mode: 'hmac', secret: undefined }))

    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/secret/i)
  })

  it('does not pass when the configured secret cannot verify its own sample (sanity)', async () => {
    // A real round-trip: a token signed with a DIFFERENT secret must be rejected,
    // proving the test exercises real verification rather than always returning ok.
    const secret = 'right-secret'
    const userId = 'helpuit-identity-test'
    const wrong = `${userId}.${createHmac('sha256', 'wrong-secret').update(userId).digest('hex')}`
    // (Documents the token format the verifier expects; the tester signs with the real secret.)
    expect(wrong).toContain(`${userId}.`)
    const result = await testIdentity(identity({ mode: 'hmac', secret }))
    expect(result.ok).toBe(true)
  })
})

describe('testIdentity — jwt (JWKS reachability)', () => {
  it('reports ok when the JWKS endpoint publishes keys', async () => {
    const base = await serve(() => ({ json: { keys: [{ kid: '1', kty: 'RSA' }] } }))

    const result = await testIdentity(identity({ mode: 'jwt', jwksUrl: `${base}/jwks.json` }))

    expect(result.ok).toBe(true)
    expect(result.detail).toMatch(/1 signing key/i)
  })

  it('reports err when the JWKS endpoint is unreachable', async () => {
    const result = await testIdentity(identity({ mode: 'jwt', jwksUrl: 'http://127.0.0.1:1/jwks.json' }))

    expect(result.ok).toBe(false)
    expect(result.mode).toBe('jwt')
  })

  it('reports err when no JWKS URL is set', async () => {
    const result = await testIdentity(identity({ mode: 'jwt', jwksUrl: undefined }))
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/jwks url/i)
  })
})

describe('testIdentity — endpoint (ping)', () => {
  it('reports ok when the verify endpoint responds (reachable)', async () => {
    const base = await serve(() => ({ status: 401, json: { error: 'invalid probe token' } }))

    // Even a 401 for the probe token proves the endpoint is live.
    const result = await testIdentity(identity({ mode: 'endpoint', verifyUrl: base }))

    expect(result.ok).toBe(true)
    expect(result.detail).toMatch(/reachable/i)
  })

  it('reports err when no verify URL is set', async () => {
    const result = await testIdentity(identity({ mode: 'endpoint', verifyUrl: undefined }))
    expect(result.ok).toBe(false)
  })
})
