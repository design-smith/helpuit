import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { EndpointTokenVerifier } from './endpoint.js'
import { createTokenVerifier } from './factory.js'
import { HmacTokenVerifier } from './hmac.js'

let server: Server | undefined
afterEach(() => server?.close())

async function verifyServer(): Promise<string> {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { token } = JSON.parse(body) as { token: string }
      if (req.headers.authorization !== 'Bearer svc-token') {
        res.statusCode = 401
        return res.end('{}')
      }
      res.setHeader('content-type', 'application/json')
      if (token === 'valid') return res.end(JSON.stringify({ userId: 'user-9', accountId: 'acct-9' }))
      res.statusCode = 401
      res.end('{}')
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}/verify`
}

describe('EndpointTokenVerifier', () => {
  it('verifies via a real endpoint and parses the returned identity', async () => {
    const verifyUrl = await verifyServer()
    const verifier = new EndpointTokenVerifier({ verifyUrl, verifyToken: 'svc-token' })
    expect(await verifier.verify('valid')).toEqual({ userId: 'user-9', accountId: 'acct-9' })
  })

  it('returns null when the endpoint rejects the token', async () => {
    const verifyUrl = await verifyServer()
    const verifier = new EndpointTokenVerifier({ verifyUrl, verifyToken: 'svc-token' })
    expect(await verifier.verify('bogus')).toBeNull()
  })
})

describe('createTokenVerifier', () => {
  it('builds an HMAC verifier from config and it actually verifies', async () => {
    const verifier = createTokenVerifier({ mode: 'hmac', secret: 's' })
    expect(verifier).toBeInstanceOf(HmacTokenVerifier)
    const { createHmac } = await import('node:crypto')
    const hash = createHmac('sha256', 's').update('u1').digest('hex')
    expect(await verifier.verify(`u1.${hash}`)).toEqual({ userId: 'u1' })
  })

  it('builds an endpoint verifier from config', () => {
    const verifier = createTokenVerifier({ mode: 'endpoint', verifyUrl: 'https://x/verify' })
    expect(verifier).toBeInstanceOf(EndpointTokenVerifier)
  })
})
