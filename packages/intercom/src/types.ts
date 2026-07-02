/** Author of a conversation part: `user`/`lead` = customer, `admin`/`bot`/`team` = us. */
export interface IntercomAuthor {
  type?: string
  id?: string | number
}

/** One message in an Intercom conversation. */
export interface IntercomPart {
  part_type?: string
  body?: string
  author?: IntercomAuthor
}

/** A contact reference on a conversation. `external_id` is the merchant-assigned user id. */
export interface IntercomContactRef {
  type?: string
  id?: string
  external_id?: string
}

export interface IntercomConversation {
  id?: string
  /** The opening message (present on conversation.user.created). */
  source?: { body?: string; author?: IntercomAuthor }
  /** Subsequent replies; the newest is last. */
  conversation_parts?: { conversation_parts?: IntercomPart[] }
  /** The conversation's customer contacts (Intercom id + optional merchant external_id). */
  contacts?: { contacts?: IntercomContactRef[] }
}

/** The Intercom webhook notification envelope. */
export interface IntercomWebhookEvent {
  type?: string
  topic?: string
  data?: { item?: IntercomConversation }
}
