/** A single unit of spend (output tokens or cost units) attributed to an investigation. */
export interface SpendEntry {
  investigationId: string
  amount: number
  /** epoch milliseconds */
  at: number
}

export type Period = 'day' | 'month'

/** UTC start-of-period boundary for a timestamp. */
function periodKey(at: number, period: Period): number {
  const d = new Date(at)
  return period === 'day'
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

/** In-memory spend ledger. Records spend and totals it by investigation or period. */
export class SpendLedger {
  private readonly entries: SpendEntry[] = []

  record(entry: SpendEntry): void {
    this.entries.push(entry)
  }

  totalForInvestigation(investigationId: string): number {
    return this.entries
      .filter((e) => e.investigationId === investigationId)
      .reduce((sum, e) => sum + e.amount, 0)
  }

  /** Total spend within the same `period` (day/month) as `at`. */
  totalForPeriod(period: Period, at: number): number {
    const key = periodKey(at, period)
    return this.entries
      .filter((e) => periodKey(e.at, period) === key)
      .reduce((sum, e) => sum + e.amount, 0)
  }
}
