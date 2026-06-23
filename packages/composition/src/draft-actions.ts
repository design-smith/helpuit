import { investigationId } from '@helpuit/contracts'
import type { InvestigationRepository } from '@helpuit/investigation-store'
import type { IssueDraft, IssueTracker } from '@helpuit/escalation'
import type {
  DrizzleDraftRepository,
  DrizzleGithubLinks,
  DrizzleTicketing,
} from '@helpuit/db'

/** Minimal audit sink — satisfied by both `PersistingAuditLog` and a DB-only adapter. */
export interface AuditRecorder {
  record(investigationId: string, event: { type: string; data?: Record<string, unknown> }): void
}

/** Result of a publish/reject decision (mapped to HTTP status by the admin API). */
export type DraftActionResult =
  | { status: 'published'; issueNumber: number; issueUrl: string }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'conflict' }
  | { status: 'error'; message: string }

export interface DraftPublisherDeps {
  drafts: Pick<DrizzleDraftRepository, 'get' | 'markPublished' | 'markRejected'>
  /** The SAME redaction-gated tracker the escalation pipeline uses — no duplicated GitHub I/O. */
  tracker: IssueTracker
  investigations: Pick<InvestigationRepository, 'setStatus'>
  ticketing: Pick<DrizzleTicketing, 'listByInvestigation' | 'create' | 'linkToIssue'>
  githubLinks: Pick<DrizzleGithubLinks, 'link'>
  audit: AuditRecorder
  /** Builds the web URL for a linked (commented) issue, where the tracker returns no ref. */
  issueUrl: (issueNumber: number) => string
}

/**
 * Publishes or rejects an escalation draft held for founder approval. Publishing
 * files (or comments on) the real GitHub issue through the existing
 * `RedactingIssueTracker`, then links tickets + records the GitHub link + marks
 * the investigation escalated + audits the action.
 *
 * Ordering is **file-then-mark**: the issue is created on GitHub before the draft
 * is marked published. A crash in between leaves a logged orphan issue (the lesser
 * evil vs. pointing an investigation at an issue that was never filed). A GitHub
 * failure leaves the draft `pending` (retryable).
 */
export class DraftPublisher {
  constructor(private readonly deps: DraftPublisherDeps) {}

  async publish(draftId: string): Promise<DraftActionResult> {
    const { drafts, tracker, investigations, ticketing, githubLinks, audit, issueUrl } = this.deps

    const draft = await drafts.get(draftId)
    if (draft === null) return { status: 'not_found' }
    if (draft.status !== 'pending') return { status: 'conflict' }

    const issue: IssueDraft = {
      title: draft.title,
      body: draft.body,
      labels: draft.labels,
      severity: draft.severity as IssueDraft['severity'],
    }

    // The only GitHub call, through the redaction gate. On failure the draft stays
    // pending (we mark only after success) so the operator can retry.
    let issueNumber: number
    let url: string
    try {
      if (draft.openMatchIssue !== null) {
        await tracker.comment(draft.openMatchIssue, issue.body)
        issueNumber = draft.openMatchIssue
        url = issueUrl(issueNumber)
      } else {
        const ref = await tracker.create(issue)
        issueNumber = ref.number
        url = ref.url
      }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }

    const marked = await drafts.markPublished(draftId, issueNumber, url)
    if (marked === null) {
      // Lost the race after filing — the issue exists but another decision won.
      console.error(`draft ${draftId} filed issue #${issueNumber} but was already decided (orphan)`)
      return { status: 'conflict' }
    }

    // Fan the fix out to the customer's ticket(s) and record the link.
    const tickets = await ticketing.listByInvestigation(draft.investigationId)
    if (tickets.length === 0) {
      const ticket = await ticketing.create({
        investigationId: draft.investigationId,
        conversationId: draft.conversationId,
      })
      await ticketing.linkToIssue(ticket.id, issueNumber)
    } else {
      for (const ticket of tickets) await ticketing.linkToIssue(ticket.id, issueNumber)
    }
    await githubLinks.link({ investigationId: draft.investigationId, issueNumber, issueUrl: url })
    await investigations.setStatus(investigationId(draft.investigationId), 'escalated')
    audit.record(draft.investigationId, { type: 'draft_published', data: { draftId, issueNumber } })

    return { status: 'published', issueNumber, issueUrl: url }
  }

  async reject(draftId: string, reason?: string): Promise<DraftActionResult> {
    const { drafts, audit } = this.deps
    const draft = await drafts.get(draftId)
    if (draft === null) return { status: 'not_found' }

    const rejected = await drafts.markRejected(draftId, reason)
    if (rejected === null) return { status: 'conflict' }

    audit.record(draft.investigationId, { type: 'draft_rejected', data: { draftId, reason } })
    return { status: 'rejected' }
  }
}
