import { describe, it, expect } from 'vitest'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import {
  WEAK_DEFAULT_KEY,
  isWeakEncryptionKey,
  generateEncryptionKey,
  generateAdminToken,
} from './keys.js'

describe('setup keys', () => {
  it('generates an encryption key with enough entropy for AES-256 (>=32 bytes)', () => {
    const key = generateEncryptionKey()
    expect(Buffer.from(key, 'base64').length).toBeGreaterThanOrEqual(32)
  })

  it('generates an admin token matching the format the server already uses (48 hex chars)', () => {
    expect(generateAdminToken()).toMatch(/^[0-9a-f]{48}$/)
  })

  it('never repeats a generated key or token', () => {
    expect(generateEncryptionKey()).not.toBe(generateEncryptionKey())
    expect(generateAdminToken()).not.toBe(generateAdminToken())
  })

  it('treats the shipped default, empty, blank, and undefined as weak', () => {
    expect(isWeakEncryptionKey(undefined)).toBe(true)
    expect(isWeakEncryptionKey('')).toBe(true)
    expect(isWeakEncryptionKey('   ')).toBe(true)
    expect(isWeakEncryptionKey(WEAK_DEFAULT_KEY)).toBe(true)
  })

  it('treats a freshly generated key as strong', () => {
    expect(isWeakEncryptionKey(generateEncryptionKey())).toBe(false)
  })

  it('produces a key that really seals and opens a secret through the production crypto', () => {
    const box = new SecretBox(deriveKey(generateEncryptionKey()))
    const sealed = box.seal('CHATWOOT_API_TOKEN=top-secret')
    expect(box.open(sealed)).toBe('CHATWOOT_API_TOKEN=top-secret')
  })
})
