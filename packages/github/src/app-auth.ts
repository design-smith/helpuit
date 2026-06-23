import { createSign } from 'node:crypto'

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * Build a short-lived RS256 JWT signed with a GitHub App's private key, used to
 * authenticate AS the app (to mint installation tokens). GitHub caps the lifetime
 * at 10 minutes; we use 9, backdating `iat` 60s to tolerate clock skew.
 */
export function createAppJwt(appId: string, privateKeyPem: string, now: number = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: appId, iat, exp: iat + 540 }))
  const signingInput = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem).toString('base64url')
  return `${signingInput}.${signature}`
}

interface InstallationTokenResponse {
  token?: string
  expires_at?: string
}

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown>; text?: () => Promise<string> }>

export interface GitHubAppAuthOptions {
  appId: string
  privateKey: string
  installationId: number
  /** GitHub API base (default api.github.com); Enterprise overrides it. */
  apiBaseUrl?: string
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
}

const DEFAULT_API = 'https://api.github.com'
/** Refresh the cached installation token this many ms before it actually expires. */
const REFRESH_SKEW_MS = 60_000

/**
 * Mints and caches GitHub App INSTALLATION tokens. Each token authenticates the
 * app against the installation's repos for ~1h; this exchanges the app JWT for one
 * and reuses it until it's near expiry, so the GitHub client always has a fresh,
 * short-lived credential instead of a long-lived PAT.
 */
export class GitHubAppAuth {
  private cached: { token: string; expiresAt: number } | null = null

  constructor(
    private readonly options: GitHubAppAuthOptions,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getToken(): Promise<string> {
    const at = this.now()
    if (this.cached !== null && this.cached.expiresAt - REFRESH_SKEW_MS > at) {
      return this.cached.token
    }
    const fetchImpl = this.options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
    const base = this.options.apiBaseUrl ?? DEFAULT_API
    const jwt = createAppJwt(this.options.appId, this.options.privateKey, at)
    const res = await fetchImpl(`${base}/app/installations/${this.options.installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
    })
    if (!res.ok) {
      const detail = res.text ? await res.text() : ''
      throw new Error(`GitHub App installation-token exchange failed (${res.status ?? '?'}): ${detail}`)
    }
    const json = (await res.json()) as InstallationTokenResponse
    if (json.token === undefined) throw new Error('GitHub App installation-token response had no token')
    const expiresAt = json.expires_at !== undefined ? Date.parse(json.expires_at) : at + 3_600_000
    this.cached = { token: json.token, expiresAt }
    return json.token
  }
}
