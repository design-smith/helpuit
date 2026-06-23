import { parseInboundMessage, type ChatwootClient } from '@helpuit/chatwoot'
import {
  extractToken,
  gateAccess,
  type ConversationContext,
  type IdentityResolver,
  type VerifiedIdentity,
} from '@helpuit/identity'
import type { InvestigationRepository } from '@helpuit/investigation-store'
import type { GuidanceAgent } from '@helpuit/guidance'
import type { MatchVerdict } from '@helpuit/dedup'
import type { Ticketing } from '@helpuit/ticketing'
import { assessGuidance } from '@helpuit/assessment'
import { enforceCustomerOutput } from '@helpuit/output-rail'
import type { AuditLog } from '@helpuit/audit'
import { classifyEvidence } from '@helpuit/classification'
import { CUSTOMER_ESCALATION_MESSAGE, type IssueDraft } from '@helpuit/escalation'
import type { Classification, InvestigationId } from '@helpuit/contracts'

/** L2 capability the orchestrator escalates to. Satisfied by `AccountInvestigator`. */
export interface AccountInvestigationPort {
  investigate(
    identity: VerifiedIdentity,
  ): Promise<{ summary: string; classificationHint?: Classification }>
}

/** L3a capability. Satisfied by `StaticCodeInvestigator`. */
export interface StaticInvestigationPort {
  investigate(complaint: string): Promise<{
    confidence: number
    feature?: string
    hypothesis?: string
    suspectedFiles?: string[]
  }>
}

/**
 * L3b→L4 capability: reproduce (if allowed) and file/link the GitHub issue.
 * Encapsulates the reproduce → re-classify → escalate composition; the
 * orchestrator handles the ticket + customer reply around it.
 */
export interface EscalationPort {
  escalate(input: {
    complaint: string
    classification: Classification
    feature?: string
    hypothesis?: string
    suspectedFiles?: string[]
    /** The investigation being escalated — lets reproduction tie its evidence to it. */
    investigationId?: string
  }): Promise<{
    action: 'created' | 'linked' | 'drafted'
    issueNumber?: number
    reproduced: boolean
    classification: Classification
    /** The drafted issue — persisted for founder approval when `action` is `drafted`. */
    draft?: IssueDraft
    signature?: string
    openMatchIssue?: number
  }>
}

/** Founder-takeover gate: when a conversation is paused, the agent stays silent. */
export interface ControlPort {
  isPaused(conversationId: number): Promise<boolean>
}

/**
 * Persists an escalation draft awaiting founder approval (satisfied by
 * `DrizzleDraftRepository`). When wired, a `drafted` escalation is durably stored
 * so the operator console can review and publish/reject it.
 */
export interface DraftStorePort {
  save(input: {
    investigationId: string
    conversationId: number
    title: string
    body: string
    labels: string[]
    severity: string
    signature?: string
    openMatchIssue?: number
  }): Promise<{ id: string }>
}

/** Default confidence recorded for an account-investigation classification (refined later). */
const ACCOUNT_CLASSIFY_CONFIDENCE = 0.7

const ESCALATING_REPLY =
  "I've looked into this on my end — it looks like a real issue on our side rather than something you're doing. I'm escalating it to the team and will follow up right here."

const BUDGET_EXCEEDED_MESSAGE =
  "Thanks for your patience — I've flagged this to our team to look into directly, and we'll follow up here."

export interface OrchestratorConfig {
  allowAnonymous: boolean
  guidanceThreshold: number
  tokenKey?: string
}

export interface OrchestratorDeps {
  client: ChatwootClient
  identity: IdentityResolver
  investigations: InvestigationRepository
  guidance: GuidanceAgent
  ticketing: Ticketing
  audit: AuditLog
  /** Front-of-funnel known-issue check (signature derivation lives in the collaborator). */
  knownIssue: (complaint: string) => Promise<MatchVerdict>
  /** Optional L2 capability. When absent, escalating guidance falls back to `needs_escalation`. */
  accountInvestigation?: AccountInvestigationPort
  /** Optional L3a capability. When absent, an unexplained account path replies with the summary. */
  staticInvestigation?: StaticInvestigationPort
  /** Optional L3b→L4 capability. When absent, a suspected bug stops at `static_investigated`. */
  escalation?: EscalationPort
  /** Optional draft store. When wired, a `drafted` escalation is persisted for approval. */
  draftStore?: DraftStorePort
  /** Optional founder-takeover gate. When a conversation is paused, intake is skipped. */
  control?: ControlPort
  config: OrchestratorConfig
}

export type OrchestratorOutcome =
  | { handled: false }
  | { handled: true; outcome: 'denied' }
  | { handled: true; outcome: 'paused' }
  | {
      handled: true
      outcome:
        | 'known_issue'
        | 'guided'
        | 'account_investigated'
        | 'static_investigated'
        | 'escalated'
        | 'needs_escalation'
        | 'budget_exceeded'
      investigationId: string
    }

const KNOWN_ISSUE_REPLY =
  "Thanks — this looks like a known issue affecting several users. I've logged a ticket for you and you'll be notified right here as soon as it's fixed."

/**
 * The intake spine (synchronous L1 path). Composes the leaf modules:
 * parse → identity gate → create investigation → known-issue short-circuit
 * (or guidance → self-assessment) → reply through the output rail → audit.
 *
 * Deeper levels (account investigation, reproduction, escalation) attach to the
 * `needs_escalation` outcome in later waves.
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async handleInbound(
    payload: unknown,
    context: ConversationContext,
  ): Promise<OrchestratorOutcome> {
    const message = parseInboundMessage(payload)
    if (message === null) return { handled: false }

    const {
      client,
      identity,
      investigations,
      guidance,
      ticketing,
      audit,
      knownIssue,
      accountInvestigation,
      staticInvestigation,
      escalation,
      draftStore,
      control,
      config,
    } = this.deps

    // Founder takeover: if a human has paused this conversation, stay completely
    // silent (no reply, no investigation, no spend) and let them handle it.
    if (control !== undefined && (await control.isPaused(message.conversationId))) {
      return { handled: true, outcome: 'paused' }
    }

    const verified = await identity.resolve(extractToken(context, config.tokenKey))
    const gate = gateAccess({ identity: verified, allowAnonymous: config.allowAnonymous })
    if (gate.access === 'denied') {
      await client.sendReply(message.conversationId, gate.reason ?? 'Please log in to continue.')
      return { handled: true, outcome: 'denied' }
    }

    const investigation = await investigations.create({
      conversationId: message.conversationId,
      customerId: verified?.userId,
    })
    audit.record(investigation.id, { type: 'created' })

    try {
    const match = await knownIssue(message.content)
    if (match.verdict === 'open') {
      const ticket = await ticketing.create({
        investigationId: investigation.id,
        conversationId: message.conversationId,
      })
      await ticketing.linkToIssue(ticket.id, match.issue.number)
      await this.replyAndAudit(message.conversationId, investigation.id, KNOWN_ISSUE_REPLY, {
        type: 'known_issue',
        data: { issue: match.issue.number },
      })
      return { handled: true, outcome: 'known_issue', investigationId: investigation.id }
    }

    const answer = await guidance.answer(message.content)
    const assessment = assessGuidance(
      { confidence: answer.confidence, hasSources: answer.sources.length > 0 },
      { threshold: config.guidanceThreshold },
    )

    if (assessment.decision === 'resolved') {
      await this.replyAndAudit(message.conversationId, investigation.id, answer.message, {
        type: 'guidance',
        data: { decision: 'resolved' },
      })
      return { handled: true, outcome: 'guided', investigationId: investigation.id }
    }

    // L1 → L2: escalate to account investigation when the capability is wired and
    // we have a verified identity (anonymous users never reach account state).
    if (accountInvestigation !== undefined && verified !== null) {
      const findings = await accountInvestigation.investigate(verified)
      await investigations.setLevel(investigation.id, 'account')

      if (findings.classificationHint !== undefined) {
        await investigations.classify(
          investigation.id,
          findings.classificationHint,
          ACCOUNT_CLASSIFY_CONFIDENCE,
        )
        await this.replyAndAudit(message.conversationId, investigation.id, findings.summary, {
          type: 'account_investigation',
        })
        return { handled: true, outcome: 'account_investigated', investigationId: investigation.id }
      }

      // L2 → L3a: account state doesn't explain it → static code investigation + classify.
      if (staticInvestigation !== undefined) {
        const stat = await staticInvestigation.investigate(message.content)
        const result = classifyEvidence({ staticConfidence: stat.confidence })
        await investigations.setLevel(investigation.id, 'static_repro')
        await investigations.classify(investigation.id, result.classification, result.confidence)

        // L3a → L3b/L4: a suspected bug reproduces (if allowed) and files an issue.
        if (result.classification === 'new_bug' && escalation !== undefined) {
          const esc = await escalation.escalate({
            complaint: message.content,
            classification: result.classification,
            feature: stat.feature,
            hypothesis: stat.hypothesis,
            suspectedFiles: stat.suspectedFiles,
            investigationId: investigation.id,
          })
          if (esc.reproduced) await investigations.setLevel(investigation.id, 'dynamic_repro')
          await investigations.classify(
            investigation.id,
            esc.classification,
            esc.reproduced ? 0.95 : result.confidence,
          )

          // autopublish=draft → the issue wasn't filed; persist it for founder
          // approval in the console so it isn't lost.
          if (esc.action === 'drafted' && draftStore !== undefined && esc.draft !== undefined) {
            const { id: draftId } = await draftStore.save({
              investigationId: investigation.id,
              conversationId: message.conversationId,
              title: esc.draft.title,
              body: esc.draft.body,
              labels: esc.draft.labels,
              severity: esc.draft.severity,
              signature: esc.signature,
              openMatchIssue: esc.openMatchIssue,
            })
            audit.record(investigation.id, {
              type: 'draft_created',
              data: { draftId, signature: esc.signature },
            })
          }

          const ticket = await ticketing.create({
            investigationId: investigation.id,
            conversationId: message.conversationId,
          })
          if (esc.issueNumber !== undefined) await ticketing.linkToIssue(ticket.id, esc.issueNumber)
          await investigations.setStatus(investigation.id, 'escalated')
          await this.replyAndAudit(
            message.conversationId,
            investigation.id,
            CUSTOMER_ESCALATION_MESSAGE,
            { type: 'escalated', data: { issue: esc.issueNumber, action: esc.action, reproduced: esc.reproduced } },
          )
          return { handled: true, outcome: 'escalated', investigationId: investigation.id }
        }

        await this.replyAndAudit(message.conversationId, investigation.id, ESCALATING_REPLY, {
          type: 'static_investigation',
          data: { classification: result.classification },
        })
        return { handled: true, outcome: 'static_investigated', investigationId: investigation.id }
      }

      // No deeper capability wired → reply with the account summary (prior behavior).
      await this.replyAndAudit(message.conversationId, investigation.id, findings.summary, {
        type: 'account_investigation',
      })
      return { handled: true, outcome: 'account_investigated', investigationId: investigation.id }
    }

    // No deeper capability available yet → send the guidance answer, flag for escalation.
    await this.replyAndAudit(message.conversationId, investigation.id, answer.message, {
      type: 'guidance',
      data: { decision: 'escalate' },
    })
    return { handled: true, outcome: 'needs_escalation', investigationId: investigation.id }
    } catch (error) {
      if (error instanceof Error && error.name === 'BudgetExceededError') {
        await investigations.setStatus(investigation.id, 'needs_founder')
        await this.replyAndAudit(message.conversationId, investigation.id, BUDGET_EXCEEDED_MESSAGE, {
          type: 'budget_exceeded',
        })
        return { handled: true, outcome: 'budget_exceeded', investigationId: investigation.id }
      }
      throw error
    }
  }

  /** Send a customer-facing reply through the output rail and record it in the audit log. */
  private async replyAndAudit(
    conversationId: number,
    investigationId: InvestigationId,
    text: string,
    auditEvent: { type: string; data?: Record<string, unknown> },
  ): Promise<void> {
    const safe = enforceCustomerOutput(text)
    await this.deps.client.sendReply(conversationId, safe.text)
    this.deps.audit.record(investigationId, {
      type: auditEvent.type,
      data: { ...auditEvent.data, violations: safe.violations },
    })
  }
}
