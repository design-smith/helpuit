import { SpendLedger } from './spend-ledger.js'

export interface BudgetCaps {
  perInvestigation?: number
  perDay?: number
  perMonth?: number
}

export interface BudgetDecision {
  allowed: boolean
  /** When false: stop work and hand off to the founder (graceful degradation). */
  degrade: boolean
  reason: string | null
  cap: 'investigation' | 'day' | 'month' | null
}

const OK: BudgetDecision = { allowed: true, degrade: false, reason: null, cap: null }

/** Thrown when a metered operation would exceed a budget cap (graceful-degradation signal). */
export class BudgetExceededError extends Error {
  constructor(
    public readonly reason: string,
    public readonly cap: BudgetDecision['cap'],
  ) {
    super(`Budget exceeded: ${reason}`)
    this.name = 'BudgetExceededError'
  }
}

/**
 * Enforces founder-set budget caps. A prospective spend that would exceed any
 * cap is denied with `degrade: true` — the signal to stop and hand to the founder
 * rather than grinding (issue 83).
 */
export class BudgetGovernor {
  constructor(
    private readonly caps: BudgetCaps,
    private readonly ledger: SpendLedger,
  ) {}

  evaluate(investigationId: string, prospectiveAmount: number, at: number): BudgetDecision {
    const checks: ReadonlyArray<{
      cap: NonNullable<BudgetDecision['cap']>
      limit: number | undefined
      current: number
      label: string
    }> = [
      {
        cap: 'investigation',
        limit: this.caps.perInvestigation,
        current: this.ledger.totalForInvestigation(investigationId),
        label: 'per-investigation',
      },
      {
        cap: 'day',
        limit: this.caps.perDay,
        current: this.ledger.totalForPeriod('day', at),
        label: 'daily',
      },
      {
        cap: 'month',
        limit: this.caps.perMonth,
        current: this.ledger.totalForPeriod('month', at),
        label: 'monthly',
      },
    ]

    for (const c of checks) {
      if (c.limit !== undefined && c.current + prospectiveAmount > c.limit) {
        return {
          allowed: false,
          degrade: true,
          reason: `${c.label} budget cap reached (${c.current} + ${prospectiveAmount} > ${c.limit})`,
          cap: c.cap,
        }
      }
    }
    return OK
  }
}
