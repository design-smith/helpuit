import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit nonce, the GCM standard
const TAG_LENGTH = 16 // 128-bit auth tag

/**
 * Derive a 32-byte AES-256 key from a founder-configured passphrase of any
 * length. SHA-256 gives a deterministic key so the same passphrase always opens
 * the same data across restarts/instances.
 */
export function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest()
}

/**
 * Authenticated encryption for data at rest. `seal` returns a base64 envelope of
 * `iv | authTag | ciphertext`; `open` verifies the tag (detecting tampering or a
 * wrong key) before returning the plaintext. AES-256-GCM via Node's crypto — no
 * third-party crypto.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox key must be 32 bytes (use deriveKey)')
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, ciphertext]).toString('base64')
  }

  open(sealed: string): string {
    const buf = Buffer.from(sealed, 'base64')
    if (buf.length < IV_LENGTH + TAG_LENGTH) throw new Error('SecretBox: malformed envelope')
    const iv = buf.subarray(0, IV_LENGTH)
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }
}
