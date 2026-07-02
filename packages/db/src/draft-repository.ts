import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { normalizeListOptions, type ListOptions, type Page } from '@helpuit/contracts'
import type { Db } from './client.js'
import { issueDrafts } from './schema.js'

export type DraftStatus = 'pending' | 'published' | 'rejected'

/** A persisted escalation draft as the console reads it (labels parsed from JSON). */
export interface IssueDraftRecord {
  id: string
  investigationId: string
  conversationId: string
  title: string
  body: string
  labels: string[]
  severity: string
  signature: string | null
  openMatchIssue: number | null
  status: DraftStatus
  issueNumber: number | null
  issueUrl: string | null
  rejectionReason: string | null
  createdAt: number
  decidedAt: number | null
}

/** Input to persist a freshly-drafted (pending) issue. */
export interface SaveDraftInput {
  investigationId: string
  conversationId: string
  title: string
  body: string
  labels: string[]
  severity: string
  signature?: string
  openMatchIssue?: number
}

export interface DraftListFilter {
  status?: DraftStatus
  investigationId?: string
}

type Row = typeof issueDrafts.$inferSelect

function toRecord(row: Row): IssueDraftRecord {
  return {
    id: row.id,
    investigationId: row.investigationId,
    conversationId: row.conversationId,
    title: row.title,
    body: row.body,
    labels: JSON.parse(row.labels) as string[],
    severity: row.severity,
    signature: row.signature,
    openMatchIssue: row.openMatchIssue,
    status: row.status as DraftStatus,
    issueNumber: row.issueNumber,
    issueUrl: row.issueUrl,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  }
}

/**
 * Store for escalation issue drafts held for founder approval. `markPublished`
 * and `markRejected` use a conditional `UPDATE ... WHERE status='pending'` (the
 * same race-guard idiom as the job queue's claim): two concurrent decisions on
 * the same draft can't both win — the loser gets `null`, which the API surfaces
 * as a 409.
 */
export class DrizzleDraftRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async save(input: SaveDraftInput): Promise<IssueDraftRecord> {
    const row: Row = {
      id: randomUUID(),
      investigationId: input.investigationId,
      conversationId: input.conversationId,
      title: input.title,
      body: input.body,
      labels: JSON.stringify(input.labels),
      severity: input.severity,
      signature: input.signature ?? null,
      openMatchIssue: input.openMatchIssue ?? null,
      status: 'pending',
      issueNumber: null,
      issueUrl: null,
      rejectionReason: null,
      createdAt: this.now(),
      decidedAt: null,
    }
    await this.db.insert(issueDrafts).values(row)
    return toRecord(row)
  }

  async get(id: string): Promise<IssueDraftRecord | null> {
    const rows = await this.db.select().from(issueDrafts).where(eq(issueDrafts.id, id))
    const row = rows[0]
    return row === undefined ? null : toRecord(row)
  }

  /** Paginated, filtered list (newest first). Defaults to pending drafts. */
  async list(filter: DraftListFilter = {}, options: ListOptions = {}): Promise<Page<IssueDraftRecord>> {
    const { limit, offset } = normalizeListOptions(options)
    const conditions: SQL[] = []
    if (filter.status !== undefined) conditions.push(eq(issueDrafts.status, filter.status))
    if (filter.investigationId !== undefined)
      conditions.push(eq(issueDrafts.investigationId, filter.investigationId))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await this.db
      .select()
      .from(issueDrafts)
      .where(where)
      .orderBy(desc(issueDrafts.createdAt))
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db.select({ n: sql<number>`count(*)` }).from(issueDrafts).where(where)
    return { items: rows.map(toRecord), total: Number(totalRows[0]?.n ?? 0) }
  }

  /**
   * Mark a pending draft published. Returns the updated record, or `null` if the
   * draft was already decided (lost the race / not found) — the publish guard.
   */
  async markPublished(
    id: string,
    issueNumber: number,
    issueUrl: string,
  ): Promise<IssueDraftRecord | null> {
    const result = await this.db
      .update(issueDrafts)
      .set({ status: 'published', issueNumber, issueUrl, decidedAt: this.now() })
      .where(and(eq(issueDrafts.id, id), eq(issueDrafts.status, 'pending')))
      .returning()
    const row = result[0]
    return row === undefined ? null : toRecord(row)
  }

  /** Mark a pending draft rejected. Returns `null` if already decided / not found. */
  async markRejected(id: string, reason?: string): Promise<IssueDraftRecord | null> {
    const result = await this.db
      .update(issueDrafts)
      .set({ status: 'rejected', rejectionReason: reason ?? null, decidedAt: this.now() })
      .where(and(eq(issueDrafts.id, id), eq(issueDrafts.status, 'pending')))
      .returning()
    const row = result[0]
    return row === undefined ? null : toRecord(row)
  }
}
