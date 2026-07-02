/** A message on a Freshdesk ticket. `incoming` = from the customer; `private` = internal note. */
export interface FreshdeskConversation {
  id?: number
  body?: string
  body_text?: string
  incoming?: boolean
  private?: boolean
  /** The author's contact/agent id. */
  user_id?: number
}

/** A Freshdesk ticket (with conversations when fetched via `include=conversations`). */
export interface FreshdeskTicket {
  id?: number
  /** The opening customer message (HTML / plain text). */
  description?: string
  description_text?: string
  requester_id?: number
  updated_at?: string
  conversations?: FreshdeskConversation[]
}

/** A Freshdesk contact (the ticket requester). `unique_external_id` is the merchant-assigned id. */
export interface FreshdeskContact {
  id?: number
  unique_external_id?: string
  email?: string
}

/** Connection config: the account API base + key (Basic auth `apiKey:X`). */
export interface FreshdeskConfig {
  /** e.g. https://acme.freshdesk.com/api/v2 */
  baseUrl: string
  apiKey: string
}
