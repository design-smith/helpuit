import { randomBytes } from 'node:crypto'

/** The guessable literal `HELPUIT_ENCRYPTION_KEY` defaults to in `main.ts` when unset. */
export const WEAK_DEFAULT_KEY = 'helpuit-default-dev-key'

/**
 * Encryption keys we refuse to treat as real: the shipped default plus the usual
 * placeholders people paste in and forget. Used to decide whether to GENERATE a
 * key (it's weak → replace it) vs PRESERVE an operator's intentional one (it's
 * not on this list → never overwrite).
 */
export const WEAK_ENCRYPTION_KEYS: ReadonlySet<string> = new Set([
  WEAK_DEFAULT_KEY,
  'changeme',
  'change-me',
  'secret',
  'password',
])

/**
 * Is this encryption key weak — i.e. should the wizard generate a strong one?
 * Unset, blank, or a known placeholder are weak; anything else is the operator's
 * deliberate key and must be left untouched (rotating it makes the vault +
 * stored evidence unreadable).
 */
export function isWeakEncryptionKey(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim()
  return trimmed === '' || WEAK_ENCRYPTION_KEYS.has(trimmed)
}

/**
 * A strong encryption passphrase for sealing the secret vault: 48 random bytes,
 * base64 — well past the 32 bytes `deriveKey` needs for AES-256. Equivalent to
 * the `openssl rand -base64 48` the docs suggest, without leaving the process.
 */
export function generateEncryptionKey(): string {
  return randomBytes(48).toString('base64')
}

/** A strong operator-console admin token — same shape `resolveAdminToken` generates. */
export function generateAdminToken(): string {
  return randomBytes(24).toString('hex')
}
