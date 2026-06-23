import type { TokenVerifier, VerifiedIdentity } from './resolver.js'

export interface EndpointVerifierOptions {
  verifyUrl: string
  verifyToken?: string
  useridClaim?: string
}

/**
 * Delegates verification to the app: POSTs the token to a verify endpoint, which
 * returns the verified identity (or a non-2xx for an invalid token).
 */
export class EndpointTokenVerifier implements TokenVerifier {
  private readonly claim: string

  constructor(private readonly options: EndpointVerifierOptions) {
    this.claim = options.useridClaim ?? 'userId'
  }

  async verify(token: string): Promise<VerifiedIdentity | null> {
    let res: Response
    try {
      res = await fetch(this.options.verifyUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.verifyToken !== undefined
            ? { authorization: `Bearer ${this.options.verifyToken}` }
            : {}),
        },
        body: JSON.stringify({ token }),
      })
    } catch {
      return null
    }
    if (!res.ok) return null

    const json = (await res.json()) as Record<string, unknown>
    const userId = json[this.claim]
    if (typeof userId !== 'string') return null
    const accountId = json.accountId
    return { userId, ...(typeof accountId === 'string' ? { accountId } : {}) }
  }
}
