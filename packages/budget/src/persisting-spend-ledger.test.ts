import { describe, it, expect } from 'vitest'
import type { SpendEntry } from './spend-ledger.js'
import { PersistingSpendLedger } from './persisting-spend-ledger.js'
import { BudgetGovernor } from './budget-governor.js'

describe('PersistingSpendLedger', () => {
  it('keeps the in-memory total for the governor AND forwards to the sink once', () => {
    const forwarded: SpendEntry[] = []
    const ledger = new PersistingSpendLedger({ record: (e) => forwarded.push(e) })

    ledger.record({ investigationId: 'inv-1', amount: 100, at: 10 })
    ledger.record({ investigationId: 'inv-1', amount: 50, at: 20 })

    // in-memory base still totals (this is what the governor reads synchronously)
    expect(ledger.totalForInvestigation('inv-1')).toBe(150)
    // forwarded to the durable sink exactly once each
    expect(forwarded).toEqual([
      { investigationId: 'inv-1', amount: 100, at: 10 },
      { investigationId: 'inv-1', amount: 50, at: 20 },
    ])
  })

  it('the governor still enforces caps off the in-memory totals (no double count)', () => {
    const ledger = new PersistingSpendLedger({ record: () => {} })
    const governor = new BudgetGovernor({ perDay: 100 }, ledger)
    ledger.record({ investigationId: 'global', amount: 100, at: 0 })
    const decision = governor.evaluate('global', 1, 0)
    expect(decision.allowed).toBe(false)
    expect(decision.degrade).toBe(true)
  })
})
