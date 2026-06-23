type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown>; text?: () => Promise<string> }>

const DEFAULT_API = 'https://api.github.com'

export interface ManifestOptions {
  /** This deployment's public base URL (HELPUIT_PUBLIC_URL) — callbacks/webhooks point here. */
  publicUrl: string
  name: string
}

/**
 * Build a GitHub App manifest pointed at THIS deployment. The operator submits it
 * to GitHub (App Manifest flow); GitHub creates the app — auto-generating the
 * private key, webhook secret, and client secret — pre-wired to file issues, read
 * code, and deliver issue events back to `/webhooks/github`.
 */
export function buildAppManifest(options: ManifestOptions): Record<string, unknown> {
  const base = options.publicUrl.replace(/\/+$/, '')
  return {
    name: options.name,
    url: base,
    redirect_url: `${base}/admin/connect/github/callback`,
    hook_attributes: { url: `${base}/webhooks/github`, active: true },
    setup_url: `${base}/admin/connect/github/installed`,
    setup_on_update: true,
    public: false,
    default_permissions: { issues: 'write', contents: 'read', metadata: 'read' },
    default_events: ['issues', 'issue_comment'],
  }
}

/** The credentials GitHub generates and returns when converting a manifest code. */
export interface AppCredentials {
  appId: string
  slug: string
  htmlUrl: string
  privateKey: string
  webhookSecret: string
  clientId: string
  clientSecret: string
}

interface ConversionResponse {
  id?: number
  slug?: string
  html_url?: string
  pem?: string
  webhook_secret?: string
  client_id?: string
  client_secret?: string
}

export interface ConvertOptions {
  apiBaseUrl?: string
  fetchImpl?: FetchLike
}

/**
 * Exchange the temporary `code` GitHub returns after app creation for the
 * generated credentials (App Manifest flow conversion). One-time, no auth header.
 */
export async function convertManifest(code: string, options: ConvertOptions = {}): Promise<AppCredentials> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const base = options.apiBaseUrl ?? DEFAULT_API
  const res = await fetchImpl(`${base}/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!res.ok) {
    const detail = res.text ? await res.text() : ''
    throw new Error(`GitHub App manifest conversion failed (${res.status ?? '?'}): ${detail}`)
  }
  const json = (await res.json()) as ConversionResponse
  if (json.id === undefined || json.pem === undefined) {
    throw new Error('GitHub App manifest conversion response missing id/pem')
  }
  return {
    appId: String(json.id),
    slug: json.slug ?? '',
    htmlUrl: json.html_url ?? '',
    privateKey: json.pem,
    webhookSecret: json.webhook_secret ?? '',
    clientId: json.client_id ?? '',
    clientSecret: json.client_secret ?? '',
  }
}
