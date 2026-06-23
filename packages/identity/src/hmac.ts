import { createHmac, timingSafeEqual } from 'node:crypto'
import type { TokenVerifier, VerifiedIdentity } from './resolver.js'

export interface HmacVerifierOptions {
  secret: string
}

/**
 * HMAC token verifier (Chatwoot-style identity validation). The app passes a
 * token `"<userId>.<hex-hmac>"` where the hmac is HMAC-SHA256(userId, secret).
 * Verification recomputes and compares in constant time. Real crypto, no deps.
 */
export class HmacTokenVerifier implements TokenVerifier {
  constructor(private readonly options: HmacVerifierOptions) {}

  async verify(token: string): Promise<VerifiedIdentity | null> {
    const dot = token.lastIndexOf('.')
    if (dot <= 0 || dot === token.length - 1) return null

    const userId = token.slice(0, dot)
    const provided = token.slice(dot + 1)
    const expected = createHmac('sha256', this.options.secret).update(userId).digest('hex')

    if (provided.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null

    return { userId }
  }
}
