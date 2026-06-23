import type { ChatwootInboundEvent, InboundMessage } from './types.js'

/**
 * Parse a Chatwoot webhook payload into a normalized inbound customer message,
 * or `null` if it isn't one we should act on (issue 1).
 *
 * We only act on customer-originated (`incoming`) messages with real content on
 * a known conversation — outgoing/bot/template events and empty content are
 * ignored so the agent never replies to itself.
 */
export function parseInboundMessage(payload: unknown): InboundMessage | null {
  if (payload === null || typeof payload !== 'object') return null
  const event = payload as ChatwootInboundEvent

  if (event.message_type !== 'incoming') return null
  if (typeof event.content !== 'string' || event.content.trim() === '') return null

  const conversationId = event.conversation?.id
  if (typeof conversationId !== 'number') return null

  return { conversationId, content: event.content }
}
