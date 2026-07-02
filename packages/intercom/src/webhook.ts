import type { InboundMessage } from '@helpuit/chatwoot'
import type { IntercomWebhookEvent } from './types.js'

/** Topics fired by a customer (contact); admin/bot/operator topics are our own posts. */
const CUSTOMER_TOPICS = new Set(['conversation.user.created', 'conversation.user.replied'])

/** Intercom bodies are HTML — reduce to plain text for grounding. */
function toText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Parse an Intercom webhook into a normalized inbound customer message, or null
 * if we shouldn't act on it. Loop-safe two ways: only customer topics, and the
 * triggering message's author must be `user`/`lead` (never our `admin`/`bot`).
 */
export function parseInboundMessage(payload: unknown): InboundMessage | null {
  if (payload === null || typeof payload !== 'object') return null
  const event = payload as IntercomWebhookEvent

  if (!CUSTOMER_TOPICS.has(event.topic ?? '')) return null
  const item = event.data?.item
  if (item === undefined) return null
  if (typeof item.id !== 'string' || item.id === '') return null

  // The triggering message: the newest reply part, else the opening `source`.
  const parts = item.conversation_parts?.conversation_parts ?? []
  const message = parts.length > 0 ? parts[parts.length - 1] : item.source
  if (message === undefined) return null

  const authorType = message.author?.type
  if (authorType !== 'user' && authorType !== 'lead') return null

  const content = toText(typeof message.body === 'string' ? message.body : '')
  if (content === '') return null

  return { conversationId: item.id, content }
}

/**
 * The customer's merchant-side user id (`external_id`) from a conversation webhook,
 * or undefined when none is present. This is trusted as the verified identity ONLY
 * because Intercom's Identity Verification signs it at Messenger boot — see the
 * connection wiring. No external_id (IV off / anonymous lead) → no identity.
 */
export function extractExternalId(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined
  const contacts = (payload as IntercomWebhookEvent).data?.item?.contacts?.contacts ?? []
  for (const contact of contacts) {
    if (typeof contact.external_id === 'string' && contact.external_id !== '') return contact.external_id
  }
  return undefined
}
