import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { createAppJwt, GitHubAppAuth } from './app-auth.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string

function decodeJwt(jwt: string) {
  const [h, p, s] = jwt.split('.')
  return {
    header: JSON.parse(Buffer.from(h!, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p!, 'base64url').toString()),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s!, 'base64url'),
  }
}

describe('createAppJwt', () => {
  it('produces a verifiable RS256 JWT with the app id as issuer', () => {
    const jwt = createAppJwt('12345', PEM, 1_000_000)
    const { header, payload, signingInput, signature } = decodeJwt(jwt)

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(payload.iss).toBe('12345')
    expect(payload.iat).toBeLessThan(payload.exp)
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600) // GitHub caps app JWTs at 10m

    const ok = createVerify('RSA-SHA256').update(signingInput).verify(publicKey, signature)
    expect(ok).toBe(true)
  })
})

describe('GitHubAppAuth.getToken', () => {
  const tokenUrl = '/app/installations/42/access_tokens'

  it('exchanges the app JWT for an installation token and caches it until near expiry', async () => {
    let calls = 0
    const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }) => {
      calls++
      expect(url).toContain(tokenUrl)
      expect(init?.headers?.authorization).toMatch(/^Bearer /) // signed with the app JWT
      return {
        ok: true,
        json: async () => ({ token: `ghs_inst_${calls}`, expires_at: new Date(2_000_000_000_000).toISOString() }),
      }
    }
    const auth = new GitHubAppAuth(
      { appId: '12345', privateKey: PEM, installationId: 42, fetchImpl: fetchImpl as never },
      () => 1_000_000_000,
    )

    expect(await auth.getToken()).toBe('ghs_inst_1')
    expect(await auth.getToken()).toBe('ghs_inst_1') // cached — no second exchange
    expect(calls).toBe(1)
  })

  it('refreshes once the cached token is near expiry', async () => {
    let calls = 0
    const fetchImpl = async () => ({
      ok: true,
      // expires very soon relative to `now`
      json: async () => ({ token: `t${++calls}`, expires_at: new Date(1_000_000_060_000).toISOString() }),
    })
    let now = 1_000_000_000_000
    const auth = new GitHubAppAuth({ appId: '1', privateKey: PEM, installationId: 1, fetchImpl: fetchImpl as never }, () => now)
    expect(await auth.getToken()).toBe('t1')
    now = 1_000_000_055_000 // within the 60s refresh skew of expiry
    expect(await auth.getToken()).toBe('t2')
    expect(calls).toBe(2)
  })
})
