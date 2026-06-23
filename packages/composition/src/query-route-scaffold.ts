export interface QueryRouteScaffoldOptions {
  /** The Supabase table holding account state, e.g. "profiles". */
  table: string
  /** The column matching the verified user id, e.g. "id". */
  userColumn: string
  /** Columns the agent is allowed to read (the allowlist). */
  allowedColumns: string[]
  /** Deployed function name (also the route path). Default "account-query". */
  functionName?: string
  /** The Helpuit query-route name. Default "getAccount". */
  routeName?: string
  /** The Supabase Functions base URL. Default a placeholder for the operator to fill. */
  supabaseUrl?: string
  /** Env var (in both Supabase and Helpuit's QUERY_ROUTES_TOKEN) holding the shared service token. */
  tokenEnv?: string
}

export interface QueryRouteConfig {
  baseUrl: string
  routes: Array<{ name: string; method: 'GET'; path: string; param: string; columns: string[] }>
}

export interface QueryRouteScaffold {
  functionName: string
  /** The Deno Edge Function source (copy-paste into supabase/functions/<name>/index.ts). */
  functionTs: string
  /** The `queryRoutes` block to paste into helpuit.config.yaml. */
  configYaml: string
  /** The same config as an object — valid against the QueryRoutes schema. */
  queryRoutes: QueryRouteConfig
}

/**
 * Generate a copy-pasteable Supabase Edge Function (FCW-19) implementing a
 * read-only account query route compatible with Helpuit's `HttpRouteExecutor`:
 * service-token bearer auth, the VERIFIED user id (Helpuit binds it from the
 * identity token — never caller-asserted), a column allowlist, and an array
 * response. Returns the function source + the matching `queryRoutes` config so L2
 * account-aware support isn't built from scratch.
 */
export function supabaseQueryRouteScaffold(opts: QueryRouteScaffoldOptions): QueryRouteScaffold {
  const functionName = opts.functionName ?? 'account-query'
  const routeName = opts.routeName ?? 'getAccount'
  const baseUrl = opts.supabaseUrl ?? 'https://YOUR-PROJECT.supabase.co/functions/v1'
  const tokenEnv = opts.tokenEnv ?? 'HELPUIT_QUERY_TOKEN'
  const allowed = opts.allowedColumns
  const allowedLiteral = `[${allowed.map((c) => `'${c}'`).join(', ')}]`

  const queryRoutes: QueryRouteConfig = {
    baseUrl,
    routes: [{ name: routeName, method: 'GET', path: `/${functionName}`, param: 'userId', columns: allowed }],
  }

  const functionTs = `// Supabase Edge Function: ${functionName}
// Read-only account lookup for Helpuit's L2 account investigation.
//
// Deploy:   supabase functions deploy ${functionName} --no-verify-jwt
// Secret:   supabase secrets set ${tokenEnv}=<same value as Helpuit's QUERY_ROUTES_TOKEN>
//
// Helpuit calls this with the VERIFIED customer id (bound server-side from the
// identity token — never asserted by the customer) and the requested columns.
// This function only ever returns the allow-listed columns, scoped to that user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_COLUMNS = ${allowedLiteral}
const SERVICE_TOKEN = Deno.env.get('${tokenEnv}') ?? ''

Deno.serve(async (req) => {
  // 1. Only Helpuit (which holds the service token) may call this.
  if (req.headers.get('authorization') !== \`Bearer \${SERVICE_TOKEN}\`) {
    return new Response('unauthorized', { status: 401 })
  }

  const url = new URL(req.url)

  // 2. Use the VERIFIED id Helpuit sends — never a caller-asserted one.
  const userId = url.searchParams.get('userId')
  if (userId === null || userId === '') return new Response('missing userId', { status: 400 })

  // 3. Column allowlist (defense in depth): never expose a column outside this set.
  const requested = (url.searchParams.get('columns') ?? '').split(',').filter(Boolean)
  const columns = requested.filter((c) => ALLOWED_COLUMNS.includes(c))
  const select = (columns.length > 0 ? columns : ALLOWED_COLUMNS).join(',')

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data, error } = await supabase.from('${opts.table}').select(select).eq('${opts.userColumn}', userId)
  if (error !== null) return new Response(error.message, { status: 500 })

  // 4. Helpuit's HttpRouteExecutor expects a JSON array of rows.
  return Response.json(data ?? [])
})
`

  const configYaml = `queryRoutes:
  baseUrl: ${baseUrl}
  routes:
    - name: ${routeName}
      method: GET
      path: /${functionName}
      param: userId
      columns: [${allowed.join(', ')}]
`

  return { functionName, functionTs, configYaml, queryRoutes }
}
