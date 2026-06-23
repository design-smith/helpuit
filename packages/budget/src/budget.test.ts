import { describe, it, expect } from 'vitest'
import { SpendLedger } from './spend-ledger.js'
import { BudgetGovernor } from './budget-governor.js'
import { RateLimiter } from './rate-limiter.js'
import { recommendTiering } from './model-tiering.js'

const DAY = 24 * 60 * 60 * 1000
const t0 = Date.UTC(2026, 0, 1, 12, 0, 0)

describe('SpendLedger', () => {
  it('totals spend per investigation', () => {
    const l = new SpendLedger()
    l.record({ investigationId: 'inv-1', amount: 100, at: t0 })
    l.record({ investigationId: 'inv-1', amount: 50, at: t0 })
    l.record({ investigationId: 'inv-2', amount: 999, at: t0 })
    expect(l.totalForInvestigation('inv-1')).toBe(150)
  })

  it('totals spend within the same day, excluding other days', () => {
    const l = new SpendLedger()
    l.record({ investigationId: 'inv-1', amount: 100, at: t0 })
    l.record({ investigationId: 'inv-1', amount: 100, at: t0 + 6 * 60 * 60 * 1000 }) // same day
    l.record({ investigationId: 'inv-1', amount: 100, at: t0 + 2 * DAY }) // different day
    expect(l.totalForPeriod('day', t0)).toBe(200)
    expect(l.totalForPeriod('month', t0)).toBe(300)
  })
})

describe('BudgetGovernor', () => {
  it('allows spend under the per-investigation cap', () => {
    const l = new SpendLedger()
    const g = new BudgetGovernor({ perInvestigation: 1000 }, l)
    expect(g.evaluate('inv-1', 500, t0).allowed).toBe(true)
  })

  it('denies and signals degrade when a cap would be exceeded', () => {
    const l = new SpendLedger()
    l.record({ investigationId: 'inv-1', amount: 800, at: t0 })
    const g = new BudgetGovernor({ perInvestigation: 1000 }, l)
    const d = g.evaluate('inv-1', 300, t0)
    expect(d.allowed).toBe(false)
    expect(d.degrade).toBe(true)
    expect(d.cap).toBe('investigation')
  })

  it('enforces daily caps across investigations', () => {
    const l = new SpendLedger()
    l.record({ investigationId: 'inv-1', amount: 900, at: t0 })
    const g = new BudgetGovernor({ perDay: 1000 }, l)
    expect(g.evaluate('inv-2', 200, t0).cap).toBe('day')
  })

  it('imposes no limit when caps are unset', () => {
    const g = new BudgetGovernor({}, new SpendLedger())
    expect(g.evaluate('inv-1', 1_000_000, t0).allowed).toBe(true)
  })
})

describe('RateLimiter', () => {
  it('allows up to the limit within a window, then throttles', () => {
    const r = new RateLimiter({ limit: 2, windowMs: 1000 })
    expect(r.allow('user-1', t0)).toBe(true)
    expect(r.allow('user-1', t0 + 100)).toBe(true)
    expect(r.allow('user-1', t0 + 200)).toBe(false)
  })

  it('resets after the window elapses', () => {
    const r = new RateLimiter({ limit: 1, windowMs: 1000 })
    expect(r.allow('user-1', t0)).toBe(true)
    expect(r.allow('user-1', t0 + 500)).toBe(false)
    expect(r.allow('user-1', t0 + 1000)).toBe(true)
  })

  it('tracks users independently', () => {
    const r = new RateLimiter({ limit: 1, windowMs: 1000 })
    expect(r.allow('user-1', t0)).toBe(true)
    expect(r.allow('user-2', t0)).toBe(true)
  })
})

describe('recommendTiering', () => {
  it('recommends a cheaper guidance model for a known primary model', () => {
    const t = recommendTiering('claude-opus-4-8')
    expect(t.guidance).not.toBe(t.reasoning)
    expect(t.reasoning).toBe('claude-opus-4-8')
  })

  it('falls back to the same model across stages for unknown models', () => {
    const t = recommendTiering('some-other-model')
    expect(t.guidance).toBe('some-other-model')
    expect(t.note).toContain('No tiering recommendation')
  })
})
