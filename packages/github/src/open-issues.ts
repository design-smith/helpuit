import { githubRequest, type GitHubOptions } from './client.js'

export interface OpenIssue {
  number: number
  title: string
  body: string
}

/** List the repo's open issues (for the known-issue embed sweep). PRs are excluded. */
export async function listOpenIssues(options: GitHubOptions): Promise<OpenIssue[]> {
  // ponytail: single page of 100 — paginate when a repo outgrows it.
  const json = (await githubRequest(
    options,
    'GET',
    `/repos/${options.owner}/${options.repo}/issues?state=open&per_page=100`,
  )) as Array<{ number?: number; title?: string; body?: string | null; pull_request?: unknown }>
  return json
    .filter((item) => item.pull_request === undefined)
    .map((item) => ({ number: item.number ?? 0, title: item.title ?? '', body: item.body ?? '' }))
}
