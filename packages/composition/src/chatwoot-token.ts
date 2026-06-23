/** The conversation custom-attribute key the identity resolver reads (must match `extractToken`). */
export const HELPUIT_AUTH_TOKEN_KEY = 'helpuit_auth_token'

export interface ChatwootTokenTarget {
  baseUrl: string
  accountId: number
  apiToken: string
}

/**
 * Set the verified customer token on a Chatwoot conversation (FCW-20): writes it
 * to `custom_attributes.helpuit_auth_token` via the Chatwoot REST API. This is the
 * supported server-side hand-off so the orchestrator can extract + verify the
 * customer's identity on the next message — closing the L2 gating gap. The token
 * must already be a verified, app-issued token (the same kind your verifier checks).
 */
export async function setChatwootAuthToken(
  target: ChatwootTokenTarget,
  input: { conversationId: number; authToken: string },
): Promise<{ ok: boolean; detail: string }> {
  const baseUrl = target.baseUrl.trim().replace(/\/+$/, '')
  if (baseUrl === '' || target.apiToken === '' || !Number.isInteger(target.accountId)) {
    return { ok: false, detail: 'Chatwoot base URL, API token, and account are required.' }
  }
  if (!Number.isInteger(input.conversationId)) {
    return { ok: false, detail: 'A valid conversationId is required.' }
  }

  const url = `${baseUrl}/api/v1/accounts/${target.accountId}/conversations/${input.conversationId}/custom_attributes`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { api_access_token: target.apiToken, 'content-type': 'application/json' },
      body: JSON.stringify({ custom_attributes: { [HELPUIT_AUTH_TOKEN_KEY]: input.authToken } }),
    })
    if (!res.ok) {
      return {
        ok: false,
        detail:
          res.status === 401 || res.status === 403
            ? 'Chatwoot rejected the request — check the API token.'
            : `Chatwoot returned HTTP ${res.status}.`,
      }
    }
    return { ok: true, detail: `Token set on conversation ${input.conversationId}.` }
  } catch (error) {
    return { ok: false, detail: `Could not reach Chatwoot: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Documented widget-side alternative: set the token directly from the customer's
 * browser once your app has verified them (no server round-trip). Drop this where
 * you mint the verified token.
 */
export const CHATWOOT_TOKEN_WIDGET_SNIPPET = `// After your app verifies the customer and mints their Helpuit token:
window.$chatwoot?.setCustomAttributes({ ${HELPUIT_AUTH_TOKEN_KEY}: helpuitToken })
// (Helpuit reads this attribute on the next message to verify the customer.)`
