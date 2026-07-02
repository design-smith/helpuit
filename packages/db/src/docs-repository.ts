import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { docs } from './schema.js'

/** Where a grounding doc came from. `repo` = re-derived each boot (not persisted here). */
export type DocSource = 'upload' | 'gdrive' | 'dropbox' | 'sharepoint' | 'repo' | 'link'

/** A persisted grounding doc as the console reads it. */
export interface DocRecord {
  id: string
  title: string | null
  text: string
  /** Origin of the doc (null on legacy rows). */
  source: string | null
  /** Stable per-source id (provider file id / filename); the upsert key for re-import. */
  externalId: string | null
  createdAt: number
}

/** Input to persist a pasted/uploaded grounding doc. */
export interface AddDocInput {
  title?: string
  text: string
  source?: DocSource
  externalId?: string
}

type Row = typeof docs.$inferSelect

function toRecord(row: Row): DocRecord {
  return {
    id: row.id,
    title: row.title,
    text: row.text,
    source: row.source,
    externalId: row.externalId,
    createdAt: row.createdAt,
  }
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
      source: input.source ?? null,
      externalId: input.externalId ?? null,
      createdAt: this.now(),
    }
    await this.db.insert(docs).values(row)
    return toRecord(row)
  }

  /**
   * Insert-or-replace a doc keyed by (source, externalId) so re-importing the same
   * file refreshes it in place — same row id — rather than duplicating. The stable
   * id lets the live `DocsIndex` replace by id.
   */
  async upsertBySource(
    source: DocSource,
    externalId: string,
    input: { title?: string; text: string },
  ): Promise<DocRecord> {
    const existing = await this.db
      .select()
      .from(docs)
      .where(and(eq(docs.source, source), eq(docs.externalId, externalId)))
    const prior = existing[0]
    const row: Row = {
      id: prior?.id ?? randomUUID(),
      title: input.title ?? null,
      text: input.text,
      source,
      externalId,
      createdAt: this.now(),
    }
    if (prior === undefined) {
      await this.db.insert(docs).values(row)
    } else {
      await this.db
        .update(docs)
        .set({ title: row.title, text: row.text, createdAt: row.createdAt })
        .where(eq(docs.id, prior.id))
    }
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
