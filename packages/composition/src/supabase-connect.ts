import type { DrizzleConfigStore, DrizzleSecretVault, DrizzleRestartFlag, DrizzleConfigAudit } from '@helpuit/db'

/** Operator-set OAuth app credentials (registered once under a Supabase org). */
export const SUPABASE_OAUTH_CLIENT_ID = 'SUPABASE_OAUTH_CLIENT_ID'
export const SUPABASE_OAUTH_CLIENT_SECRET = 'SUPABASE_OAUTH_CLIENT_SECRET'
/** Connect-flow tokens (management API only; reads use the service key). */
export const SUPABASE_OAUTH_ACCESS_TOKEN = 'SUPABASE_OAUTH_ACCESS_TOKEN'
export const SUPABASE_OAUTH_REFRESH_TOKEN = 'SUPABASE_OAUTH_REFRESH_TOKEN'
/** The selected project's service key — bound into reads (PostgrestExecutor). */
export const SUPABASE_SERVICE_KEY = 'SUPABASE_SERVICE_KEY'

const DEFAULT_API = 'https://api.supabase.com'

export interface SupabaseProject {
  ref: string
  name: string
  organizationId: string
  region?: string
}

export interface SupabaseConnectionService {
  authorizeUrl(state: string): Promise<string>
  completeCallback(code: string): Promise<void>
  listProjects(): Promise<SupabaseProject[]>
  listTables(ref: string): Promise<string[]>
  listColumns(ref: string, table: string): Promise<string[]>
  selectProject(input: { ref: string; table: string; userColumn: string; columns: string[] }): Promise<{ ok: boolean; detail: string }>
}

export interface SupabaseConnectionDeps {
  configStore: Pick<DrizzleConfigStore, 'get' | 'put'>
  vault: Pick<DrizzleSecretVault, 'set' | 'openAll'>
  restartFlag: Pick<DrizzleRestartFlag, 'add'>
  audit: Pick<DrizzleConfigAudit, 'record'>
  /** This deployment's public base URL (HELPUIT_PUBLIC_URL) — for the OAuth redirect. */
  publicUrl: string
  /** Override for tests; defaults to the public Supabase API. */
  apiBaseUrl?: string
}

/**
 * Drives the "Connect Supabase" OAuth flow — the social-login alternative to a
 * pasted connection string. The OAuth tokens (management API only) + the selected
 * project's service key are sealed in the vault; the project/table mapping is
 * written to the `accountData` config section (restart-applied, since reads bind
 * the service key at boot). The service key is broad (bypasses RLS) — every read
 * is column-allowlisted and scoped to the verified user's row by the executor.
 */
export class SupabaseConnection implements SupabaseConnectionService {
  constructor(private readonly deps: SupabaseConnectionDeps) {}

  private get api(): string {
    return (this.deps.apiBaseUrl ?? DEFAULT_API).replace(/\/$/, '')
  }
  private redirectUri(): string {
    return `${this.deps.publicUrl.replace(/\/$/, '')}/admin/connect/supabase/callback`
  }
  private async secret(key: string): Promise<string> {
    return (await this.deps.vault.openAll()).secrets[key] ?? ''
  }

  async authorizeUrl(state: string): Promise<string> {
    const clientId = await this.secret(SUPABASE_OAUTH_CLIENT_ID)
    if (clientId === '') throw new Error('Supabase OAuth app is not configured (set SUPABASE_OAUTH_CLIENT_ID).')
    const u = new URL(`${this.api}/v1/oauth/authorize`)
    u.searchParams.set('client_id', clientId)
    u.searchParams.set('redirect_uri', this.redirectUri())
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('state', state)
    return u.toString()
  }

  async completeCallback(code: string): Promise<void> {
    const res = await fetch(`${this.api}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
        client_id: await this.secret(SUPABASE_OAUTH_CLIENT_ID),
        client_secret: await this.secret(SUPABASE_OAUTH_CLIENT_SECRET),
      }).toString(),
    })
    if (!res.ok) throw new Error(`Supabase token exchange failed: ${res.status} ${res.statusText}`)
    const tok = (await res.json()) as { access_token?: string; refresh_token?: string }
    await this.deps.vault.set(SUPABASE_OAUTH_ACCESS_TOKEN, tok.access_token ?? '')
    if (tok.refresh_token !== undefined && tok.refresh_token !== '') {
      await this.deps.vault.set(SUPABASE_OAUTH_REFRESH_TOKEN, tok.refresh_token)
    }
    await this.deps.audit.record('supabase.oauth.connected', 'supabase')
  }

  /** Management API call with one refresh-on-401 retry (access tokens are short-lived). */
  private async mgmt(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const call = (token: string): Promise<Response> =>
      fetch(`${this.api}/v1${path}`, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      })
    let res = await call(await this.secret(SUPABASE_OAUTH_ACCESS_TOKEN))
    if (res.status === 401) res = await call(await this.refresh())
    if (res.status === 403) {
      // The token is valid but the OAuth app wasn't granted this scope. Scopes are
      // fixed at OAuth-app creation (the authorize `scope` param is deprecated), so
      // the operator must update the app and reconnect — tell them exactly how.
      throw new Error(
        'Supabase denied the request (403): your OAuth app is missing a required scope. ' +
          'In Supabase → Organization settings → OAuth Apps, edit the app and grant ' +
          '"Database: Write" (to read tables and columns) and "Secrets: Read" (to read the ' +
          'project API keys), then disconnect and reconnect Supabase here. ' +
          'Or skip OAuth and use the manual connection-string option.',
      )
    }
    if (!res.ok) throw new Error(`Supabase Management API ${path} failed: ${res.status} ${res.statusText}`)
    return res.json()
  }

  private async refresh(): Promise<string> {
    const res = await fetch(`${this.api}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: await this.secret(SUPABASE_OAUTH_REFRESH_TOKEN),
        client_id: await this.secret(SUPABASE_OAUTH_CLIENT_ID),
        client_secret: await this.secret(SUPABASE_OAUTH_CLIENT_SECRET),
      }).toString(),
    })
    if (!res.ok) throw new Error(`Supabase token refresh failed: ${res.status}`)
    const tok = (await res.json()) as { access_token?: string; refresh_token?: string }
    const access = tok.access_token ?? ''
    await this.deps.vault.set(SUPABASE_OAUTH_ACCESS_TOKEN, access)
    if (tok.refresh_token !== undefined && tok.refresh_token !== '') {
      await this.deps.vault.set(SUPABASE_OAUTH_REFRESH_TOKEN, tok.refresh_token)
    }
    return access
  }

  async listProjects(): Promise<SupabaseProject[]> {
    const json = (await this.mgmt('/projects')) as Array<{
      id?: string
      ref?: string
      name?: string
      organization_id?: string
      region?: string
    }>
    return (json ?? []).map((p) => ({
      ref: p.ref ?? p.id ?? '',
      name: p.name ?? '',
      organizationId: p.organization_id ?? '',
      region: p.region,
    }))
  }

  async listTables(ref: string): Promise<string[]> {
    const rows = (await this.mgmt(`/projects/${ref}/database/query`, {
      method: 'POST',
      body: { query: "select table_name from information_schema.tables where table_schema='public' order by table_name" },
    })) as Array<{ table_name?: string }>
    return (rows ?? []).map((r) => r.table_name ?? '').filter((t) => t !== '')
  }

  async listColumns(ref: string, table: string): Promise<string[]> {
    const safe = table.replace(/'/g, "''")
    const rows = (await this.mgmt(`/projects/${ref}/database/query`, {
      method: 'POST',
      body: {
        query: `select column_name from information_schema.columns where table_schema='public' and table_name='${safe}' order by ordinal_position`,
      },
    })) as Array<{ column_name?: string }>
    return (rows ?? []).map((r) => r.column_name ?? '').filter((c) => c !== '')
  }

  async selectProject(input: {
    ref: string
    table: string
    userColumn: string
    columns: string[]
  }): Promise<{ ok: boolean; detail: string }> {
    const keys = (await this.mgmt(`/projects/${input.ref}/api-keys`)) as Array<{ name?: string; api_key?: string }>
    const service = (keys ?? []).find((k) => k.name === 'service_role')?.api_key
    if (service === undefined || service === '') return { ok: false, detail: 'Could not read the project service key.' }

    await this.deps.vault.set(SUPABASE_SERVICE_KEY, service)
    await this.deps.configStore.put('accountData', {
      source: 'supabase',
      table: input.table,
      userColumn: input.userColumn,
      columns: input.columns,
      supabase: { projectRef: input.ref, restUrl: `https://${input.ref}.supabase.co/rest/v1` },
    })
    await this.deps.restartFlag.add('config:accountData')
    await this.deps.restartFlag.add(`secret:${SUPABASE_SERVICE_KEY}`)
    await this.deps.audit.record('supabase.project.selected', input.ref)
    return { ok: true, detail: `Connected ${input.ref}.` }
  }
}
