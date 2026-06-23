import { describe, it, expect } from 'vitest'
import { FakeChatwootClient } from '@helpuit/chatwoot'
import { IdentityResolver } from '@helpuit/identity'
import { InMemoryInvestigationRepository } from '@helpuit/investigation-store'
import { GuidanceAgent, InMemoryDocsIndex, type GuidanceModel } from '@helpuit/guidance'
import { InMemoryTicketing } from '@helpuit/ticketing'
import { AuditLog } from '@helpuit/audit'
import type { MatchVerdict } from '@helpuit/dedup'
import type { Classification } from '@helpuit/contracts'
import type { VerifiedIdentity } from '@helpuit/identity'
import { Orchestrator } from './orchestrator.js'

interface AccountInvestigationStub {
  investigate(
    identity: VerifiedIdentity,
  ): Promise<{ summary: string; classificationHint?: Classification }>
}

interface StaticInvestigationStub {
  investigate(complaint: string): Promise<{ confidence: number }>
}

interface DraftStub {
  title: string
  body: string
  labels: string[]
  severity: 'low' | 'medium' | 'high'
}

interface EscalationStub {
  escalate(input: { complaint: string; classification: Classification }): Promise<{
    action: 'created' | 'linked' | 'drafted'
    issueNumber?: number
    reproduced: boolean
    classification: Classification
    draft?: DraftStub
    signature?: string
    openMatchIssue?: number
  }>
}

interface SavedDraft {
  investigationId: string
  conversationId: number
  title: string
  body: string
  labels: string[]
  severity: string
  signature?: string
  openMatchIssue?: number
}

class DraftStoreStub {
  readonly saved: SavedDraft[] = []
  async save(input: SavedDraft): Promise<{ id: string }> {
    this.saved.push(input)
    return { id: `draft-${this.saved.length}` }
  }
}

interface HarnessOverrides {
  modelMessage?: string
  modelConfidence?: number
  knownIssue?: (complaint: string) => Promise<MatchVerdict>
  allowAnonymous?: boolean
  accountInvestigation?: AccountInvestigationStub
  staticInvestigation?: StaticInvestigationStub
  escalation?: EscalationStub
  draftStore?: DraftStoreStub
  control?: { isPaused: (conversationId: number) => Promise<boolean> }
}

function harness(overrides: HarnessOverrides = {}) {
  const client = new FakeChatwootClient()
  const identity = new IdentityResolver({ verify: async (t) => (t === 'good' ? { userId: 'u1' } : null) })
  const investigations = new InMemoryInvestigationRepository({ now: () => 1 })
  const docs = new InMemoryDocsIndex()
  docs.ingest([{ id: 'd1', text: 'click save on the billing page' }])
  const model: GuidanceModel = {
    async generate() {
      return {
        message: overrides.modelMessage ?? 'Click Save on the billing page.',
        confidence: overrides.modelConfidence ?? 0.9,
      }
    },
  }
  const guidance = new GuidanceAgent(docs, model)
  const ticketing = new InMemoryTicketing()
  const audit = new AuditLog({ now: () => 1 })
  const knownIssue =
    overrides.knownIssue ?? (async (): Promise<MatchVerdict> => ({ verdict: 'none', issue: null }))

  const orchestrator = new Orchestrator({
    client,
    identity,
    investigations,
    guidance,
    ticketing,
    audit,
    knownIssue,
    accountInvestigation: overrides.accountInvestigation,
    staticInvestigation: overrides.staticInvestigation,
    escalation: overrides.escalation,
    draftStore: overrides.draftStore,
    control: overrides.control,
    config: { allowAnonymous: overrides.allowAnonymous ?? false, guidanceThreshold: 0.7 },
  })
  return { orchestrator, client, investigations, ticketing, audit, draftStore: overrides.draftStore }
}

const authed = { customAttributes: { helpuit_auth_token: 'good' } }

describe('Orchestrator.handleInbound', () => {
  it('strips a secret the model echoes into a guidance answer before it reaches the customer', async () => {
    const { orchestrator, client } = harness({
      modelMessage: 'Set your API key to sk-abcdEFGH1234abcdEFGH1234abcdEFGH and try again.',
    })

    await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'how do I configure the integration?', conversation: { id: 7 } },
      authed,
    )

    expect(client.replies).toHaveLength(1)
    expect(client.replies[0]!.content).not.toContain('sk-abcd')
    expect(client.replies[0]!.content).toContain('[REDACTED:secret]')
  })

  it('stays silent on a founder-paused conversation: no reply, no investigation', async () => {
    const { orchestrator, client, investigations } = harness({
      control: { isPaused: async (id) => id === 7 },
    })

    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'help me', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toEqual({ handled: true, outcome: 'paused' })
    expect(client.replies).toHaveLength(0)
    // nothing was created — the gate returns before any investigation is opened
    expect(await investigations.get('inv-1' as never)).toBeNull()
  })

  it('handles an authenticated customer message: creates an investigation and replies with guidance', async () => {
    const { orchestrator, client, investigations } = harness()
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'save on billing is broken', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toMatchObject({ handled: true, outcome: 'guided' })
    expect(client.replies).toHaveLength(1)
    expect(client.replies[0]!.content).toContain('Click Save')
    if (outcome.handled && 'investigationId' in outcome) {
      const inv = await investigations.get(outcome.investigationId as never)
      expect(inv?.conversationId).toBe(7)
    }
  })

  it('ignores non-customer events (no reply, not handled)', async () => {
    const { orchestrator, client } = harness()
    const outcome = await orchestrator.handleInbound(
      { message_type: 'outgoing', content: 'bot says hi', conversation: { id: 7 } },
      authed,
    )
    expect(outcome).toEqual({ handled: false })
    expect(client.replies).toHaveLength(0)
  })

  it('denies an unauthenticated user with a login prompt and creates no investigation', async () => {
    const { orchestrator, client, audit } = harness()
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'help', conversation: { id: 7 } },
      { customAttributes: {} },
    )
    expect(outcome).toEqual({ handled: true, outcome: 'denied' })
    expect(client.replies[0]!.content).toMatch(/log in/i)
    // No investigation was created, so nothing was audited.
    expect(audit.forInvestigation('inv-1')).toHaveLength(0)
  })

  it('runs the guidance reply through the output rail', async () => {
    const { orchestrator, client } = harness({
      modelMessage: 'Run SELECT * FROM users to check, or edit src/app/Billing.tsx.',
    })
    await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'broken', conversation: { id: 7 } },
      authed,
    )
    expect(client.replies[0]!.content).not.toContain('SELECT')
    expect(client.replies[0]!.content).not.toContain('Billing.tsx')
  })

  it('short-circuits a known open issue: links a ticket and tells the customer', async () => {
    const { orchestrator, client, ticketing, audit } = harness({
      knownIssue: async () => ({
        verdict: 'open',
        issue: { number: 123, url: 'https://gh/issues/123', state: 'open' },
      }),
    })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'exports failing', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toMatchObject({ handled: true, outcome: 'known_issue' })
    expect(client.replies[0]!.content).toMatch(/affecting several users/i)
    expect(await ticketing.ticketsForIssue(123)).toHaveLength(1)
    if (outcome.handled && 'investigationId' in outcome) {
      const types = audit.forInvestigation(outcome.investigationId as never).map((e) => e.type)
      expect(types).toEqual(['created', 'known_issue'])
    }
  })

  it('marks low-confidence guidance as needing escalation when no deeper capability is wired', async () => {
    const { orchestrator } = harness({ modelConfidence: 0.2 })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'broken', conversation: { id: 7 } },
      authed,
    )
    expect(outcome).toMatchObject({ handled: true, outcome: 'needs_escalation' })
  })

  it('escalates low-confidence guidance to account investigation (L1→L2) when available', async () => {
    const { orchestrator, client, investigations } = harness({
      modelConfidence: 0.2,
      accountInvestigation: {
        async investigate() {
          return {
            summary: 'You are on the Basic plan, where exports are disabled.',
            classificationHint: 'account_data_issue',
          }
        },
      },
    })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'exports do not work', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toMatchObject({ handled: true, outcome: 'account_investigated' })
    expect(client.replies[0]!.content).toMatch(/Basic plan/)
    if (outcome.handled && 'investigationId' in outcome) {
      const inv = await investigations.get(outcome.investigationId as never)
      expect(inv?.level).toBe('account')
      expect(inv?.classification).toBe('account_data_issue')
    }
  })

  it('escalates to static investigation (L2→L3a) when account state does not explain the issue', async () => {
    const { orchestrator, client, investigations } = harness({
      modelConfidence: 0.2,
      accountInvestigation: {
        async investigate() {
          return { summary: 'Account looks normal — plan and flags are fine.' }
        },
      },
      staticInvestigation: {
        async investigate() {
          return { confidence: 0.85 }
        },
      },
    })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'the save button does nothing', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toMatchObject({ handled: true, outcome: 'static_investigated' })
    expect(client.replies[0]!.content).toMatch(/escalat/i)
    if (outcome.handled && 'investigationId' in outcome) {
      const inv = await investigations.get(outcome.investigationId as never)
      expect(inv?.level).toBe('static_repro')
      expect(inv?.classification).toBe('new_bug')
    }
  })

  it('replies with the account summary when account state has no explanation and no static capability is wired', async () => {
    const { orchestrator, client } = harness({
      modelConfidence: 0.2,
      accountInvestigation: {
        async investigate() {
          return { summary: 'Account looks normal.' }
        },
      },
    })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'broken', conversation: { id: 7 } },
      authed,
    )
    expect(outcome).toMatchObject({ handled: true, outcome: 'account_investigated' })
    expect(client.replies[0]!.content).toMatch(/Account looks normal/)
  })

  it('escalates a suspected bug to issue filing (L3a→L4) when escalation is wired', async () => {
    const { orchestrator, client, investigations, ticketing } = harness({
      modelConfidence: 0.2,
      accountInvestigation: {
        async investigate() {
          return { summary: 'Account looks normal.' }
        },
      },
      staticInvestigation: {
        async investigate() {
          return { confidence: 0.85 }
        },
      },
      escalation: {
        async escalate() {
          return { action: 'created', issueNumber: 200, reproduced: true, classification: 'new_bug' }
        },
      },
    })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'save returns 500', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toMatchObject({ handled: true, outcome: 'escalated' })
    expect(client.replies[0]!.content).toMatch(/escalated it to engineering/i)
    expect(await ticketing.ticketsForIssue(200)).toHaveLength(1)
    if (outcome.handled && 'investigationId' in outcome) {
      const inv = await investigations.get(outcome.investigationId as never)
      expect(inv?.status).toBe('escalated')
      expect(inv?.level).toBe('dynamic_repro')
    }
  })

  it('persists a drafted issue for approval (autopublish=draft) and still tells the customer', async () => {
    const draftStore = new DraftStoreStub()
    const { orchestrator, client, investigations, audit } = harness({
      modelConfidence: 0.2,
      accountInvestigation: { async investigate() { return { summary: 'Account looks normal.' } } },
      staticInvestigation: { async investigate() { return { confidence: 0.85 } } },
      draftStore,
      escalation: {
        async escalate() {
          return {
            action: 'drafted',
            reproduced: false,
            classification: 'new_bug',
            draft: {
              title: '[new_bug] Save returns 500',
              body: '## Summary\nSave fails',
              labels: ['helpuit', 'new_bug'],
              severity: 'medium',
            },
            signature: 'sig-xyz',
          }
        },
      },
    })

    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'save returns 500', conversation: { id: 7 } },
      authed,
    )

    expect(outcome).toMatchObject({ handled: true, outcome: 'escalated' })
    // the draft was persisted for approval (not lost)
    expect(draftStore.saved).toHaveLength(1)
    expect(draftStore.saved[0]).toMatchObject({
      conversationId: 7,
      title: '[new_bug] Save returns 500',
      signature: 'sig-xyz',
    })
    // customer still gets the escalation message; a ticket exists (unlinked, no issue yet)
    expect(client.replies[0]!.content).toMatch(/escalated it to engineering/i)
    if (outcome.handled && 'investigationId' in outcome) {
      const inv = await investigations.get(outcome.investigationId as never)
      expect(inv?.status).toBe('escalated')
      const types = audit.forInvestigation(outcome.investigationId as never).map((e) => e.type)
      expect(types).toContain('draft_created')
    }
  })

  it('does not run account investigation for an anonymous user (no verified identity)', async () => {
    const { orchestrator } = harness({
      modelConfidence: 0.2,
      allowAnonymous: true,
      accountInvestigation: {
        async investigate() {
          throw new Error('must not run without a verified identity')
        },
      },
    })
    const outcome = await orchestrator.handleInbound(
      { message_type: 'incoming', content: 'broken', conversation: { id: 7 } },
      { customAttributes: {} },
    )
    expect(outcome).toMatchObject({ handled: true, outcome: 'needs_escalation' })
  })
})
