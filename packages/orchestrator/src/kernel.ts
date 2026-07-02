import { z } from 'zod'
import type { Directive } from './directives.js'

/**
 * The ONLY payload the Composer may receive — product language by construction.
 * No agent names, code, file paths, hypotheses, or ticket mechanics can be
 * expressed in this type; the kernel builds it, the planner only proposes.
 */
export const ComposerBriefing = z.object({
  intent: z.enum(['answer', 'acknowledge', 'ask_clarifying', 'offer_consent', 'known_issue', 'escalation_notice', 'budget_stop']),
  points: z.array(z.string().max(600)).max(6).default([]),
  docExtracts: z.array(z.object({ title: z.string().optional(), text: z.string().max(2000) })).max(3).default([]),
  question: z.string().max(500).optional(),
  offer: z.enum(['attach_known_issue', 'file_ticket']).optional(),
})
export type ComposerBriefing = z.infer<typeof ComposerBriefing>

export type KernelDecision =
  | { verdict: 'allow' }
  | { verdict: 'deny'; reason: string }
  | { verdict: 'force_compose'; briefing: ComposerBriefing; reason: string }

/** Hard structural cap on agent consults per customer message (cost + latency bound). */
export const MAX_CONSULTS_PER_MESSAGE = 4

/** Compose-with-what-we-have: the forced briefing is built from findings, nothing else. */
export function briefingFromFindings(findings: KernelContext['findings']): ComposerBriefing {
  return ComposerBriefing.parse({
    intent: 'answer',
    points: findings.slice(0, 6).map((f) => f.summary.slice(0, 600)),
  })
}

/** What the kernel knows about the case when judging a directive. */
export interface KernelContext {
  caseId: string
  verified: boolean
  capabilities: { docs: boolean; account: boolean; code: boolean; escalation: boolean }
  pendingOffer?: { offer: 'attach_known_issue' | 'file_ticket'; issueNumber?: number }
  /** Product-language findings gathered so far (feeds forced compose briefings). */
  findings: Array<{ summary: string }>
  /** Consult directives already executed for this message. */
  consultsUsed: number
  now: number
}

interface KernelDeps {
  audit: { record(id: string, event: { type: string; data?: Record<string, unknown> }): unknown }
  /** Structural slice of BudgetGovernor — a 1-unit probe checks headroom before a consult. */
  governor?: { evaluate(id: string, amount: number, at: number): { allowed: boolean; reason?: string | null } }
}

/**
 * The deterministic law of the new brain: every planner directive passes through
 * here before anything executes. LLM-free by design — silos, budgets, and consent
 * are enforced structurally, and every decision lands in the audit trail.
 */
export class PolicyKernel {
  constructor(private readonly deps: KernelDeps) {}

  validate(directive: Directive, ctx: KernelContext): KernelDecision {
    const decision = this.judge(directive, ctx)
    this.deps.audit.record(ctx.caseId, {
      type: 'directive',
      data: {
        directive,
        verdict: decision.verdict,
        ...(decision.verdict !== 'allow' ? { reason: decision.reason } : {}),
      },
    })
    return decision
  }

  private judge(directive: Directive, ctx: KernelContext): KernelDecision {
    if (directive.kind === 'consult_account' && !ctx.verified) {
      return { verdict: 'deny', reason: 'customer identity is not verified — account state is unreachable' }
    }

    const consultTarget = { consult_docs: 'docs', consult_account: 'account', consult_code: 'code' } as const
    if (directive.kind in consultTarget) {
      if (ctx.consultsUsed >= MAX_CONSULTS_PER_MESSAGE) {
        return {
          verdict: 'force_compose',
          briefing: briefingFromFindings(ctx.findings),
          reason: `consult cap reached (${MAX_CONSULTS_PER_MESSAGE} per message) — composing with what we have`,
        }
      }
      const target = consultTarget[directive.kind as keyof typeof consultTarget]
      if (!ctx.capabilities[target]) return { verdict: 'deny', reason: `the ${target} agent is not wired` }
      const budget = this.deps.governor?.evaluate(ctx.caseId, 1, ctx.now)
      if (budget !== undefined && !budget.allowed) {
        return {
          verdict: 'force_compose',
          briefing: { ...briefingFromFindings(ctx.findings), intent: 'budget_stop' },
          reason: budget.reason ?? 'budget cap reached',
        }
      }
    }

    if (
      (directive.kind === 'offer_consent' && directive.offer === 'file_ticket') ||
      directive.kind === 'file_ticket'
    ) {
      if (!ctx.capabilities.escalation) {
        return { verdict: 'deny', reason: 'the escalation pipeline is not wired — tickets cannot be filed' }
      }
    }

    if (directive.kind === 'attach_known_issue' || directive.kind === 'file_ticket') {
      if (ctx.pendingOffer === undefined || ctx.pendingOffer.offer !== directive.kind) {
        return { verdict: 'deny', reason: 'no matching consent offer is pending — the customer must be asked first' }
      }
    }

    return { verdict: 'allow' }
  }
}
