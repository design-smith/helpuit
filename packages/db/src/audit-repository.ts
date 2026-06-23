import { and, asc, eq, lt, sql } from 'drizzle-orm'
import type { Db } from './client.js'
import { auditEntries } from './schema.js'

/** A persistable audit entry (structurally compatible with `@helpuit/audit`'s `AuditEntry`). */
export interface PersistableAuditEntry {
  investigationId: string
  type: string
  data?: Record<string, unknown>
  at: number
}

/** A persisted audit entry as the console reads it (data parsed back from JSON). */
export interface AuditEntryRecord {
  id: number
  investigationId: string
  type: string
  data: Record<string, unknown> | null
  at: number
}

/** How many entries `forInvestigation` returns when no explicit limit is given. */
const DEFAULT_AUDIT_LIMIT = 500

type Row = typeof auditEntries.$inferSelect

function toRecord(row: Row): AuditEntryRecord {
  return {
    id: row.id,
    investigationId: row.investigationId,
    type: row.type,
    data: row.data !== null ? (JSON.parse(row.data) as Record<string, unknown>) : null,
    at: row.at,
  }
}

/**
 * Durable, queryable audit trail. Writes are driven by `PersistingAuditLog`
 * (which forwards every in-memory entry here); reads back the per-investigation
 * timeline for the operator console.
 */
export class DrizzleAuditRepository {
  constructor(private readonly db: Db) {}

  /** Persist one entry (the exact entry the in-memory log created, with its `at`). */
  async record(entry: PersistableAuditEntry): Promise<void> {
    await this.db.insert(auditEntries).values({
      investigationId: entry.investigationId,
      type: entry.type,
      data: entry.data !== undefined ? JSON.stringify(entry.data) : null,
      at: entry.at,
    })
  }

  /**
   * The chronological trail for one investigation. Ordered `at ASC, id ASC` —
   * the autoincrement `id` tiebreak is load-bearing: the orchestrator records
   * several entries within one `Date.now()` millisecond, so ordering on `at`
   * alone is non-deterministic.
   */
  async forInvestigation(
    investigationId: string,
    options: { limit?: number; before?: number } = {},
  ): Promise<AuditEntryRecord[]> {
    const limit = options.limit ?? DEFAULT_AUDIT_LIMIT
    const where =
      options.before !== undefined
        ? and(eq(auditEntries.investigationId, investigationId), lt(auditEntries.at, options.before))
        : eq(auditEntries.investigationId, investigationId)
    const rows = await this.db
      .select()
      .from(auditEntries)
      .where(where)
      .orderBy(asc(auditEntries.at), asc(auditEntries.id))
      .limit(limit)
    return rows.map(toRecord)
  }

  /** Count entries for an investigation (console badge / pagination). */
  async countForInvestigation(investigationId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(auditEntries)
      .where(eq(auditEntries.investigationId, investigationId))
    return Number(rows[0]?.n ?? 0)
  }
}
