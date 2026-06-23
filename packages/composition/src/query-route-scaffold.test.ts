import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolveEffectiveConfig } from '@helpuit/config'
import { HttpRouteExecutor } from '@helpuit/query-routes'
import { supabaseQueryRouteScaffold } from './query-route-scaffold.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer((req, res) => handler(req, res))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

const MINIMAL_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 1 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m }, reasoning: { model: m }, vision: { model: m } }
`

describe('supabaseQueryRouteScaffold', () => {
  it('emits a queryRoutes config that is valid against the real config schema (worked example)', () => {
    const scaffold = supabaseQueryRouteScaffold({ table: 'profiles', userColumn: 'id', allowedColumns: ['plan', 'status'] })

    // Inject the generated queryRoutes as a structural override → resolving it
    // proves it conforms to the QueryRoutes schema end-to-end.
    const { config } = resolveEffectiveConfig({
      baselineYaml: MINIMAL_YAML,
      env: {},
      structural: { queryRoutes: scaffold.queryRoutes },
    })
    expect(config.queryRoutes?.routes[0]).toMatchObject({
      name: 'getAccount',
      method: 'GET',
      path: '/account-query',
      param: 'userId',
      columns: ['plan', 'status'],
    })
  })

  it('generates an Edge Function that enforces bearer auth, the column allowlist, the verified user id, and an array response', () => {
    const { functionTs } = supabaseQueryRouteScaffold({ table: 'profiles', userColumn: 'id', allowedColumns: ['plan', 'status'] })

    expect(functionTs).toMatch(/Bearer/) // service-token auth
    expect(functionTs).toContain("'plan'")
    expect(functionTs).toContain("'status'") // allowlist baked in
    expect(functionTs).toMatch(/searchParams\.get\(['"]userId['"]\)/) // verified id from Helpuit, not the body
    expect(functionTs).toMatch(/\.eq\(\s*['"]id['"]/) // query scoped to that user
    expect(functionTs).toMatch(/from\(['"]profiles['"]\)/)
    expect(functionTs).toContain('Response.json') // array response shape
  })

  it('the generated route + a conformant endpoint interoperate with the real HttpRouteExecutor', async () => {
    const scaffold = supabaseQueryRouteScaffold({ table: 'profiles', userColumn: 'id', allowedColumns: ['plan', 'status'] })
    const route = scaffold.queryRoutes.routes[0]!
    const allowed = route.columns

    // A real endpoint mirroring the template's contract: bearer + allowlist + scoped to the sent user id.
    const base = await serve((req, res) => {
      if (req.headers.authorization !== 'Bearer svc') {
        res.statusCode = 401
        res.end('unauthorized')
        return
      }
      const url = new URL(req.url ?? '', 'http://x')
      const userId = url.searchParams.get('userId') ?? ''
      const requested = (url.searchParams.get('columns') ?? '').split(',').filter(Boolean)
      const cols = requested.filter((c) => allowed.includes(c))
      const row = Object.fromEntries((cols.length > 0 ? cols : allowed).map((c) => [c, `${c}-of-${userId}`]))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([row]))
    })

    const def = { name: route.name, method: route.method, path: route.path, param: route.param }
    const executor = new HttpRouteExecutor({ baseUrl: base, token: 'svc', routes: [def] })

    // Asking for a column outside the allowlist returns only the allowed one, scoped to the verified user.
    const rows = await executor.execute(route.name, ['plan', 'secret_balance'], 'user-42')
    expect(rows).toEqual([{ plan: 'plan-of-user-42' }])

    // The bearer service token is required.
    const wrong = new HttpRouteExecutor({ baseUrl: base, token: 'nope', routes: [def] })
    await expect(wrong.execute(route.name, ['plan'], 'user-42')).rejects.toThrow()
  })
})
