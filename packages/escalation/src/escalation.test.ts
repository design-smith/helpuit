import { describe, it, expect } from 'vitest'
import { EscalationAgent, draftIssue, type IssueDraft, type IssueTracker } from './escalation.js'

function fakeTracker() {
  const state = {
    created: [] as IssueDraft[],
    comments: [] as Array<{ issueNumber: number; body: string }>,
    async create(draft: IssueDraft) {
      state.created.push(draft)
      return { number: 100 + state.created.length, url: 'https://gh/x/y/issues' }
    },
    async comment(issueNumber: number, body: string) {
      state.comments.push({ issueNumber, body })
    },
  }
  return state
}

const input = {
  classification: 'new_bug' as const,
  safeSummary: 'Saving the billing form returns a 500.',
  hypothesis: 'null deref in the save handler',
  suspectedFiles: ['BillingForm.vue'],
  reproduced: true,
}

describe('EscalationAgent', () => {
  it('files a new issue when autopublish is on and there is no open match', async () => {
    const tracker = fakeTracker()
    const result = await new EscalationAgent(tracker, { autopublish: true }).escalate(input)
    expect(result.action).toBe('created')
    expect(result.issueNumber).toBe(101)
    expect(tracker.created).toHaveLength(1)
  })

  it('links to an open matching issue instead of filing a duplicate', async () => {
    const tracker = fakeTracker()
    const result = await new EscalationAgent(tracker, { autopublish: true }).escalate({
      ...input,
      openMatchIssue: 42,
    })
    expect(result.action).toBe('linked')
    expect(result.issueNumber).toBe(42)
    expect(tracker.created).toHaveLength(0)
    expect(tracker.comments[0]!.issueNumber).toBe(42)
  })

  it('returns a draft without filing when autopublish is off', async () => {
    const tracker = fakeTracker()
    const result = await new EscalationAgent(tracker, { autopublish: false }).escalate(input)
    expect(result.action).toBe('drafted')
    expect(result.issueNumber).toBeUndefined()
    expect(tracker.created).toHaveLength(0)
  })
})

describe('draftIssue', () => {
  it('includes the safe summary and suspected files, and labels by classification', () => {
    const draft = draftIssue(input)
    expect(draft.title).toContain('new_bug')
    expect(draft.body).toContain('Saving the billing form returns a 500.')
    expect(draft.body).toContain('BillingForm.vue')
    expect(draft.labels).toContain('new_bug')
    expect(draft.labels).toContain('reproduced')
    expect(draft.severity).toBe('high')
  })
})
