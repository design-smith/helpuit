import { describe, it, expect } from 'vitest'
import {
  IdentityResolver,
  extractToken,
  gateAccess,
  type TokenVerifier,
  type VerifiedIdentity,
} from './resolver.js'

function fakeVerifier(valid: Record<string, VerifiedIdentity>): TokenVerifier {
  return { verify: async (token) => valid[token] ?? null }
}

describe('IdentityResolver', () => {
  const resolver = new IdentityResolver(
    fakeVerifier({ 'good-token': { userId: 'u1', accountId: 'a1' } }),
  )

  it('resolves a valid token to a verified identity', async () => {
    expect(await resolver.resolve('good-token')).toEqual({ userId: 'u1', accountId: 'a1' })
  })

  it('returns null for an invalid token', async () => {
    expect(await resolver.resolve('forged')).toBeNull()
  })

  it('returns null for a missing or empty token (never trusts absence)', async () => {
    expect(await resolver.resolve(undefined)).toBeNull()
    expect(await resolver.resolve('   ')).toBeNull()
  })
})

describe('extractToken', () => {
  it('reads the token from conversation custom attributes', () => {
    expect(extractToken({ customAttributes: { helpuit_auth_token: 'tok-1' } })).toBe('tok-1')
  })

  it('returns undefined when absent or non-string', () => {
    expect(extractToken({ customAttributes: {} })).toBeUndefined()
    expect(extractToken({ customAttributes: { helpuit_auth_token: 123 } })).toBeUndefined()
    expect(extractToken({})).toBeUndefined()
  })
})

describe('gateAccess', () => {
  const identity: VerifiedIdentity = { userId: 'u1' }

  it('grants access to a verified identity', () => {
    expect(gateAccess({ identity, allowAnonymous: false })).toEqual({
      access: 'granted',
      identity,
      reason: null,
    })
  })

  it('denies access with a login prompt when there is no identity and anonymous is off', () => {
    const decision = gateAccess({ identity: null, allowAnonymous: false })
    expect(decision.access).toBe('denied')
    expect(decision.reason).toMatch(/log in/i)
  })

  it('allows anonymous access when the founder permits it', () => {
    expect(gateAccess({ identity: null, allowAnonymous: true }).access).toBe('anonymous')
  })
})
