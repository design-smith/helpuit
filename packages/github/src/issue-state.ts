import { githubRequest, type GitHubOptions } from './client.js'

/** Fetch an issue's current open/closed state from GitHub (for the console's issue sync). */
export async function getIssueState(options: GitHubOptions, issueNumber: number): Promise<'open' | 'closed'> {
  const json = (await githubRequest(
    options,
    'GET',
    `/repos/${options.owner}/${options.repo}/issues/${issueNumber}`,
  )) as { state?: string }
  return json.state === 'closed' ? 'closed' : 'open'
}
