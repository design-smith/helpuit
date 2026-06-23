import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { TokenVerifier, VerifiedIdentity } from './resolver.js'

export interface JwtVerifierOptions {
  jwksUrl: string
  useridClaim?: string
  issuer?: string
  audience?: string
}

/**
 * Verifies an app-issued JWT against the app's published JWKS (real signature
 * verification via `jose`). The user id is read from the configured claim.
 */
export class JwtTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>
  private readonly claim: string

  constructor(private readonly options: JwtVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl))
    this.claim = options.useridClaim ?? 'sub'
  }

  async verify(token: string): Promise<VerifiedIdentity | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        ...(this.options.issuer !== undefined ? { issuer: this.options.issuer } : {}),
        ...(this.options.audience !== undefined ? { audience: this.options.audience } : {}),
      })
      const userId = payload[this.claim]
      if (typeof userId !== 'string') return null
      const accountId = payload.accountId
      return { userId, ...(typeof accountId === 'string' ? { accountId } : {}) }
    } catch {
      return null
    }
  }
}
