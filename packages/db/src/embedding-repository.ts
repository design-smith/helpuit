import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { embeddings } from './schema.js'

export interface EmbeddingChunk {
  seq: number
  text: string
  vector: Float32Array
  model: string
}

export interface EmbeddingRow extends EmbeddingChunk {
  ownerKind: string
  ownerId: string
}

const toBuffer = (v: Float32Array): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength)
const toVector = (b: Buffer): Float32Array => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)

/**
 * Chunk-embedding store for the semantic index. One table serves every namespace
 * (docs, GitHub issues, cases) via `ownerKind`. Replace-by-owner keeps re-imports
 * dupe-free — the same contract the docs store's upsert follows.
 */
export class DrizzleEmbeddingRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async replaceForOwner(ownerKind: string, ownerId: string, chunks: EmbeddingChunk[]): Promise<void> {
    await this.removeOwner(ownerKind, ownerId)
    if (chunks.length === 0) return
    await this.db.insert(embeddings).values(
      chunks.map((c) => ({
        id: randomUUID(),
        ownerKind,
        ownerId,
        seq: c.seq,
        text: c.text,
        vec: toBuffer(c.vector),
        model: c.model,
        updatedAt: this.now(),
      })),
    )
  }

  async loadKind(ownerKind: string): Promise<EmbeddingRow[]> {
    const rows = await this.db.select().from(embeddings).where(eq(embeddings.ownerKind, ownerKind))
    return rows.map((r) => ({
      ownerKind: r.ownerKind,
      ownerId: r.ownerId,
      seq: r.seq,
      text: r.text,
      vector: toVector(r.vec as Buffer),
      model: r.model,
    }))
  }

  async removeOwner(ownerKind: string, ownerId: string): Promise<void> {
    await this.db.delete(embeddings).where(and(eq(embeddings.ownerKind, ownerKind), eq(embeddings.ownerId, ownerId)))
  }
}
