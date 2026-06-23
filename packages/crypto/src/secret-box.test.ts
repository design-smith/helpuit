import { describe, it, expect } from 'vitest'
import { SecretBox, deriveKey } from './secret-box.js'

describe('SecretBox', () => {
  const box = new SecretBox(deriveKey('a-founder-configured-passphrase'))

  it('round-trips a value through seal/open', () => {
    const plaintext = 'customer email jane@example.com — billing broke'
    const sealed = box.seal(plaintext)
    expect(box.open(sealed)).toBe(plaintext)
  })

  it('does not store the plaintext in the sealed envelope (encrypted at rest)', () => {
    const sealed = box.seal('SuperSecret123')
    expect(sealed).not.toContain('SuperSecret123')
  })

  it('produces a different envelope each time (random IV) for the same input', () => {
    expect(box.seal('same')).not.toBe(box.seal('same'))
  })

  it('rejects a tampered envelope (GCM auth tag fails)', () => {
    const sealed = box.seal('integrity matters')
    const bytes = Buffer.from(sealed, 'base64')
    const last = bytes.length - 1
    bytes[last] = (bytes[last] ?? 0) ^ 0xff // flip a bit in the ciphertext
    const tampered = bytes.toString('base64')
    expect(() => box.open(tampered)).toThrow()
  })

  it('cannot be opened with a different key', () => {
    const sealed = box.seal('for my eyes only')
    const other = new SecretBox(deriveKey('a-different-passphrase'))
    expect(() => other.open(sealed)).toThrow()
  })
})
