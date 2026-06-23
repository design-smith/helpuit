import { SpendLedger, type SpendEntry } from './spend-ledger.js'

/**
 * A durable destination for spend entries. Kept as an interface so this package
 * never depends on `@helpuit/db` — the DB-backed adapter is wired in composition.
 */
export interface SpendSink {
  record(entry: SpendEntry): void
}

/**
 * A {@link SpendLedger} that ALSO forwards every entry to a durable {@link SpendSink}.
 * The in-memory base is what `BudgetGovernor` reads synchronously to enforce caps
 * (unchanged, fast); the sink gives the operator console a durable, queryable copy.
 * The sink is best-effort and must never break a metered LLM call.
 */
export class PersistingSpendLedger extends SpendLedger {
  constructor(private readonly sink: SpendSink) {
    super()
  }

  override record(entry: SpendEntry): void {
    super.record(entry)
    this.sink.record(entry)
  }
}
