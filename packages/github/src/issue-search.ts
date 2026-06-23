import { SIGNATURE_MARKER, type IssueRef, type IssueSearch } from '@helpuit/dedup'
import { githubRequest, type GitHubOptions } from './client.js'

interface SearchResponse {
  items?: Array<{ number?: number; html_url?: string; state?: string; body?: string }>
}

function parseSignature(body: string | undefined): string | undefined {
  if (body === undefined) return undefined
  const idx = body.indexOf(SIGNATURE_MARKER)
  if (idx === -1) return undefined
  const line = body.slice(idx + SIGNATURE_MARKER.length).split('\n')[0] ?? ''
  const sig = line.trim()
  return sig === '' ? undefined : sig
}

/** IssueSearch backed by the GitHub search API, matching the embedded signature marker. */
export class GitHubIssueSearch implements IssueSearch {
  constructor(private readonly options: GitHubOptions) {}

  async search(signature: string): Promise<IssueRef[]> {
    const query = `repo:${this.options.owner}/${this.options.repo} "${SIGNATURE_MARKER} ${signature}"`
    const json = (await githubRequest(
      this.options,
      'GET',
      `/search/issues?q=${encodeURIComponent(query)}`,
    )) as SearchResponse
    return (json.items ?? []).map((item) => ({
      number: item.number ?? 0,
      url: item.html_url ?? '',
      state: item.state === 'closed' ? 'closed' : 'open',
      signature: parseSignature(item.body),
    }))
  }
}
