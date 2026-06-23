import { eq } from 'drizzle-orm'
import type { SecretBox } from '@helpuit/crypto'
import type { Db } from './client.js'
import { secretVault } from './schema.js'

/** Masked presence of a secret — never includes the value or its length. */
export interface SecretPresence {
  key: string
  isSet: true
  updatedAt: number
}

/**
 * Encrypted secret vault. Values are AES-256-GCM sealed via {@link SecretBox}
 * before they touch the database; plaintext is never stored or logged. The HTTP
 * layer is write-only (`set`/`delete` + masked `presence`) — only the config
 * loader reads plaintext back (`open`/`openAll`) at boot/rebuild.
 */
export class DrizzleSecretVault {
  constructor(
    private readonly db: Db,
    private readonly box: SecretBox,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Seal + upsert a secret value. */
  async set(key: string, plaintext: string): Promise<void> {
    const sealed = this.box.seal(plaintext)
    const at = this.now()
    await this.db
      .insert(secretVault)
      .values({ key, sealed, updatedAt: at })
      .onConflictDoUpdate({ target: secretVault.key, set: { sealed, updatedAt: at } })
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(secretVault).where(eq(secretVault.key, key))
  }

  /** Masked listing for the UI — presence + last-updated only. */
  async presence(): Promise<SecretPresence[]> {
    const rows = await this.db.select().from(secretVault)
    return rows.map((r) => ({ key: r.key, isSet: true as const, updatedAt: r.updatedAt }))
  }

  /**
   * Decrypt all secrets (loader-only). A row that fails to open (e.g. the
   * encryption key was rotated) is skipped, not thrown — so the app still boots
   * and the operator can re-enter it; the caller surfaces the gap.
   */
  async openAll(): Promise<{ secrets: Record<string, string>; unreadable: string[] }> {
    const rows = await this.db.select().from(secretVault)
    const secrets: Record<string, string> = {}
    const unreadable: string[] = []
    for (const row of rows) {
      try {
        secrets[row.key] = this.box.open(row.sealed)
      } catch {
        unreadable.push(row.key)
      }
    }
    return { secrets, unreadable }
  }
}
