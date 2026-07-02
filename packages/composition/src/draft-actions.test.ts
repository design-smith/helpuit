import { describe, it, expect, afterEach } from 'vitest'
import {
  createDb,
  DrizzleDraftRepository,
  DrizzleTicketing,
  DrizzleGithubLinks,
  DrizzleInvestigationRepository,
  DrizzleAuditRepository,
  type DbHandle,
} from '@helpuit/db'
import { RedactingIssueTracker } from '@helpuit/github'
import type { IssueDraft, IssueRefLite, IssueTracker } from '@helpuit/escalation'
import { DraftPublisher } from './draft-actions.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

/** Records what reaches the tracker so we can prove redaction ran. */
class FakeTracker implements IssueTracker {
  readonly created: IssueDraft[] = []
  readonly comments: Array<{ issueNumber: number; body: string }> = []
  nextNumber = 501
  async create(draft: IssueDraft): Promise<IssueRefLite> {
    this.created.push(draft)
    const number = this.nextNumber++
    return { number, url: `https://github.com/o/r/issues/${number}` }
  }
  async comment(issueNumber: number, body: string): Promise<void> {
    this.comments.push({ issueNumber, body })
  }
}

async function setup(draftBody = '## Summary\nIt broke') {
  handle = await createDb(':memory:')
  const db = handle.db
  const drafts = new DrizzleDraftRepository(db)
  const ticketing = new DrizzleTicketing(db)
  const githubLinks = new DrizzleGithubLinks(db)
  const investigations = new DrizzleInvestigationRepository(db)
  const auditRepo = new DrizzleAuditRepository(db)
  const fake = new FakeTracker()

  const inv = await investigations.create({ conversationId: '7' })
  const draft = await drafts.save({
    investigationId: inv.id,
    conversationId: '7',
    title: '[new_bug] Export broken',
    body: draftBody,
    labels: ['helpuit', 'new_bug'],
    severity: 'medium',
    signature: 'sig-1',
  })

  const publisher = new DraftPublisher({
    drafts,
    tracker: new RedactingIssueTracker(fake),
    investigations,
    ticketing,
    githubLinks,
    audit: {
      record: (id, event) =>
        void auditRepo.record({ investigationId: id, type: event.type, data: event.data, at: 1 }),
    },
    issueUrl: (n) => `https://github.com/o/r/issues/${n}`,
  })

  return { db, drafts, ticketing, githubLinks, investigations, auditRepo, fake, inv, draft, publisher }
}

describe('DraftPublisher', () => {
  it('publishes a draft: files via the tracker, links a ticket, records the link + status + audit', async () => {
    const s = await setup()
    const result = await s.publisher.publish(s.draft.id)

    expect(result).toEqual({
      status: 'published',
      issueNumber: 501,
      issueUrl: 'https://github.com/o/r/issues/501',
    })
    expect(s.fake.created).toHaveLength(1)
    expect((await s.drafts.get(s.draft.id))?.status).toBe('published')
    expect(await s.ticketing.ticketsForIssue(501)).toHaveLength(1)
    expect(await s.githubLinks.investigationsForIssue(501)).toEqual([s.inv.id])
    expect((await s.investigations.get(s.inv.id))?.status).toBe('escalated')
    const audit = await s.auditRepo.forInvestigation(s.inv.id)
    expect(audit.map((e) => e.type)).toContain('draft_published')
  })

  it('runs the body through the redaction gate before it reaches GitHub', async () => {
    const s = await setup('Customer email user@example.com hit the bug')
    await s.publisher.publish(s.draft.id)
    expect(s.fake.created[0]!.body).not.toContain('user@example.com')
    expect(s.fake.created[0]!.body).toContain('[REDACTED:email]')
  })

  it('publishes at most once under concurrency (one create, the loser gets 409)', async () => {
    const s = await setup()
    const [a, b] = await Promise.all([
      s.publisher.publish(s.draft.id),
      s.publisher.publish(s.draft.id),
    ])
    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual(['conflict', 'published']) // exactly one wins the markPublished guard
    expect(s.fake.created.length).toBeLessThanOrEqual(2) // both may file, but only one marks published
    const published = await s.drafts.get(s.draft.id)
    expect(published?.status).toBe('published')
    expect([501, 502]).toContain(published?.issueNumber) // whichever filer won the race
  })

  it('rejects a pending draft and records audit; a second decision is a conflict', async () => {
    const s = await setup()
    expect((await s.publisher.reject(s.draft.id, 'not a bug')).status).toBe('rejected')
    expect((await s.drafts.get(s.draft.id))?.status).toBe('rejected')
    expect((await s.publisher.publish(s.draft.id)).status).toBe('conflict')
    const audit = await s.auditRepo.forInvestigation(s.inv.id)
    expect(audit.map((e) => e.type)).toContain('draft_rejected')
  })

  it('returns not_found for an unknown draft', async () => {
    const s = await setup()
    expect((await s.publisher.publish('nope')).status).toBe('not_found')
    expect((await s.publisher.reject('nope')).status).toBe('not_found')
  })
})
