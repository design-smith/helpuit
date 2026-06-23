import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { IdentityResolver } from './resolver.js'
import { HmacTokenVerifier } from './hmac.js'

function makeToken(userId: string, secret: string): string {
  const hash = createHmac('sha256', secret).update(userId).digest('hex')
  return `${userId}.${hash}`
}

describe('HmacTokenVerifier', () => {
  it('verifies a token whose HMAC matches the shared secret', async () => {
    const secret = 's3cr3t'
    const resolver = new IdentityResolver(new HmacTokenVerifier({ secret }))
    const identity = await resolver.resolve(makeToken('user-42', secret))
    expect(identity).toEqual({ userId: 'user-42' })
  })

  it('rejects a tampered hash and a token signed with the wrong secret', async () => {
    const verifier = new HmacTokenVerifier({ secret: 'right' })
    expect(await verifier.verify(`user-42.${'0'.repeat(64)}`)).toBeNull()
    expect(await verifier.verify(makeToken('user-42', 'wrong'))).toBeNull()
  })

  it('rejects a malformed token', async () => {
    const verifier = new HmacTokenVerifier({ secret: 's' })
    expect(await verifier.verify('no-dot')).toBeNull()
    expect(await verifier.verify('.hashonly')).toBeNull()
    expect(await verifier.verify('userid.')).toBeNull()
  })
})
