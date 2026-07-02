import { describe, it, expect } from 'vitest'
import { BudgetGovernor, SpendLedger } from '@helpuit/budget'
import { FakeChatwootClient } from '@helpuit/chatwoot'
import { IdentityResolver } from '@helpuit/identity'
import { InMemoryInvestigationRepository } from '@helpuit/investigation-store'
import { InMemoryDocsIndex } from '@helpuit/guidance'
import { AuditLog } from '@helpuit/audit'
import { InMemoryTicketing } from '@helpuit/ticketing'
import { PlannerEngine } from './engine.js'
import { Planner, type ChatPort } from './planner.js'
import { Composer } from './composer.js'
import { PolicyKernel } from './kernel.js'

/** Scripted chat: one canned response per call, in order (repeats the last). */
function scriptedChat(responses: string[]): ChatPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async complete({ messages }) {
      calls.push(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'))
      return { text: responses[Math.min(calls.length - 1, responses.length - 1)]! }
    },
  }
}

function harness(
  overrides: {
    plannerResponses?: string[]
    composerResponses?: string[]
    paused?: boolean
    allowAnonymous?: boolean
    account?: { investigate(identity: { userId: string }): Promise<{ summary: string; classificationHint?: string }> }
    codeAnalyst?: {
      investigate(brief: string): Promise<{
        hypothesis: string
        suspectedFiles: string[]
        confidence: number
        explanation: string
        verdict: 'user_error_or_prerequisite' | 'actual_bug' | 'explains_behavior'
      }>
    }
    knownIssue?: { match(text: string): Promise<{ issueNumber: number; title: string } | null> }
    governor?: BudgetGovernor
    plannerThrows?: Error
    escalation?: {
      calls: unknown[]
      escalate(input: unknown): Promise<{
        action: 'created' | 'linked' | 'drafted'
        issueNumber?: number
        reproduced: boolean
        classification: string
        draft?: { title: string; body: string; labels: string[]; severity: string }
        signature?: string
      }>
    }
  } = {},
) {
  const client = new FakeChatwootClient()
  const investigations = new InMemoryInvestigationRepository({ now: () => 1 })
  const audit = new AuditLog({ now: () => 1 })
  const ticketing = new InMemoryTicketing()
  const draftStore = {
    saved: [] as Array<{ investigationId: string; title: string; body: string }>,
    async save(input: { investigationId: string; conversationId: string; title: string; body: string; labels: string[]; severity: string }) {
      draftStore.saved.push(input)
      return { id: `draft-${draftStore.saved.length}` }
    },
  }
  const docs = new InMemoryDocsIndex()
  docs.ingest([{ id: 'refunds', title: 'Refund policy', text: 'Refunds are processed within five business days.' }])

  const plannerChat = scriptedChat(
    overrides.plannerResponses ?? [
      '{"directives":[{"kind":"consult_docs","query":"refund processing time"}]}',
      '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
    ],
  )
  const composerChat = scriptedChat(overrides.composerResponses ?? ['Refunds take five business days to land.'])
  const plannerPort: ChatPort =
    overrides.plannerThrows !== undefined
      ? { complete: async () => { throw overrides.plannerThrows } }
      : plannerChat

  const engine = new PlannerEngine({
    planner: new Planner(plannerPort),
    composer: new Composer(composerChat),
    kernel: new PolicyKernel({ audit, governor: overrides.governor }),
    docs,
    client,
    identity: new IdentityResolver({ verify: async (t) => (t === 'good' ? { userId: 'u1' } : null) }),
    control: overrides.paused === true ? { isPaused: async () => true } : undefined,
    account: overrides.account,
    codeAnalyst: overrides.codeAnalyst,
    knownIssue: overrides.knownIssue,
    escalation: overrides.escalation,
    draftStore: overrides.escalation !== undefined ? draftStore : undefined,
    ticketing,
    investigations,
    audit,
    config: { allowAnonymous: overrides.allowAnonymous ?? true },
    now: () => 1,
  })
  return { engine, client, audit, investigations, plannerChat, composerChat, docs, ticketing, draftStore }
}

/** The Code Analyst stub every consent test shares: a confirmed real bug. */
const BUG_ANALYST = {
  async investigate() {
    return {
      hypothesis: 'race condition in exportWorker queue drain',
      suspectedFiles: ['src/export-worker.ts'],
      confidence: 0.8,
      explanation: 'Large exports can stall before finishing — this looks like a problem on our side.',
      verdict: 'actual_bug' as const,
    }
  },
}

function bugEscalation() {
  const calls: unknown[] = []
  return {
    calls,
    async escalate(input: unknown) {
      calls.push(input)
      return {
        action: 'drafted' as const,
        reproduced: false,
        classification: 'new_bug',
        draft: { title: '[new_bug] export stall', body: 'hypothesis: race condition in exportWorker queue drain', labels: ['helpuit'], severity: 'medium' },
        signature: 'exports|new_bug',
      }
    },
  }
}

const inbound = (content: string) => ({ message_type: 'incoming', content, conversation: { id: 7 } })
const authed = { customAttributes: { helpuit_auth_token: 'good' } }

describe('PlannerEngine', () => {
  it('answers a docs question end-to-end: consult → re-plan → composed reply, directives audited', async () => {
    const { engine, client, audit, plannerChat } = harness()

    const result = await engine.handleInbound(inbound('how long do refunds take?'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    expect(client.replies).toHaveLength(2) // ack beat, then the answer
    expect(client.replies[1]!.content).toBe('Refunds take five business days to land.')

    // Re-plan actually happened: the second planning round saw the docs finding.
    expect(plannerChat.calls).toHaveLength(2)
    expect(plannerChat.calls[1]).toContain('five business days')

    // Every directive decision is in the audit trail.
    const id = (result as { investigationId: string }).investigationId
    const directives = audit.forInvestigation(id).filter((e) => e.type === 'directive')
    expect(directives).toHaveLength(2)
    expect(directives.every((e) => (e.data as { verdict: string }).verdict === 'allow')).toBe(true)
  })

  it('falls back to a clarifying question when the planner emits garbage twice (never crashes, never raw LLM text)', async () => {
    const { engine, client, audit } = harness({
      plannerResponses: ['I refuse to emit JSON.', 'still prose'],
      composerResponses: ['Could you tell me a little more about what happened?'],
    })

    const result = await engine.handleInbound(inbound('everything is broken!!'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'fallback' })
    expect(client.replies).toHaveLength(1)
    expect(client.replies[0]!.content).toContain('tell me a little more')

    const id = (result as { investigationId: string }).investigationId
    expect(audit.forInvestigation(id).some((e) => e.type === 'planner_fallback')).toBe(true)
  })

  it('the output rail strips a secret the composer echoes before it reaches the customer', async () => {
    const { engine, client } = harness({
      plannerResponses: ['{"directives":[{"kind":"compose_reply","intent":"answer"}]}'],
      composerResponses: ['Set your key to sk-abcdEFGH1234abcdEFGH1234abcdEFGH and retry.'],
    })

    await engine.handleInbound(inbound('how do I configure the integration?'), {})

    expect(client.replies).toHaveLength(1)
    expect(client.replies[0]!.content).not.toContain('sk-abcd')
    expect(client.replies[0]!.content).toContain('[REDACTED:secret]')
  })

  it('remembers the case across turns: a clarifying question ends turn 1, turn 2 resumes with its findings', async () => {
    const { engine, client, audit, plannerChat } = harness({
      plannerResponses: [
        // turn 1: consult docs, then ask the customer a question (turn ends, memory persists)
        '{"directives":[{"kind":"consult_docs","query":"refund processing time"},{"kind":"ask_clarifying","question":"Is this a card or PayPal refund?"}]}',
        // turn 2: the answer arrives — compose from what we know
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
      composerResponses: ['Is this a card or PayPal refund?', 'Refunds land within five business days.'],
    })

    const turn1 = await engine.handleInbound(inbound('how long do refunds take?'), {})
    const turn2 = await engine.handleInbound(inbound('a card refund'), {})

    // Same conversation ⇒ same case.
    const id1 = (turn1 as { investigationId: string }).investigationId
    const id2 = (turn2 as { investigationId: string }).investigationId
    expect(id2).toBe(id1)

    // Turn 2's planner saw turn 1's docs finding (memory survived the turn boundary).
    expect(plannerChat.calls).toHaveLength(2)
    expect(plannerChat.calls[1]).toContain('five business days')

    // Both turns' trail accumulates on the one case (turn 1 also acked before its consult).
    expect(client.replies).toHaveLength(3)
    const trail = audit.forInvestigation(id1)
    expect(trail.filter((e) => e.type === 'reply')).toHaveLength(2)
    expect(trail.filter((e) => e.type === 'ack_sent')).toHaveLength(1)
  })

  it('acks before consulting, but never for a consult-free plan', async () => {
    const withConsult = harness()
    await withConsult.engine.handleInbound(inbound('how long do refunds take?'), {})
    expect(withConsult.client.replies).toHaveLength(2)
    expect(withConsult.client.replies[0]!.content).toMatch(/look into|moment/i) // the ack lands first
    expect(withConsult.client.replies[1]!.content).toBe('Refunds take five business days to land.')

    const direct = harness({
      plannerResponses: ['{"directives":[{"kind":"compose_reply","intent":"answer"}]}'],
      composerResponses: ['Happy to help!'],
    })
    await direct.engine.handleInbound(inbound('hello'), {})
    expect(direct.client.replies).toHaveLength(1) // no consult, no ack
  })

  it('does not re-ack when the job retries mid-flight, and acks again on the NEXT turn', async () => {
    const flaky = { failuresLeft: 1 }
    const { engine, client, docs } = harness({
      plannerResponses: [
        '{"directives":[{"kind":"consult_docs","query":"refund processing time"},{"kind":"compose_reply","intent":"answer"}]}',
      ],
      composerResponses: ['Refunds take five business days to land.'],
    })
    const realRetrieve = docs.retrieve.bind(docs)
    docs.retrieve = (query: string, k?: number) => {
      if (flaky.failuresLeft > 0) {
        flaky.failuresLeft--
        throw new Error('transient outage')
      }
      return realRetrieve(query, k)
    }

    // First delivery: ack goes out, then the consult dies → the job fails (worker will retry).
    await expect(engine.handleInbound(inbound('how long do refunds take?'), {})).rejects.toThrow('transient outage')
    expect(client.replies).toHaveLength(1) // just the ack

    // Retry of the SAME message: no second ack — straight to the answer.
    await engine.handleInbound(inbound('how long do refunds take?'), {})
    expect(client.replies).toHaveLength(2)
    expect(client.replies[1]!.content).toBe('Refunds take five business days to land.')

    // A NEW turn with deep work acks again (the reply cleared the ack marker).
    await engine.handleInbound(inbound('and for PayPal?'), {})
    expect(client.replies).toHaveLength(4)
    expect(client.replies[2]!.content).toMatch(/look into|moment/i)
  })

  it('consult_code: the customer gets the product-language explanation; the technical layer stays in case memory', async () => {
    const codeAnalyst = {
      async investigate() {
        return {
          hypothesis: 'export gate reads subscription.active flag',
          suspectedFiles: ['src/export-gate.ts'],
          confidence: 0.75,
          explanation: 'Exports are only available while a subscription is active — renewing re-enables the button.',
          verdict: 'user_error_or_prerequisite' as const,
        }
      },
    }
    const { engine, client, composerChat, investigations } = harness({
      codeAnalyst,
      plannerResponses: [
        '{"directives":[{"kind":"consult_code","brief":"why is the export button disabled"}]}',
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
      composerResponses: ['Exports need an active subscription — renew it and the button comes back.'],
    })

    const result = await engine.handleInbound(inbound('the export button is greyed out'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    // Instructional reply — a prerequisite verdict never offers a ticket.
    expect(client.replies.at(-1)!.content).toContain('active subscription')
    expect(composerChat.calls[0]).not.toMatch(/consent|offer/i)
    // The composer's entire input carries the explanation but NOT the technical layer.
    expect(composerChat.calls[0]).toContain('renewing re-enables the button')
    expect(composerChat.calls[0]).not.toContain('subscription.active')
    expect(composerChat.calls[0]).not.toContain('export-gate.ts')
    // The technical layer persisted into case memory (for escalation + the console).
    const id = (result as { investigationId: string }).investigationId
    const memory = JSON.parse((await investigations.loadCase(id as never))!) as { technical?: Record<string, unknown> }
    expect(memory.technical).toMatchObject({
      hypothesis: 'export gate reads subscription.active flag',
      verdict: 'user_error_or_prerequisite',
    })
  })

  it('actual_bug → consent offer → "yes" → the escalation pipeline files it, technical layer in the draft, never in the reply', async () => {
    const escalation = bugEscalation()
    const h = harness({
      codeAnalyst: BUG_ANALYST,
      escalation,
      plannerResponses: [
        '{"directives":[{"kind":"consult_code","brief":"export stalls"},{"kind":"offer_consent","offer":"file_ticket"}]}',
        '{"directives":[{"kind":"file_ticket"}]}',
      ],
      composerResponses: [
        'This looks like a genuine problem on our side — want me to log it with the team so you are notified when it is fixed?',
        "Done — I've logged it with the team. We'll follow up right here as soon as it's fixed.",
      ],
    })

    // Turn 1: the offer goes out and is remembered.
    const turn1 = await h.engine.handleInbound(inbound('my export never finishes'), {})
    expect(turn1).toMatchObject({ handled: true, outcome: 'replied' })
    expect(h.client.replies.at(-1)!.content).toMatch(/want me to log it/i)
    const id = (turn1 as { investigationId: string }).investigationId
    expect(JSON.parse((await h.investigations.loadCase(id as never))!).pendingOffer).toMatchObject({ offer: 'file_ticket' })

    // Turn 2: consent — the planner was told about the pending offer, and filing runs the pipeline.
    const turn2 = await h.engine.handleInbound(inbound('yes please'), {})
    expect(h.plannerChat.calls.at(-1)).toContain('Pending consent offer') // pendingOffer reached the planner
    expect(turn2).toMatchObject({ handled: true, outcome: 'escalated', investigationId: id })

    // The pipeline received the TECHNICAL layer…
    expect(escalation.calls[0]).toMatchObject({
      classification: 'new_bug',
      hypothesis: 'race condition in exportWorker queue drain',
      suspectedFiles: ['src/export-worker.ts'],
    })
    // …the draft was persisted for founder review, and a ticket exists on the case.
    expect(h.draftStore.saved[0]!.body).toContain('race condition')
    expect((await h.investigations.get(id as never))?.status).toBe('escalated')
    // The customer reply stays in product language.
    expect(h.client.replies.at(-1)!.content).not.toContain('race condition')
    expect(h.client.replies.at(-1)!.content).not.toContain('export-worker.ts')
    // The consumed offer is gone.
    expect(JSON.parse((await h.investigations.loadCase(id as never))!).pendingOffer).toBeUndefined()
  })

  it('actual_bug → consent offer → "no" → offer cleared, nothing filed, conversation continues', async () => {
    const escalation = bugEscalation()
    const h = harness({
      codeAnalyst: BUG_ANALYST,
      escalation,
      plannerResponses: [
        '{"directives":[{"kind":"consult_code","brief":"export stalls"},{"kind":"offer_consent","offer":"file_ticket"}]}',
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
      composerResponses: ['Want me to log it with the team?', 'No problem — let me know if it happens again.'],
    })

    const turn1 = await h.engine.handleInbound(inbound('my export never finishes'), {})
    const id = (turn1 as { investigationId: string }).investigationId
    await h.engine.handleInbound(inbound('no thanks'), {})

    expect(escalation.calls).toHaveLength(0) // nothing filed
    expect((await h.investigations.get(id as never))?.status).toBe('open') // conversation continues
    expect(JSON.parse((await h.investigations.loadCase(id as never))!).pendingOffer).toBeUndefined() // offer cleared
  })

  it('budget cap reached (kernel probe) ⇒ graceful budget-stop reply + needs_founder, parity with the ladder', async () => {
    const governor = new BudgetGovernor({ perDay: 0 }, new SpendLedger()) // no headroom at all
    const { engine, client, investigations } = harness({
      governor,
      composerResponses: ["I've flagged this for our team to look into directly — we'll follow up here."],
    })

    const result = await engine.handleInbound(inbound('how long do refunds take?'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'budget_exceeded' })
    expect(client.replies.at(-1)!.content).toMatch(/team|follow up/i)
    const id = (result as { investigationId: string }).investigationId
    expect((await investigations.get(id as never))?.status).toBe('needs_founder')
  })

  it('a thrown BudgetExceededError from a metered model also degrades gracefully to needs_founder', async () => {
    const boom = new Error('daily budget cap reached')
    boom.name = 'BudgetExceededError'
    const { engine, client, investigations } = harness({ plannerThrows: boom })

    const result = await engine.handleInbound(inbound('hello'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'budget_exceeded' })
    expect(client.replies).toHaveLength(1)
    expect(client.replies[0]!.content).toMatch(/team|follow up/i)
    const id = (result as { investigationId: string }).investigationId
    expect((await investigations.get(id as never))?.status).toBe('needs_founder')
  })

  it('stays completely silent on a founder-paused conversation (no reply, no case, no planning)', async () => {
    const { engine, client, plannerChat, investigations } = harness({ paused: true })

    const result = await engine.handleInbound(inbound('hello?'), {})

    expect(result).toEqual({ handled: true, outcome: 'paused' })
    expect(client.replies).toHaveLength(0)
    expect(plannerChat.calls).toHaveLength(0)
    expect((await investigations.getOrCreateForConversation('7')).id).toBe('inv-1') // nothing pre-existing
  })

  it('kernel-denies consult_account for an anonymous customer; the planner re-plans to a docs answer', async () => {
    const { engine, client, plannerChat, audit } = harness({
      plannerResponses: [
        '{"directives":[{"kind":"consult_account","brief":"check subscription"}]}',
        '{"directives":[{"kind":"consult_docs","query":"refund processing time"},{"kind":"compose_reply","intent":"answer"}]}',
      ],
    })

    const result = await engine.handleInbound(inbound('why was I charged twice?'), {}) // anonymous

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    // Round 2 was told exactly why round 1's directive was refused.
    expect(plannerChat.calls[1]).toMatch(/identity|verified|anonymous/i)
    // The customer still got a real answer (ack + composed reply), never an error.
    expect(client.replies.at(-1)!.content).toBe('Refunds take five business days to land.')
    const id = (result as { investigationId: string }).investigationId
    expect(audit.forInvestigation(id).some((e) => e.type === 'directive' && (e.data as { verdict: string }).verdict === 'deny')).toBe(true)
  })

  it('runs the account consult for a VERIFIED customer — only the customer-safe summary enters the case', async () => {
    const seen: Array<{ userId: string }> = []
    const account = {
      async investigate(identity: { userId: string }) {
        seen.push(identity)
        return { summary: 'Your subscription payment is past due, which pauses exports.', classificationHint: 'account_data_issue' }
      },
    }
    const { engine, client, plannerChat, composerChat } = harness({
      account,
      plannerResponses: [
        '{"directives":[{"kind":"consult_account","brief":"check subscription state"}]}',
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
      composerResponses: ['It looks like your subscription payment is past due — that pauses exports.'],
    })

    const result = await engine.handleInbound(inbound('why can I not export?'), authed)

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    expect(seen).toEqual([{ userId: 'u1' }]) // scoped to the VERIFIED identity, never chat-asserted
    expect(plannerChat.calls[1]).toContain('past due') // the summary became a finding for re-planning
    expect(composerChat.calls[0]).toContain('past due') // and reached the composer briefing
    expect(client.replies[0]!.content).toMatch(/look into|moment/i) // deep work still acks first
  })

  it('denies an unverified customer when anonymous access is off — login reply, no case', async () => {
    const { engine, client, plannerChat } = harness({ allowAnonymous: false })

    const result = await engine.handleInbound(inbound('what is my plan?'), {}) // no auth token in context

    expect(result).toEqual({ handled: true, outcome: 'denied' })
    expect(client.replies).toHaveLength(1)
    expect(client.replies[0]!.content).toMatch(/log in/i)
    expect(plannerChat.calls).toHaveLength(0) // denied before any planning spend
  })
})

describe('PlannerEngine known-issue flow', () => {
  const MATCH = {
    async match() {
      return { issueNumber: 7, title: 'Large export stalls' }
    },
  }

  it('short-circuits a fresh case to a known-issue acknowledgment + attach offer — zero planner spend', async () => {
    const { engine, client, plannerChat, composerChat, investigations, audit } = harness({
      knownIssue: MATCH,
      composerResponses: ["We're already tracking this — want me to link your conversation so you hear the moment it's fixed?"],
    })

    const result = await engine.handleInbound(inbound('my export hangs at 99% and never finishes'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    expect(plannerChat.calls).toHaveLength(0) // matched before any planning spend
    expect(client.replies).toHaveLength(1)
    expect(composerChat.calls[0]).toContain('Large export stalls') // the briefing carried the issue title

    const id = (result as { investigationId: string }).investigationId
    const memory = JSON.parse((await investigations.loadCase(id as never))!) as {
      pendingOffer?: { offer: string; issueNumber?: number }
    }
    expect(memory.pendingOffer).toEqual({ offer: 'attach_known_issue', issueNumber: 7 })
    expect(audit.forInvestigation(id).some((e) => e.type === 'known_issue_match')).toBe(true)
  })

  it('attaches on yes: ticket created and linked to the issue, offer cleared, matcher never re-fires', async () => {
    const { engine, ticketing, investigations, plannerChat } = harness({
      knownIssue: MATCH,
      plannerResponses: ['{"directives":[{"kind":"attach_known_issue","issueNumber":7}]}'],
      composerResponses: [
        "We're already tracking this — want me to link your conversation?",
        "Done — you're linked to the fix and we'll follow up here the moment it ships.",
      ],
    })

    await engine.handleInbound(inbound('my export hangs at 99%'), {})
    const result = await engine.handleInbound(inbound('yes please'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'known_issue' })
    expect(plannerChat.calls).toHaveLength(1) // turn 2 planned; turn 1 short-circuited, matcher not re-run
    expect(await ticketing.ticketsForIssue(7)).toHaveLength(1) // the fix fan-out pool sees this conversation

    const id = (result as { investigationId: string }).investigationId
    const memory = JSON.parse((await investigations.loadCase(id as never))!) as { pendingOffer?: unknown }
    expect(memory.pendingOffer).toBeUndefined()
  })

  it('a declined offer never re-nags: the matcher is once-per-case', async () => {
    const { engine, client, plannerChat } = harness({
      knownIssue: MATCH,
      plannerResponses: ['{"directives":[{"kind":"compose_reply","intent":"answer"}]}'],
      composerResponses: ['Understood — tell me if anything changes.', 'Anything else I can help with?'],
    })

    await engine.handleInbound(inbound('my export hangs'), {}) // offer made
    await engine.handleInbound(inbound('no thanks'), {}) // declined → offer cleared
    const result = await engine.handleInbound(inbound('my export still hangs'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    expect(plannerChat.calls).toHaveLength(2) // turns 2 and 3 both planned — no fresh offer hijack
    expect(client.replies).toHaveLength(3)
  })

  it('no match → the normal planning flow, untouched', async () => {
    const { engine, client, plannerChat } = harness({ knownIssue: { match: async () => null } })

    const result = await engine.handleInbound(inbound('how long do refunds take?'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    expect(plannerChat.calls).toHaveLength(2) // docs consult + re-plan, exactly like the tracer
    expect(client.replies.at(-1)!.content).toBe('Refunds take five business days to land.')
  })
})

describe('PlannerEngine platform adaptation (cutover parity)', () => {
  it('namespaces state by connectionId but replies to the native id (adapter-driven)', async () => {
    const base = harness()
    const engine = new PlannerEngine({
      planner: new Planner(scriptedChat(['{"directives":[{"kind":"compose_reply","intent":"answer"}]}'])),
      composer: new Composer(scriptedChat(['Click Save on the billing page.'])),
      kernel: new PolicyKernel({ audit: base.audit }),
      docs: base.docs,
      client: base.client,
      identity: new IdentityResolver({ verify: async () => null }),
      investigations: base.investigations,
      audit: base.audit,
      config: { allowAnonymous: true },
      parse: () => ({ conversationId: '123', content: 'how do I save billing?' }),
      connectionId: 'intercom-1',
      now: () => 1,
    })

    const result = await engine.handleInbound({ anything: true }, {})

    expect(result).toMatchObject({ handled: true, outcome: 'replied' })
    expect(base.client.replies[0]!.conversationId).toBe('123') // reply hits the native id
    const id = (result as { investigationId: string }).investigationId
    expect((await base.investigations.get(id as never))?.conversationId).toBe('intercom-1:123') // state namespaced
  })

  it('records the account classification hint on the case (console-chip parity with the ladder)', async () => {
    const { engine, investigations } = harness({
      account: {
        async investigate() {
          return { summary: 'Subscription is past due.', classificationHint: 'account_data_issue' }
        },
      },
      plannerResponses: [
        '{"directives":[{"kind":"consult_account","brief":"check subscription"}]}',
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
    })

    const result = await engine.handleInbound(inbound('why can I not export?'), authed)

    const id = (result as { investigationId: string }).investigationId
    const inv = await investigations.get(id as never)
    expect(inv?.classification).toBe('account_data_issue')
  })

  it('records the escalation classification when a consented ticket is filed', async () => {
    const escalation = bugEscalation()
    const { engine, investigations } = harness({
      codeAnalyst: BUG_ANALYST,
      escalation,
      plannerResponses: ['{"directives":[{"kind":"file_ticket"}]}'],
      composerResponses: ['Logged — the team will follow up here.'],
    })
    // Seed the consent the kernel requires.
    const inv = await investigations.getOrCreateForConversation('7')
    await investigations.saveCase(inv.id, JSON.stringify({ pendingOffer: { offer: 'file_ticket' }, complaint: 'export breaks' }))

    const result = await engine.handleInbound(inbound('yes go ahead'), {})

    expect(result).toMatchObject({ handled: true, outcome: 'escalated' })
    const after = await investigations.get(inv.id as never)
    expect(after?.classification).toBe('new_bug')
  })
})
