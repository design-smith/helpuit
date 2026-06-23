import type { ChatwootClient } from './client.js'
import { parseInboundMessage } from './webhook.js'

/** Placeholder first-line acknowledgement until the guidance agent replaces it (issue 3). */
export const ECHO_REPLY =
  "Thanks for reaching out — I'm looking into this and will reply right here shortly."

/**
 * End-to-end echo handler: parse an inbound webhook payload and, if it's a
 * customer message, post the canned acknowledgement. Returns whether it acted.
 * This is the seam the orchestrator later swaps the guidance agent into.
 */
export async function handleInbound(payload: unknown, client: ChatwootClient): Promise<boolean> {
  const message = parseInboundMessage(payload)
  if (message === null) return false
  await client.sendReply(message.conversationId, ECHO_REPLY)
  return true
}
