/** Subset of a Chatwoot webhook payload we care about for message events. */
export interface ChatwootInboundEvent {
  event?: string
  message_type?: 'incoming' | 'outgoing' | 'template' | string
  content?: string
  conversation?: { id?: number }
  sender?: { id?: number; identifier?: string }
  [k: string]: unknown
}

/** Normalized inbound customer message extracted from a webhook payload. */
export interface InboundMessage {
  conversationId: string
  content: string
}
