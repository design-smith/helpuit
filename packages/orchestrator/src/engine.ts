import { parseInboundMessage, type InboundMessage } from '@helpuit/chatwoot'
import { extractToken, gateAccess, type ConversationContext, type IdentityResolver } from '@helpuit/identity'
import { enforceCustomerOutput } from '@helpuit/output-rail'
import { parseCaseMemory, type CaseMemory } from './directives.js'
import { ComposerBriefing, briefingFromFindings, type PolicyKernel } from './kernel.js'
import type { Planner } from './planner.js'
import type { Composer } from './composer.js'

/** Structural slice of the guidance DocsIndex (sync today, async when semantic lands). */
export interface DocsPort {
  retrieve(
    query: string,
    k?: number,
  ): Array<{ id: string; text: string; title?: string }> | Promise<Array<{ id: string; text: string; title?: string }>>
}

/** L2 capability: reads the verified customer's account state. Satisfied by `AccountInvestigator`. */
export interface AccountInvestigationPort {
  investigate(identity: { userId: string }): Promise<{ summary: string; classificationHint?: string }>
}

/** The Code Analyst — the only thing that touches the codebase. Satisfied by `StaticCodeInvestigator`. */
export interface CodeAnalystPort {
  investigate(brief: string): Promise<{
    hypothesis: string
    suspectedFiles: string[]
    confidence: number
    explanation: string
    verdict: 'user_error_or_prerequisite' | 'actual_bug' | 'explains_behavior'
    feature?: string
  }>
}

/** L4: the existing escalation pipeline (dedup, redaction, draft/auto policy). Satisfied by `EscalationPipeline`. */
export interface EscalationPort {
  escalate(input: {
    complaint: string
    classification: 'new_bug'
    feature?: string
    hypothesis?: string
    suspectedFiles?: string[]
    investigationId?: string
  }): Promise<{
    action: 'created' | 'linked' | 'drafted'
    issueNumber?: number
    reproduced: boolean
    classification: string
    draft?: { title: string; body: string; labels: string[]; severity: string }
    signature?: string
    openMatchIssue?: number
  }>
}

/** Persists a drafted escalation for founder review. Satisfied by `DrizzleDraftRepository`. */
export interface DraftStorePort {
  save(input: {
    investigationId: string
    conversationId: string
    title: string
    body: string
    labels: string[]
    severity: string
    signature?: string
    openMatchIssue?: number
  }): Promise<{ id: string }>
}

/** Semantic known-issue check (issues embedded from GitHub). Satisfied by `KnownIssueMatcher`. */
export interface KnownIssuePort {
  match(text: string): Promise<{ issueNumber: number; title: string } | null>
}

export interface EngineDeps {
  planner: Planner
  composer: Composer
  kernel: PolicyKernel
  docs: DocsPort
  client: { sendReply(conversationId: string, content: string): Promise<unknown> }
  /** Platform parse. Defaults to Chatwoot's; a connection injects its adapter's parse. */
  parse?: (payload: unknown) => InboundMessage | null
  /** When set, conversation state is namespaced `connectionId:nativeId` so connections never collide. */
  connectionId?: string
  identity: IdentityResolver
  /** Founder-takeover gate: a paused conversation gets total silence. */
  control?: { isPaused(conversationId: string): Promise<boolean> }
  account?: AccountInvestigationPort
  codeAnalyst?: CodeAnalystPort
  /** Runs once per fresh case, before any planner spend. */
  knownIssue?: KnownIssuePort
  /** Consent-gated: the kernel only lets file_ticket through with a matching pending offer. */
  escalation?: EscalationPort
  draftStore?: DraftStorePort
  /** Ticket store: links this conversation to the filed/linked issue (fix fan-out rides this). */
  ticketing?: {
    create(input: { investigationId: string; conversationId: string }): Promise<{ id: string }>
    linkToIssue(ticketId: string, issueNumber: number): Promise<unknown>
  }
  /** The Case store — the conversation's open investigation + its persisted memory. */
  investigations: {
    getOrCreateForConversation(conversationId: string, customerId?: string): Promise<{ id: string }>
    loadCase(id: string): Promise<string | null>
    saveCase(id: string, json: string): Promise<void>
    setStatus(id: string, status: 'needs_founder' | 'escalated'): Promise<unknown>
    /** Console-chip parity: record what the investigation turned out to be (best-effort). */
    classify?(id: string, classification: string, confidence: number): Promise<unknown>
  }
  audit: { record(id: string, event: { type: string; data?: Record<string, unknown> }): unknown }
  config: { allowAnonymous: boolean; tokenKey?: string }
  now?: () => number
}

export type EngineOutcome =
  | { handled: false }
  | { handled: true; outcome: 'paused' | 'denied' }
  | { handled: true; outcome: 'replied' | 'fallback' | 'budget_exceeded' | 'escalated' | 'known_issue'; investigationId: string }

/** Planning rounds per message (each round may consult, then re-plan on the results). */
const MAX_ROUNDS = 3

const FALLBACK_QUESTION = 'Could you tell me a bit more about what you were trying to do and what happened instead?'

// ponytail: canned ack, not a Composer call — the ack's whole job is instant feedback;
// an LLM round-trip defeats it. Upgrade to a composed/customizable ack if founders ask.
const ACK_MESSAGE = "Let me look into that for you — one moment."

/** Ladder-parity budget message — canned because the metered models themselves may be the thing that's over budget. */
const BUDGET_MESSAGE =
  "Thanks for your patience — I've flagged this to our team to look into directly, and we'll follow up here."

/**
 * The new brain's engine: plan → validate (kernel) → execute → re-plan, then the
 * Composer writes the only customer-facing words, through the output rail.
 * Walking skeleton: docs consults only — identity, case memory, and the deeper
 * agents arrive in the next issues on this same loop.
 */
export class PlannerEngine {
  constructor(private readonly deps: EngineDeps) {}

  async handleInbound(payload: unknown, context: ConversationContext): Promise<EngineOutcome> {
    const message = (this.deps.parse ?? parseInboundMessage)(payload)
    if (message === null) return { handled: false }

    // State is keyed by a platform-namespaced conversation key so connections never
    // collide; `message.conversationId` stays the platform-native id used for replies.
    const conversationKey =
      this.deps.connectionId !== undefined
        ? `${this.deps.connectionId}:${message.conversationId}`
        : message.conversationId

    const { planner, composer, kernel, docs, investigations, audit, identity, control, config } = this.deps
    const now = this.deps.now ?? (() => Date.now())

    // Founder takeover: a paused conversation gets total silence — no reply, no spend.
    if (control !== undefined && (await control.isPaused(conversationKey))) {
      return { handled: true, outcome: 'paused' }
    }

    // Identity gate: the token is the only trusted identity source (never the chat).
    const verified = await identity.resolve(extractToken(context, config.tokenKey))
    const gate = gateAccess({ identity: verified, allowAnonymous: config.allowAnonymous })
    if (gate.access === 'denied') {
      await this.deps.client.sendReply(message.conversationId, gate.reason ?? 'Please log in to continue.')
      return { handled: true, outcome: 'denied' }
    }

    // The Case: reuse the conversation's open investigation and its memory.
    const investigation = await investigations.getOrCreateForConversation(conversationKey, verified?.userId)
    const memory: CaseMemory = parseCaseMemory(await investigations.loadCase(investigation.id))
    const persist = () => investigations.saveCase(investigation.id, JSON.stringify(memory))
    audit.record(investigation.id, { type: 'message_received' })

    if (memory.complaint === undefined) memory.complaint = message.content

    const { findings, extracts } = memory
    let offerMadeThisTurn = false
    /**
     * A substantive reply ends the turn: clear the ack marker, and clear a pending
     * offer the customer didn't take (unless it was made THIS turn — that one is
     * still awaiting their answer).
     */
    const finishTurn = async () => {
      memory.lastAckAt = undefined
      if (!offerMadeThisTurn) memory.pendingOffer = undefined
      await persist()
    }
    let consultsUsed = 0
    let denials: string[] = []

    try {
    // Fresh case: check the known-issue pool before spending planner rounds. Once
    // per case, match or not — a declined offer must never re-nag on later turns.
    if (this.deps.knownIssue !== undefined && memory.knownIssueChecked !== true) {
      memory.knownIssueChecked = true
      const match = await this.deps.knownIssue.match(message.content)
      if (match !== null) {
        audit.record(investigation.id, { type: 'known_issue_match', data: { issueNumber: match.issueNumber } })
        memory.pendingOffer = { offer: 'attach_known_issue', issueNumber: match.issueNumber }
        offerMadeThisTurn = true
        await this.compose(
          investigation.id,
          message.conversationId,
          message.content,
          ComposerBriefing.parse({
            intent: 'known_issue',
            points: [`Our team is already tracking this: ${match.title}`],
            offer: 'attach_known_issue',
          }),
        )
        await finishTurn()
        return { handled: true, outcome: 'replied', investigationId: investigation.id }
      }
      await persist()
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const plan = await planner.plan({
        message: message.content,
        findings,
        denials,
        identity: verified !== null ? 'verified' : 'anonymous',
        notes: memory.notes,
        pendingOffer: memory.pendingOffer,
      })
      if (plan === null) {
        // Planner unusable after its retry — ask a safe clarifying question, never crash.
        audit.record(investigation.id, { type: 'planner_fallback' })
        await this.send(
          investigation.id,
          message.conversationId,
          await composer.compose(
            ComposerBriefing.parse({ intent: 'ask_clarifying', question: FALLBACK_QUESTION }),
            { customerMessage: message.content },
          ),
        )
        await finishTurn()
        return { handled: true, outcome: 'fallback', investigationId: investigation.id }
      }

      if (plan.caseNotes !== '') memory.notes = plan.caseNotes
      if (plan.hypotheses.length > 0) memory.hypotheses = plan.hypotheses

      denials = []
      for (const directive of plan.directives) {
        const decision = kernel.validate(directive, {
          caseId: investigation.id,
          verified: verified !== null,
          capabilities: {
            docs: true,
            account: this.deps.account !== undefined,
            code: this.deps.codeAnalyst !== undefined,
            escalation: this.deps.escalation !== undefined && this.deps.ticketing !== undefined,
          },
          pendingOffer: memory.pendingOffer,
          findings,
          consultsUsed,
          now: now(),
        })
        if (decision.verdict === 'deny') {
          denials.push(decision.reason)
          continue
        }
        if (decision.verdict === 'force_compose') {
          await this.compose(investigation.id, message.conversationId, message.content, decision.briefing)
          if (decision.briefing.intent === 'budget_stop') {
            await investigations.setStatus(investigation.id, 'needs_founder')
            await finishTurn()
            return { handled: true, outcome: 'budget_exceeded', investigationId: investigation.id }
          }
          await finishTurn()
          return { handled: true, outcome: 'replied', investigationId: investigation.id }
        }

        const isConsult =
          directive.kind === 'consult_docs' || directive.kind === 'consult_account' || directive.kind === 'consult_code'
        if (isConsult && memory.lastAckAt === undefined) {
          // Deep work starts: acknowledge once so the chat feels alive. Persisted
          // BEFORE the consult so a mid-flight job retry never re-acks.
          const safe = enforceCustomerOutput(ACK_MESSAGE)
          await this.deps.client.sendReply(message.conversationId, safe.text)
          audit.record(investigation.id, { type: 'ack_sent' })
          memory.lastAckAt = now()
          await persist()
        }

        if (directive.kind === 'offer_consent') {
          // Remember the offer, ask the customer, end the turn — their next message answers it.
          memory.pendingOffer = { offer: directive.offer, issueNumber: directive.issueNumber }
          offerMadeThisTurn = true
          await this.compose(
            investigation.id,
            message.conversationId,
            message.content,
            ComposerBriefing.parse({
              intent: 'offer_consent',
              points: findings.slice(-1).map((f) => f.summary.slice(0, 600)),
              offer: directive.offer,
            }),
          )
          await finishTurn()
          return { handled: true, outcome: 'replied', investigationId: investigation.id }
        }

        if (directive.kind === 'attach_known_issue' && this.deps.ticketing !== undefined) {
          // Consent given (kernel-verified against the pending offer): link this
          // conversation to the tracked issue — the fix fan-out rides the ticket.
          const ticket = await this.deps.ticketing.create({
            investigationId: investigation.id,
            conversationId: conversationKey,
          })
          await this.deps.ticketing.linkToIssue(ticket.id, directive.issueNumber)
          audit.record(investigation.id, { type: 'attached_to_issue', data: { issueNumber: directive.issueNumber } })
          memory.pendingOffer = undefined
          await this.compose(
            investigation.id,
            message.conversationId,
            message.content,
            ComposerBriefing.parse({
              intent: 'known_issue',
              points: ["This conversation is now linked to the fix — we'll follow up here the moment it ships."],
            }),
          )
          await finishTurn()
          return { handled: true, outcome: 'known_issue', investigationId: investigation.id }
        }

        if (directive.kind === 'file_ticket' && this.deps.escalation !== undefined && this.deps.ticketing !== undefined) {
          // Consent given (kernel-verified): run the EXISTING escalation pipeline —
          // dedup, redaction, draft/auto policy — with the technical layer from the case.
          const esc = await this.deps.escalation.escalate({
            complaint: memory.complaint ?? message.content,
            classification: 'new_bug',
            feature: memory.technical?.feature,
            hypothesis: memory.technical?.hypothesis,
            suspectedFiles: memory.technical?.suspectedFiles,
            investigationId: investigation.id,
          })
          if (esc.action === 'drafted' && this.deps.draftStore !== undefined && esc.draft !== undefined) {
            const { id: draftId } = await this.deps.draftStore.save({
              investigationId: investigation.id,
              conversationId: conversationKey,
              title: esc.draft.title,
              body: esc.draft.body,
              labels: esc.draft.labels,
              severity: esc.draft.severity,
              signature: esc.signature,
              openMatchIssue: esc.openMatchIssue,
            })
            audit.record(investigation.id, { type: 'draft_created', data: { draftId, signature: esc.signature } })
          }
          const ticket = await this.deps.ticketing.create({
            investigationId: investigation.id,
            conversationId: conversationKey,
          })
          if (esc.issueNumber !== undefined) await this.deps.ticketing.linkToIssue(ticket.id, esc.issueNumber)
          await investigations.setStatus(investigation.id, 'escalated')
          await investigations.classify?.(
            investigation.id,
            esc.classification,
            esc.reproduced ? 0.95 : memory.technical?.confidence ?? 0.7,
          )
          memory.pendingOffer = undefined
          await this.compose(
            investigation.id,
            message.conversationId,
            message.content,
            ComposerBriefing.parse({ intent: 'escalation_notice' }),
          )
          await finishTurn()
          return { handled: true, outcome: 'escalated', investigationId: investigation.id }
        }

        if (directive.kind === 'consult_account' && this.deps.account !== undefined && verified !== null) {
          consultsUsed++
          const result = await this.deps.account.investigate(verified)
          // Only the customer-safe summary crosses into the case — raw rows never leave the investigator.
          findings.push({ summary: result.summary })
          if (result.classificationHint !== undefined) {
            await investigations.classify?.(investigation.id, result.classificationHint, 0.7)
          }
        } else if (directive.kind === 'consult_code' && this.deps.codeAnalyst !== undefined) {
          consultsUsed++
          const result = await this.deps.codeAnalyst.investigate(directive.brief)
          // Split the layers at the boundary: product language becomes a finding
          // (composable), the technical layer goes to case memory only.
          memory.technical = {
            hypothesis: result.hypothesis,
            suspectedFiles: result.suspectedFiles,
            confidence: result.confidence,
            verdict: result.verdict,
          }
          findings.push({ summary: result.explanation })
        } else if (directive.kind === 'consult_docs') {
          consultsUsed++
          const chunks = await docs.retrieve(directive.query, 5)
          findings.push({
            summary:
              chunks.length > 0
                ? `Documentation says: ${chunks.map((c) => c.text).join(' ').slice(0, 600)}`
                : 'Documentation search found nothing relevant.',
          })
          for (const chunk of chunks.slice(0, 3)) extracts.push({ title: chunk.title, text: chunk.text.slice(0, 2000) })
        } else if (directive.kind === 'ask_clarifying') {
          await this.compose(
            investigation.id,
            message.conversationId,
            message.content,
            ComposerBriefing.parse({ intent: 'ask_clarifying', question: directive.question }),
          )
          await finishTurn()
          return { handled: true, outcome: 'replied', investigationId: investigation.id }
        } else if (directive.kind === 'compose_reply') {
          await this.compose(investigation.id, message.conversationId, message.content, {
            ...briefingFromFindings(findings),
            intent: directive.intent,
            docExtracts: extracts.slice(0, 3),
          })
          await finishTurn()
          return { handled: true, outcome: 'replied', investigationId: investigation.id }
        }
        // Other directives (consent/attach/file) arrive with the consent + case issues;
        // until then the kernel denies them (no capability / no pending offer).
      }
    }

    // Rounds exhausted without a compose — answer with what we have.
    audit.record(investigation.id, { type: 'rounds_exhausted' })
    await this.compose(investigation.id, message.conversationId, message.content, {
      ...briefingFromFindings(findings),
      docExtracts: extracts.slice(0, 3),
    })
    await finishTurn()
    return { handled: true, outcome: 'replied', investigationId: investigation.id }
    } catch (error) {
      // A metered model breached a cap mid-turn: degrade gracefully, hand to the founder.
      if (error instanceof Error && error.name === 'BudgetExceededError') {
        await this.send(investigation.id, message.conversationId, BUDGET_MESSAGE)
        await investigations.setStatus(investigation.id, 'needs_founder')
        await finishTurn()
        return { handled: true, outcome: 'budget_exceeded', investigationId: investigation.id }
      }
      throw error
    }
  }

  /** Compose the reply from a kernel-shaped briefing, then send through the rail. */
  private async compose(
    investigationId: string,
    conversationId: string,
    customerMessage: string,
    briefing: ComposerBriefing,
  ): Promise<void> {
    const text = await this.deps.composer.compose(briefing, { customerMessage })
    await this.send(investigationId, conversationId, text)
  }

  /** Every customer-facing send passes the output rail; violations land in the audit. */
  private async send(investigationId: string, conversationId: string, text: string): Promise<void> {
    const safe = enforceCustomerOutput(text)
    await this.deps.client.sendReply(conversationId, safe.text)
    this.deps.audit.record(investigationId, { type: 'reply', data: { violations: safe.violations } })
  }
}
