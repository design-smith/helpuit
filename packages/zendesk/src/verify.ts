import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify a Zendesk webhook signature: `base64(HMAC-SHA256(timestamp + rawBody))`
 * keyed with the webhook's signing secret, compared against the
 * `X-Zendesk-Webhook-Signature` header (its timestamp is `X-Zendesk-Webhook-Signature-Timestamp`).
 */
export function verifyZendeskSignature(
  rawBody: string,
  timestamp: string | undefined,
  secret: string,
  signature: string | undefined,
): boolean {
  if (typeof signature !== 'string' || typeof timestamp !== 'string') return false
  const expected = createHmac('sha256', secret).update(timestamp + rawBody).digest('base64')
  if (signature.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
