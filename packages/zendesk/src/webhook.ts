import type { InboundMessage } from '@helpuit/chatwoot'
import type { ZendeskWebhookPayload } from './types.js'

/** Comments can carry HTML — reduce to plain text for grounding. */
function toText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Parse our Zendesk trigger's webhook body into a normalized inbound message, or
 * null if we shouldn't act on it. Loop-safe: only PUBLIC comments authored by an
 * `end-user` (never our own agent/admin replies or internal notes). Trigger
 * placeholders can render values as strings, so accept string/number/bool forms.
 */
export function parseInboundMessage(payload: unknown): InboundMessage | null {
  if (payload === null || typeof payload !== 'object') return null
  const p = payload as ZendeskWebhookPayload

  const isPublic = p.is_public === true || p.is_public === 'true'
  if (!isPublic) return null
  if (p.author_role !== 'end-user') return null

  const conversationId = p.ticket_id === undefined || p.ticket_id === null ? '' : String(p.ticket_id)
  if (conversationId === '') return null

  const content = toText(typeof p.comment === 'string' ? p.comment : '')
  if (content === '') return null

  return { conversationId, content }
}
