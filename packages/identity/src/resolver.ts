export interface VerifiedIdentity {
  userId: string
  accountId?: string
}

/** Verifies an app-issued token (HMAC/JWT/endpoint). Async — real verifiers do crypto/network. */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity | null>
}

/**
 * Resolves a passed token to a verified identity. The token is the *only*
 * trusted identity source — a customer asserting an id in chat is never trusted
 * (that binding is what keeps account-investigation queries scoped, issue 32).
 */
export class IdentityResolver {
  constructor(private readonly verifier: TokenVerifier) {}

  async resolve(token: string | undefined): Promise<VerifiedIdentity | null> {
    if (token === undefined || token.trim() === '') return null
    return this.verifier.verify(token)
  }
}

export interface ConversationContext {
  customAttributes?: Record<string, unknown>
}

const DEFAULT_TOKEN_KEY = 'helpuit_auth_token'

/** Extract the auth token from a conversation's custom attributes (issue 10). */
export function extractToken(
  context: ConversationContext,
  key: string = DEFAULT_TOKEN_KEY,
): string | undefined {
  const value = context.customAttributes?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

export type Access = 'granted' | 'anonymous' | 'denied'

export interface AccessDecision {
  access: Access
  identity: VerifiedIdentity | null
  reason: string | null
}

export interface GateInput {
  identity: VerifiedIdentity | null
  allowAnonymous: boolean
}

/**
 * Decide access (issues 11, 13). A verified identity → granted. No identity:
 * `anonymous` when the founder allows it (guidance only — never account
 * investigation), otherwise `denied` with a login prompt.
 */
export function gateAccess({ identity, allowAnonymous }: GateInput): AccessDecision {
  if (identity !== null) {
    return { access: 'granted', identity, reason: null }
  }
  if (allowAnonymous) {
    return { access: 'anonymous', identity: null, reason: null }
  }
  return { access: 'denied', identity: null, reason: 'Please log in to continue.' }
}
