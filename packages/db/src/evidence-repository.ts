import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { SecretBox } from '@helpuit/crypto'
import type { Db } from './client.js'
import { evidenceArtifacts } from './schema.js'

export type RedactionStatus = 'raw' | 'redacted'

export interface EvidenceArtifactInput {
  investigationId: string
  /** Artifact kind: screenshot | har | log | snapshot | … */
  type: string
  /** Sensitive payload — encrypted at rest before it touches the database. */
  content: string
  redactionStatus: RedactionStatus
}

export interface EvidenceArtifactRecord {
  id: string
  investigationId: string
  type: string
  redactionStatus: string
  /** Decrypted content. */
  content: string
  createdAt: number
}

/** Evidence metadata WITHOUT the (encrypted) content — listable without decryption. */
export interface EvidenceArtifactMeta {
  id: string
  investigationId: string
  type: string
  redactionStatus: string
  createdAt: number
}

/**
 * Stores investigation evidence (screenshots, HAR, logs, account snapshots) with
 * the `content` column encrypted via {@link SecretBox} — enforcing the invariant
 * that no sensitive customer-derived data is ever written to the DB in plaintext.
 * Reads transparently decrypt.
 */
export class DrizzleEvidenceArtifacts {
  constructor(
    private readonly db: Db,
    private readonly box: SecretBox,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async save(input: EvidenceArtifactInput): Promise<string> {
    const id = randomUUID()
    await this.db.insert(evidenceArtifacts).values({
      id,
      investigationId: input.investigationId,
      type: input.type,
      redactionStatus: input.redactionStatus,
      content: this.box.seal(input.content),
      createdAt: this.now(),
    })
    return id
  }

  async get(id: string): Promise<EvidenceArtifactRecord | null> {
    const rows = await this.db.select().from(evidenceArtifacts).where(eq(evidenceArtifacts.id, id))
    const row = rows[0]
    return row === undefined ? null : this.decode(row)
  }

  async listForInvestigation(investigationId: string): Promise<EvidenceArtifactRecord[]> {
    const rows = await this.db
      .select()
      .from(evidenceArtifacts)
      .where(eq(evidenceArtifacts.investigationId, investigationId))
    return rows.map((row) => this.decode(row))
  }

  /**
   * List artifact METADATA for an investigation without decrypting content — for
   * the console list view (full content is fetched one-at-a-time through `get`).
   * Safe even when the encryption key is unavailable.
   */
  async listMetaForInvestigation(investigationId: string): Promise<EvidenceArtifactMeta[]> {
    return this.db
      .select({
        id: evidenceArtifacts.id,
        investigationId: evidenceArtifacts.investigationId,
        type: evidenceArtifacts.type,
        redactionStatus: evidenceArtifacts.redactionStatus,
        createdAt: evidenceArtifacts.createdAt,
      })
      .from(evidenceArtifacts)
      .where(eq(evidenceArtifacts.investigationId, investigationId))
  }

  private decode(row: typeof evidenceArtifacts.$inferSelect): EvidenceArtifactRecord {
    return {
      id: row.id,
      investigationId: row.investigationId,
      type: row.type,
      redactionStatus: row.redactionStatus,
      content: row.content === null ? '' : this.box.open(row.content),
      createdAt: row.createdAt,
    }
  }
}
