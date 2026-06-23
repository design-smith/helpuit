import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from 'jose'
import { JwtTokenVerifier } from './jwt.js'

let server: Server | undefined
afterEach(() => server?.close())

interface Keys {
  privateKey: KeyLike
  jwksUrl: string
}

/** Generate a real RS256 keypair and serve its public JWKS from a real local server. */
async function realJwksServer(kid: string): Promise<Keys> {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  const jwks = { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(jwks))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return { privateKey, jwksUrl: `http://127.0.0.1:${port}/jwks` }
}

describe('JwtTokenVerifier', () => {
  it('verifies a JWT signed by the key in the published JWKS', async () => {
    const kid = 'key-1'
    const { privateKey, jwksUrl } = await realJwksServer(kid)
    const token = await new SignJWT({ accountId: 'acct-1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject('user-7')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(privateKey)

    const verifier = new JwtTokenVerifier({ jwksUrl })
    expect(await verifier.verify(token)).toEqual({ userId: 'user-7', accountId: 'acct-1' })
  })

  it('rejects a JWT signed by a key not in the JWKS', async () => {
    const { jwksUrl } = await realJwksServer('key-1')
    const { privateKey: otherKey } = await generateKeyPair('RS256')
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
      .setSubject('attacker')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(otherKey)

    expect(await new JwtTokenVerifier({ jwksUrl }).verify(forged)).toBeNull()
  })

  it('rejects an expired JWT', async () => {
    const kid = 'key-1'
    const { privateKey, jwksUrl } = await realJwksServer(kid)
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject('user-7')
      .setIssuedAt(0)
      .setExpirationTime(1) // epoch second 1 — long past
      .sign(privateKey)

    expect(await new JwtTokenVerifier({ jwksUrl }).verify(expired)).toBeNull()
  })
})
