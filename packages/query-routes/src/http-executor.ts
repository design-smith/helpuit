import type { RouteExecutor, Row } from './query-routes.js'

export interface HttpRouteDef {
  name: string
  method: 'GET' | 'POST'
  /** May contain a `:param` placeholder, e.g. `/users/:userId/plan`. */
  path: string
  param: string
}

export interface HttpRouteExecutorOptions {
  baseUrl: string
  token: string
  routes: HttpRouteDef[]
}

/**
 * Real executor for the founder's read-only query endpoints. The bound param
 * (the verified user id) is substituted into the path or sent as a query/body
 * param; columns are requested explicitly. Auth via a bearer service token.
 */
export class HttpRouteExecutor implements RouteExecutor {
  private readonly byName = new Map<string, HttpRouteDef>()

  constructor(private readonly options: HttpRouteExecutorOptions) {
    for (const route of options.routes) this.byName.set(route.name, route)
  }

  async execute(route: string, columns: string[], boundParamValue: string): Promise<Row[]> {
    const def = this.byName.get(route)
    if (def === undefined) throw new Error(`Route "${route}" is not configured in the executor`)

    const base = this.options.baseUrl.replace(/\/$/, '')
    const placeholder = `:${def.param}`
    const hasPlaceholder = def.path.includes(placeholder)
    const path = hasPlaceholder
      ? def.path.replace(placeholder, encodeURIComponent(boundParamValue))
      : def.path
    const url = new URL(base + path)
    if (!hasPlaceholder) url.searchParams.set(def.param, boundParamValue)

    const headers: Record<string, string> = { authorization: `Bearer ${this.options.token}` }
    let res: Response
    if (def.method === 'POST') {
      headers['content-type'] = 'application/json'
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ [def.param]: boundParamValue, columns }),
      })
    } else {
      url.searchParams.set('columns', columns.join(','))
      res = await fetch(url, { headers })
    }

    if (!res.ok) throw new Error(`Query route "${route}" failed: ${res.status} ${res.statusText}`)

    const json: unknown = await res.json()
    if (Array.isArray(json)) return json as Row[]
    if (json !== null && typeof json === 'object' && Array.isArray((json as { rows?: unknown }).rows)) {
      return (json as { rows: Row[] }).rows
    }
    return [json as Row]
  }
}
