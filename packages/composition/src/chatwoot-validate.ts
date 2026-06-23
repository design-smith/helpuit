export interface ChatwootRef {
  id: number
  name: string
}

export interface ChatwootValidation {
  ok: boolean
  detail: string
  /** Prefill: the first account/inbox the token can see (when available). */
  accountId?: number
  inboxId?: number
  accounts?: ChatwootRef[]
  inboxes?: ChatwootRef[]
}

/**
 * Validate a Chatwoot connection (FCW-12): confirm the API access token works by
 * calling the real Chatwoot REST API (`/api/v1/profile`), and prefill the account
 * + inbox from what the token can see — replacing blind form entry. Takes the URL
 * + token directly (the operator validates BEFORE saving). Never persists.
 */
export async function validateChatwoot(input: { baseUrl: string; token: string }): Promise<ChatwootValidation> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
  const token = input.token.trim()
  if (baseUrl === '' || token === '') {
    return { ok: false, detail: 'Enter the Chatwoot base URL and an API access token.' }
  }

  const headers = { api_access_token: token }
  let profileRes: Response
  try {
    profileRes = await fetch(`${baseUrl}/api/v1/profile`, { headers })
  } catch (error) {
    return { ok: false, detail: `Could not reach Chatwoot: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!profileRes.ok) {
    return {
      ok: false,
      detail:
        profileRes.status === 401 || profileRes.status === 403
          ? 'Token rejected by Chatwoot — check the access token.'
          : `Chatwoot returned HTTP ${profileRes.status}.`,
    }
  }

  const profile = (await profileRes.json().catch(() => ({}))) as { name?: string; accounts?: ChatwootRef[] }
  const accounts = Array.isArray(profile.accounts) ? profile.accounts : []
  const accountId = accounts[0]?.id

  // Inbox prefill is best-effort — a token may validate without inbox access.
  let inboxes: ChatwootRef[] = []
  if (accountId !== undefined) {
    try {
      const inboxRes = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/inboxes`, { headers })
      if (inboxRes.ok) {
        const body = (await inboxRes.json().catch(() => ({}))) as { payload?: ChatwootRef[] }
        if (Array.isArray(body.payload)) inboxes = body.payload
      }
    } catch {
      // ignore — prefill is optional
    }
  }

  return {
    ok: true,
    detail: `Token valid${profile.name !== undefined ? ` — signed in as ${profile.name}` : ''}.`,
    accountId,
    inboxId: inboxes[0]?.id,
    accounts,
    inboxes,
  }
}
