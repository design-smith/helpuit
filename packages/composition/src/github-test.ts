import { githubRequest, type GitHubOptions } from '@helpuit/github'

export interface GitHubTestResult {
  ok: boolean
  detail: string
  /** The reachable repo's full name (e.g. "acme/product") on success. */
  repo?: string
}

/**
 * Real "Test connection" check for GitHub (FCW-14): fetch the configured repo via
 * the GitHub REST API using the current auth — a static PAT or an App
 * installation token (the credential seam is `githubRequest`/`GitHubOptions`, so
 * both work transparently). A bad token or missing repo surfaces here as a clear
 * `ok: false`, not silently when the first issue is filed.
 */
export async function testGitHub(options: GitHubOptions): Promise<GitHubTestResult> {
  if (options.owner === '' || options.repo === '') {
    return { ok: false, detail: 'Set the GitHub owner and repository.' }
  }
  try {
    const repo = (await githubRequest(options, 'GET', `/repos/${options.owner}/${options.repo}`)) as {
      full_name?: string
    }
    return {
      ok: true,
      detail: `Repository reachable${repo.full_name !== undefined ? ` — ${repo.full_name}` : ''}.`,
      repo: repo.full_name,
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}
