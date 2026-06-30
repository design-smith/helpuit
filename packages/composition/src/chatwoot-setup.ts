export interface ChatwootSetupResult {
  ok: boolean
  detail: string
  agentBotId?: number
  webhookId?: number
  /** Whether each resource was newly created (false = an existing one was reused). */
  created: { agentBot: boolean; webhook: boolean }
}

const BOT_NAME = 'Helpuit'
const SUBSCRIPTIONS = ['message_created', 'conversation_created']

interface CwBot {
  id?: number
  name?: string
  outgoing_url?: string
}
interface CwHook {
  id?: number
  url?: string
}

function asArray<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[]
  if (json !== null && typeof json === 'object' && Array.isArray((json as { payload?: unknown }).payload)) {
    return (json as { payload: T[] }).payload
  }
  return []
}

function idOf(json: unknown): number | undefined {
  if (json !== null && typeof json === 'object') {
    const obj = json as { id?: unknown; payload?: { id?: unknown } }
    if (typeof obj.id === 'number') return obj.id
    if (obj.payload !== undefined && typeof obj.payload.id === 'number') return obj.payload.id
  }
  return undefined
}

const fail = (detail: string): ChatwootSetupResult => ({ ok: false, detail, created: { agentBot: false, webhook: false } })

/**
 * Auto-setup a Chatwoot account for Helpuit (FCW-13): create the Agent Bot and
 * register the webhook (pointed at `${publicUrl}/webhooks/chatwoot`) via the REST
 * API — removing the manual Chatwoot-UI steps. Idempotent: an existing bot (by
 * name) or webhook (by URL) is reused, never duplicated. Requires a public URL.
 */
export async function autoSetupChatwoot(input: {
  baseUrl: string
  token: string
  accountId: number
  publicUrl: string
}): Promise<ChatwootSetupResult> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
  const publicUrl = input.publicUrl.trim().replace(/\/+$/, '')
  if (publicUrl === '') {
    return fail('Set HELPUIT_PUBLIC_URL first — the Chatwoot webhook must point at a publicly reachable URL.')
  }
  if (baseUrl === '' || input.token.trim() === '' || !Number.isInteger(input.accountId)) {
    return fail('Chatwoot base URL, API token, and account are required (validate the connection first).')
  }

  const webhookUrl = `${publicUrl}/webhooks/chatwoot`
  const acct = `${baseUrl}/api/v1/accounts/${input.accountId}`
  const headers = { api_access_token: input.token, 'content-type': 'application/json' }

  // A 401/403 almost always means the wrong token (or a non-admin one), so say how
  // to fix it rather than leaking a raw status. Agent bots/webhooks need an admin's
  // Personal Access Token for THIS account.
  const reason = (verb: string, path: string, status: number): string =>
    status === 401 || status === 403
      ? `Chatwoot rejected the request (${status}). Use an Administrator's Personal Access Token — in Chatwoot, ` +
        `click your avatar (bottom-left) → Profile Settings → scroll to "Access Token" → copy. Confirm the Account ID ` +
        `matches that admin's account (use "Validate & prefill"), and that the Base URL is your Chatwoot instance.`
      : `Chatwoot ${verb} ${path} failed: HTTP ${status}`

  const getJson = async (path: string): Promise<unknown> => {
    const res = await fetch(`${acct}/${path}`, { headers })
    if (!res.ok) throw new Error(reason('GET', path, res.status))
    return res.json()
  }
  const postJson = async (path: string, payload: unknown): Promise<unknown> => {
    const res = await fetch(`${acct}/${path}`, { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!res.ok) throw new Error(reason('POST', path, res.status))
    return res.json()
  }

  try {
    // Agent bot — idempotent by name (or an existing one already pointed at us).
    const bots = asArray<CwBot>(await getJson('agent_bots'))
    const existingBot = bots.find((b) => b.name === BOT_NAME || b.outgoing_url === webhookUrl)
    let agentBotId = existingBot?.id
    const createdBot = existingBot === undefined
    if (createdBot) {
      agentBotId = idOf(
        await postJson('agent_bots', { name: BOT_NAME, description: 'Helpuit support agent', outgoing_url: webhookUrl }),
      )
    }

    // Webhook — idempotent by URL.
    const hooks = asArray<CwHook>(await getJson('webhooks'))
    const existingHook = hooks.find((w) => w.url === webhookUrl)
    let webhookId = existingHook?.id
    const createdHook = existingHook === undefined
    if (createdHook) {
      webhookId = idOf(await postJson('webhooks', { webhook: { url: webhookUrl, subscriptions: SUBSCRIPTIONS } }))
    }

    return {
      ok: true,
      detail: `Agent bot ${createdBot ? 'created' : 'reused'} (#${agentBotId}); webhook ${createdHook ? 'created' : 'reused'} → ${webhookUrl}.`,
      agentBotId,
      webhookId,
      created: { agentBot: createdBot, webhook: createdHook },
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}
