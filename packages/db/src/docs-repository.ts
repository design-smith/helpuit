import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { docs } from './schema.js'

/** A persisted grounding doc as the console reads it. */
export interface DocRecord {
  id: string
  title: string | null
  text: string
  createdAt: number
}

/** Input to persist a pasted/uploaded grounding doc. */
export interface AddDocInput {
  title?: string
  text: string
}

type Row = typeof docs.$inferSelect

function toRecord(row: Row): DocRecord {
  return { id: row.id, title: row.title, text: row.text, createdAt: row.createdAt }
}

/**
 * Drizzle/SQLite-backed store for operator-ingested grounding docs (FCW-04).
 * These feed the L1 `DocsIndex`; persisting them means they survive restarts and
 * can be re-ingested at boot.
 */
export class DrizzleDocsRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async add(input: AddDocInput): Promise<DocRecord> {
    const row: Row = {
      id: randomUUID(),
      title: input.title ?? null,
      text: input.text,
      createdAt: this.now(),
    }
    await this.db.insert(docs).values(row)
    return toRecord(row)
  }

  async list(): Promise<DocRecord[]> {
    const rows = await this.db.select().from(docs).orderBy(desc(docs.createdAt))
    return rows.map(toRecord)
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.db.delete(docs).where(eq(docs.id, id)).returning({ id: docs.id })
    return deleted.length > 0
  }
}
