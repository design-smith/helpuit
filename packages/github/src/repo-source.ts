import type { RepoSource, RepoFile } from '@helpuit/feature-manifest'
import { githubRequest, type GitHubOptions } from './client.js'

interface GitTreeResponse {
  tree?: Array<{ path?: string; type?: string }>
}

/** RepoSource backed by the GitHub git-trees API at the production ref. */
export class GitHubRepoSource implements RepoSource {
  private readonly gitRef: string

  constructor(private readonly options: GitHubOptions) {
    this.gitRef = options.ref ?? 'main'
  }

  ref(): string {
    return this.gitRef
  }

  async listFiles(): Promise<RepoFile[]> {
    const json = (await githubRequest(
      this.options,
      'GET',
      `/repos/${this.options.owner}/${this.options.repo}/git/trees/${this.gitRef}?recursive=1`,
    )) as GitTreeResponse
    return (json.tree ?? [])
      .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
      .map((entry) => ({ path: entry.path as string }))
  }
}
