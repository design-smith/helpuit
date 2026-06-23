import type { IssueDraft, IssueRefLite, IssueTracker } from '@helpuit/escalation'
import { Redactor } from '@helpuit/crypto'

/**
 * Redaction gate at the export boundary. Wraps any {@link IssueTracker} and runs
 * every title/body through the {@link Redactor} before it reaches the tracker —
 * so customer PII or leaked secrets can never be written into a GitHub issue,
 * even if upstream forgets to sanitize. Defense in depth for the "no PII/secrets
 * into GitHub" invariant.
 */
export class RedactingIssueTracker implements IssueTracker {
  constructor(
    private readonly inner: IssueTracker,
    private readonly redactor: Redactor = new Redactor(),
  ) {}

  async create(draft: IssueDraft): Promise<IssueRefLite> {
    return this.inner.create({
      ...draft,
      title: this.redactor.redact(draft.title).text,
      body: this.redactor.redact(draft.body).text,
    })
  }

  async comment(issueNumber: number, body: string): Promise<void> {
    await this.inner.comment(issueNumber, this.redactor.redact(body).text)
  }
}
