import type { CodeRetriever } from '@helpuit/static-investigation'
import { githubRequest, type GitHubOptions } from './client.js'

interface ContentsResponse {
  content?: string
  encoding?: string
}

/** CodeRetriever backed by the GitHub contents API (decodes base64 file bodies). */
export class GitHubCodeRetriever implements CodeRetriever {
  private readonly ref: string

  constructor(private readonly options: GitHubOptions) {
    this.ref = options.ref ?? 'main'
  }

  async retrieve(paths: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const path of paths) {
      try {
        const json = (await githubRequest(
          this.options,
          'GET',
          `/repos/${this.options.owner}/${this.options.repo}/contents/${path}?ref=${encodeURIComponent(this.ref)}`,
        )) as ContentsResponse
        if (typeof json.content === 'string') {
          out[path] =
            json.encoding === 'base64'
              ? Buffer.from(json.content, 'base64').toString('utf8')
              : json.content
        }
      } catch {
        // a missing/unreadable file is skipped, not fatal
      }
    }
    return out
  }
}
