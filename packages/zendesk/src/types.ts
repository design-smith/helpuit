/**
 * The JSON body our Zendesk trigger POSTs to the webhook. We define this shape via
 * the trigger's placeholders (ticket id, latest comment, its public flag, the
 * commenter's role, and the requester's identity). Values may arrive as strings.
 */
export interface ZendeskWebhookPayload {
  ticket_id?: string | number
  comment?: string
  is_public?: boolean | string
  /** The commenter's role: 'end-user' (customer) vs 'agent'/'admin' (us) — loop-safety. */
  author_role?: string
  requester_email?: string
  requester_external_id?: string
  /** Optional per-delivery id for idempotency (e.g. the comment/audit id), when the trigger sets it. */
  event_id?: string
}

/** Connection config: the account API base + agent email + API token (Basic `email/token:token`). */
export interface ZendeskConfig {
  /** e.g. https://acme.zendesk.com/api/v2 */
  baseUrl: string
  email: string
  apiToken: string
}
