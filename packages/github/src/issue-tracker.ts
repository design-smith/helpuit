import type { IssueDraft, IssueRefLite, IssueTracker } from '@helpuit/escalation'
import { githubRequest, type GitHubOptions } from './client.js'

interface CreatedIssue {
  number?: number
  html_url?: string
}

/** IssueTracker backed by the GitHub issues API. */
export class GitHubIssueTracker implements IssueTracker {
  constructor(private readonly options: GitHubOptions) {}

  async create(draft: IssueDraft): Promise<IssueRefLite> {
    const json = (await githubRequest(
      this.options,
      'POST',
      `/repos/${this.options.owner}/${this.options.repo}/issues`,
      { title: draft.title, body: draft.body, labels: draft.labels },
    )) as CreatedIssue
    return { number: json.number ?? 0, url: json.html_url ?? '' }
  }

  async comment(issueNumber: number, body: string): Promise<void> {
    await githubRequest(
      this.options,
      'POST',
      `/repos/${this.options.owner}/${this.options.repo}/issues/${issueNumber}/comments`,
      { body },
    )
  }
}
