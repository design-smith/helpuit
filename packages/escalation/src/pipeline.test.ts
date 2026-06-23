import { describe, it, expect } from 'vitest'
import { computeSignature, type IssueRef, type IssueSearch } from '@helpuit/dedup'
import type { IssueDraft, IssueRefLite, IssueTracker } from './escalation.js'
import { EscalationPipeline } from './pipeline.js'

function recordingTracker() {
  const created: IssueDraft[] = []
  const comments: Array<{ number: number; body: string }> = []
  const tracker: IssueTracker = {
    async create(draft: IssueDraft): Promise<IssueRefLite> {
      created.push(draft)
      return { number: 100 + created.length, url: 'https://gh/x' }
    },
    async comment(number: number, body: string) {
      comments.push({ number, body })
    },
  }
  return { tracker, created, comments }
}

const search = (issues: IssueRef[]): IssueSearch => ({ async search() { return issues } })

describe('EscalationPipeline', () => {
  it('files a new issue with an embedded signature when none exists', async () => {
    const t = recordingTracker()
    const pipeline = new EscalationPipeline({ tracker: t.tracker, search: search([]), autopublish: true })

    const outcome = await pipeline.escalate({
      complaint: 'save broken',
      classification: 'new_bug',
      feature: 'Billing',
    })

    expect(outcome.action).toBe('created')
    expect(t.created).toHaveLength(1)
    expect(t.created[0]!.body).toContain('helpuit-signature:')
  })

  it('links to an open matching issue instead of filing a duplicate', async () => {
    const signature = computeSignature({ feature: 'Billing', errorClass: 'new_bug' })
    const t = recordingTracker()
    const pipeline = new EscalationPipeline({
      tracker: t.tracker,
      search: search([{ number: 42, url: 'u', state: 'open', signature }]),
      autopublish: true,
    })

    const outcome = await pipeline.escalate({
      complaint: 'same bug',
      classification: 'new_bug',
      feature: 'Billing',
    })

    expect(outcome.action).toBe('linked')
    expect(outcome.issueNumber).toBe(42)
    expect(t.created).toHaveLength(0)
    expect(t.comments[0]!.number).toBe(42)
  })

  it('holds a draft (no filing) when autopublish is off', async () => {
    const t = recordingTracker()
    const pipeline = new EscalationPipeline({ tracker: t.tracker, search: search([]), autopublish: false })
    const outcome = await pipeline.escalate({ complaint: 'x', classification: 'new_bug', feature: 'Billing' })
    expect(outcome.action).toBe('drafted')
    expect(t.created).toHaveLength(0)
  })
})
