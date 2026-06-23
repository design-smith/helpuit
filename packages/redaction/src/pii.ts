/**
 * PII / secret scrubbing for free text and arbitrary structures.
 *
 * Intentionally conservative about what it matches: high-confidence patterns
 * (emails, JWTs, bearer tokens) so we don't mangle benign support text. The
 * sensitive-header/param redaction for HAR lives in `har.ts`.
 */

export const REDACTED = '[REDACTED]'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi

/** Redact high-confidence secrets/PII from a string. */
export function scrubText(input: string): string {
  return input
    .replace(JWT, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(EMAIL, REDACTED)
}

/** Recursively scrub all strings in a value, preserving structure and non-strings. */
export function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubText(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as unknown as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) out[key] = scrubDeep(v)
    return out as T
  }
  return value
}
