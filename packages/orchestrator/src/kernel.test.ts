import { describe, it, expect } from 'vitest'
import { AuditLog } from '@helpuit/audit'
import { BudgetGovernor, SpendLedger } from '@helpuit/budget'
import { PolicyKernel, type KernelContext } from './kernel.js'

function harness(governor?: { evaluate(id: string, amount: number, at: number): { allowed: boolean; reason?: string | null } }) {
  const audit = new AuditLog({ now: () => 1 })
  const kernel = new PolicyKernel({ audit, governor })
  return { kernel, audit }
}

function ctx(overrides: Partial<KernelContext> = {}): KernelContext {
  return {
    caseId: 'inv-1',
    verified: false,
    capabilities: { docs: true, account: true, code: true, escalation: true },
    findings: [],
    consultsUsed: 0,
    now: 1,
    ...overrides,
  }
}

describe('PolicyKernel', () => {
  it('denies consult_account for an anonymous customer and audits the decision', () => {
    const { kernel, audit } = harness()

    const decision = kernel.validate({ kind: 'consult_account', brief: 'check plan' }, ctx({ verified: false }))

    expect(decision.verdict).toBe('deny')
    if (decision.verdict === 'deny') expect(decision.reason).toMatch(/identity|verified|anonymous/i)

    const trail = audit.forInvestigation('inv-1')
    expect(trail).toHaveLength(1)
    expect(trail[0]!.type).toBe('directive')
    expect(trail[0]!.data).toMatchObject({ verdict: 'deny' })
  })

  it('allows consult_account for a verified customer', () => {
    const { kernel } = harness()
    const decision = kernel.validate({ kind: 'consult_account', brief: 'check plan' }, ctx({ verified: true }))
    expect(decision.verdict).toBe('allow')
  })

  it('denies consulting an agent that is not wired', () => {
    const { kernel } = harness()
    const decision = kernel.validate(
      { kind: 'consult_code', brief: 'why does export fail' },
      ctx({ capabilities: { docs: true, account: true, code: false, escalation: true } }),
    )
    expect(decision.verdict).toBe('deny')
    if (decision.verdict === 'deny') expect(decision.reason).toMatch(/not wired|unavailable|capability/i)
  })

  it('denies executing an offer the customer was never asked (and allows the matching one)', () => {
    const { kernel } = harness()

    const noOffer = kernel.validate({ kind: 'file_ticket' }, ctx())
    expect(noOffer.verdict).toBe('deny')

    const mismatched = kernel.validate(
      { kind: 'attach_known_issue', issueNumber: 42 },
      ctx({ pendingOffer: { offer: 'file_ticket' } }),
    )
    expect(mismatched.verdict).toBe('deny')

    const matching = kernel.validate(
      { kind: 'attach_known_issue', issueNumber: 42 },
      ctx({ pendingOffer: { offer: 'attach_known_issue', issueNumber: 42 } }),
    )
    expect(matching.verdict).toBe('allow')
  })

  it('denies offering or filing a ticket when the escalation capability is not wired', () => {
    const { kernel } = harness()
    const noEsc = ctx({ capabilities: { docs: true, account: true, code: true, escalation: false } })

    expect(kernel.validate({ kind: 'offer_consent', offer: 'file_ticket' }, noEsc).verdict).toBe('deny')
    expect(
      kernel.validate({ kind: 'file_ticket' }, { ...noEsc, pendingOffer: { offer: 'file_ticket' } }).verdict,
    ).toBe('deny')

    // With escalation wired, the same directives pass their gates.
    expect(kernel.validate({ kind: 'offer_consent', offer: 'file_ticket' }, ctx()).verdict).toBe('allow')
    expect(kernel.validate({ kind: 'file_ticket' }, ctx({ pendingOffer: { offer: 'file_ticket' } })).verdict).toBe('allow')
  })

  it('forces compose-with-what-we-have once the consult cap is reached', () => {
    const { kernel } = harness()
    const spent = ctx({
      consultsUsed: 4,
      findings: [{ summary: 'The export button requires an active subscription.' }],
    })

    const decision = kernel.validate({ kind: 'consult_code', brief: 'dig deeper' }, spent)

    expect(decision.verdict).toBe('force_compose')
    if (decision.verdict === 'force_compose') {
      expect(decision.briefing.intent).toBe('answer')
      expect(decision.briefing.points).toContain('The export button requires an active subscription.')
      expect(decision.reason).toMatch(/cap/i)
    }

    // Non-consult directives are unaffected by the cap.
    const compose = kernel.validate({ kind: 'compose_reply', intent: 'answer' }, spent)
    expect(compose.verdict).toBe('allow')
  })

  it('forces a budget-stop compose when the real governor denies further spend', () => {
    const ledger = new SpendLedger()
    ledger.record({ investigationId: 'inv-1', amount: 1000, at: 1 })
    const governor = new BudgetGovernor({ perInvestigation: 1000 }, ledger)
    const { kernel } = harness(governor)

    const decision = kernel.validate(
      { kind: 'consult_docs', query: 'refunds' },
      ctx({ findings: [{ summary: 'Refunds take five days.' }] }),
    )

    expect(decision.verdict).toBe('force_compose')
    if (decision.verdict === 'force_compose') {
      expect(decision.briefing.intent).toBe('budget_stop')
      expect(decision.reason).toMatch(/budget/i)
    }

    // With headroom, the same consult is allowed.
    const roomy = new BudgetGovernor({ perInvestigation: 1_000_000 }, ledger)
    const { kernel: freshKernel } = harness(roomy)
    expect(freshKernel.validate({ kind: 'consult_docs', query: 'refunds' }, ctx()).verdict).toBe('allow')
  })
})
