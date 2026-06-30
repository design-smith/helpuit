import { describe, it, expect } from 'vitest'
import { InMemoryTicketing } from '@helpuit/ticketing'
import { FakeChatwootClient } from '@helpuit/chatwoot'
import {
  parseGitHubEvent,
  nextTicketState,
  shouldNotifyCustomer,
  LifecycleSync,
  type GitHubIssueEvent,
} from './sync.js'

describe('parseGitHubEvent', () => {
  it('parses a closed-as-completed issue event', () => {
    const event = parseGitHubEvent({
      action: 'closed',
      issue: { number: 42, state_reason: 'completed' },
    })
    expect(event).toEqual({ type: 'closed', issueNumber: 42, closeReason: 'completed' })
  })

  it('treats a not_planned closure distinctly and ignores unknown actions', () => {
    expect(parseGitHubEvent({ action: 'closed', issue: { number: 1, state_reason: 'not_planned' } }))
      .toMatchObject({ closeReason: 'not_planned' })
    expect(parseGitHubEvent({ action: 'labeled', issue: { number: 1 } })).toBeNull()
  })
})

describe('nextTicketState', () => {
  it('moves a completed closure to resolved-pending', () => {
    const state = nextTicketState({ type: 'closed', issueNumber: 1, closeReason: 'completed' })
    expect(state.status).toBe('resolved_pending_customer_update')
  })

  it('does not set a resolved status for a not_planned closure', () => {
    const state = nextTicketState({ type: 'closed', issueNumber: 1, closeReason: 'not_planned' })
    expect(state.status).toBeUndefined()
    expect(state.note).toMatch(/founder/i)
  })
})

describe('shouldNotifyCustomer', () => {
  const completed: GitHubIssueEvent = { type: 'closed', issueNumber: 1, closeReason: 'completed' }
  it('notifies only on an auto-mode completed closure', () => {
    expect(shouldNotifyCustomer(completed, 'auto')).toBe(true)
    expect(shouldNotifyCustomer(completed, 'manual')).toBe(false)
    expect(
      shouldNotifyCustomer({ type: 'closed', issueNumber: 1, closeReason: 'not_planned' }, 'auto'),
    ).toBe(false)
  })
})

describe('LifecycleSync.handleEvent', () => {
  async function withLinkedTickets(mode: 'auto' | 'manual') {
    const ticketing = new InMemoryTicketing()
    const a = await ticketing.create({ investigationId: 'inv-1', conversationId: 11 })
    const b = await ticketing.create({ investigationId: 'inv-2', conversationId: 22 })
    await ticketing.linkToIssue(a.id, 42)
    await ticketing.linkToIssue(b.id, 42)
    const client = new FakeChatwootClient()
    return { sync: new LifecycleSync({ ticketing, client, mode }), client }
  }

  it('fans the "try again" message out to every linked customer on an auto completed close', async () => {
    const { sync, client } = await withLinkedTickets('auto')
    const outcome = await sync.handleEvent({
      type: 'closed',
      issueNumber: 42,
      closeReason: 'completed',
    })
    expect(outcome.notified).toBe(2)
    expect(client.replies.map((r) => r.conversationId).sort()).toEqual([11, 22])
    expect(client.notes).toHaveLength(2)
  })

  it('records the issue open/closed status on the github links (when wired)', async () => {
    const ticketing = new InMemoryTicketing()
    const client = new FakeChatwootClient()
    const updates: Array<{ n: number; status: string; at: number }> = []
    const githubLinks = {
      updateStatus: async (n: number, status: string, at: number) => void updates.push({ n, status, at }),
    }
    const sync = new LifecycleSync({ ticketing, client, mode: 'manual', githubLinks, now: () => 999 })

    await sync.handleEvent({ type: 'closed', issueNumber: 42, closeReason: 'completed' })
    expect(updates).toEqual([{ n: 42, status: 'closed', at: 999 }])

    await sync.handleEvent({ type: 'opened', issueNumber: 42 })
    expect(updates).toContainEqual({ n: 42, status: 'open', at: 999 })
  })

  it('in manual mode posts private notes but does not message customers', async () => {
    const { sync, client } = await withLinkedTickets('manual')
    const outcome = await sync.handleEvent({
      type: 'closed',
      issueNumber: 42,
      closeReason: 'completed',
    })
    expect(outcome.notified).toBe(0)
    expect(client.replies).toHaveLength(0)
    expect(client.notes).toHaveLength(2)
  })
})
