import { asc, eq, sql } from 'drizzle-orm'
import type { Db } from './client.js'
import { spendEntries } from './schema.js'

/** A persistable spend entry (structurally compatible with `@helpuit/budget`'s `SpendEntry`). */
export interface PersistableSpendEntry {
  investigationId: string
  amount: number
  at: number
}

/** A persisted spend entry as the console reads it. */
export interface SpendEntryRecord {
  id: number
  investigationId: string
  amount: number
  at: number
}

type Row = typeof spendEntries.$inferSelect

/**
 * Durable, queryable spend ledger. Writes are driven by `PersistingSpendLedger`
 * (the in-memory ledger stays the fast path the budget governor reads); reads
 * back totals + per-investigation history for the operator console.
 *
 * Note: until per-request metering lands, entries are scoped `'global'`, so the
 * total is accurate but per-investigation rows are sparse.
 */
export class DrizzleSpendRepository {
  constructor(private readonly db: Db) {}

  async record(entry: PersistableSpendEntry): Promise<void> {
    await this.db.insert(spendEntries).values({
      investigationId: entry.investigationId,
      amount: entry.amount,
      at: entry.at,
    })
  }

  async totalForInvestigation(investigationId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`coalesce(sum(${spendEntries.amount}), 0)` })
      .from(spendEntries)
      .where(eq(spendEntries.investigationId, investigationId))
    return Number(rows[0]?.total ?? 0)
  }

  async listForInvestigation(investigationId: string): Promise<SpendEntryRecord[]> {
    const rows = await this.db
      .select()
      .from(spendEntries)
      .where(eq(spendEntries.investigationId, investigationId))
      .orderBy(asc(spendEntries.at), asc(spendEntries.id))
    return rows.map((r: Row) => ({ ...r }))
  }
}
