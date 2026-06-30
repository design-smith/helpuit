import type { RouteExecutor, Row } from './query-routes.js'

export interface PostgrestRouteDef {
  name: string
  table: string
  /** Column matched against the verified user id. */
  userColumn: string
}

export interface PostgrestExecutorOptions {
  /** The project's REST base, e.g. https://{ref}.supabase.co/rest/v1 */
  restUrl: string
  /** Service API key — sent as `apikey` + bearer (bypasses RLS; scoping is enforced here). */
  serviceKey: string
  routes: PostgrestRouteDef[]
}

/**
 * Reads a customer's account table directly via Supabase's PostgREST API. The read
 * is always `?select={allowlisted columns}&{userColumn}=eq.{verified user id}` — a
 * structured, column-allowlisted, single-row-owner read. No raw SQL; the verified
 * user id is the only scoping, so it is bound here (never from caller input).
 */
export class PostgrestExecutor implements RouteExecutor {
  private readonly byName = new Map<string, PostgrestRouteDef>()

  constructor(private readonly options: PostgrestExecutorOptions) {
    for (const route of options.routes) this.byName.set(route.name, route)
  }

  async execute(route: string, columns: string[], boundParamValue: string): Promise<Row[]> {
    const def = this.byName.get(route)
    if (def === undefined) throw new Error(`Route "${route}" is not configured in the executor`)

    const base = this.options.restUrl.replace(/\/$/, '')
    const url = new URL(`${base}/${def.table}`)
    url.searchParams.set('select', columns.join(','))
    url.searchParams.set(def.userColumn, `eq.${boundParamValue}`)

    const res = await fetch(url, {
      headers: { apikey: this.options.serviceKey, authorization: `Bearer ${this.options.serviceKey}` },
    })
    if (!res.ok) throw new Error(`Supabase REST read "${route}" failed: ${res.status} ${res.statusText}`)

    const json: unknown = await res.json()
    return Array.isArray(json) ? (json as Row[]) : [json as Row]
  }
}
