import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify an Intercom webhook `X-Hub-Signature` header — `sha1=` + the hex
 * HMAC-SHA1 of the RAW request body, keyed with the app's client secret.
 * (Intercom uses SHA1 here; the Identity-Verification `user_hash` is SHA256 —
 * don't conflate them.)
 */
export function verifyIntercomSignature(
  rawBody: string,
  clientSecret: string,
  header: string | undefined,
): boolean {
  if (typeof header !== 'string' || !header.startsWith('sha1=')) return false
  const expected = createHmac('sha1', clientSecret).update(rawBody).digest('hex')
  const got = header.slice('sha1='.length)
  if (got.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected))
}
