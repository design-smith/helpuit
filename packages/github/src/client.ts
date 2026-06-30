type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status?: number; statusText?: string; json: () => Promise<unknown>; text?: () => Promise<string> }>

export interface GitHubOptions {
  owner: string
  repo: string
  /** Static token (PAT mode). Ignored when `getToken` is provided. */
  token: string
  /**
   * Async credential provider (GitHub App mode) — returns a fresh installation
   * token per call. When set, it takes precedence over the static `token`.
   */
  getToken?: () => Promise<string>
  /** Override for GitHub Enterprise or tests. Defaults to public GitHub. */
  apiBaseUrl?: string
  /** The production ref (branch/sha) used for repo reads. */
  ref?: string
  /** Injectable HTTP for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
}

const DEFAULT_API = 'https://api.github.com'

/** Single authenticated GitHub REST call. `apiBaseUrl`/`fetchImpl` make it testable + Enterprise-ready. */
export async function githubRequest(
  options: GitHubOptions,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const token = options.getToken !== undefined ? await options.getToken() : options.token
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  if (body !== undefined) headers['content-type'] = 'application/json'

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const res = await fetchImpl(`${options.apiBaseUrl ?? DEFAULT_API}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path} failed: ${res.status ?? '?'} ${res.statusText ?? ''}`)
  }
  return res.json()
}
