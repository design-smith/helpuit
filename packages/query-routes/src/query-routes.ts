import type { VerifiedIdentity } from '@helpuit/identity'

/** A founder-approved, read-only query route (issue 29). */
export interface QueryRouteDef {
  name: string
  allowedColumns: string[]
  /** The identity field bound to this route's scoping param (e.g. 'userId'). */
  param: string
}

export type Row = Record<string, unknown>

/** Executes a validated, identity-bound query. Real impl calls the founder's route over HTTP. */
export interface RouteExecutor {
  execute(route: string, columns: string[], boundParamValue: string): Promise<Row[]>
}

export class UnknownRouteError extends Error {
  constructor(public readonly route: string) {
    super(`Unknown query route "${route}"`)
    this.name = 'UnknownRouteError'
  }
}

export class DisallowedColumnError extends Error {
  constructor(
    public readonly route: string,
    public readonly column: string,
  ) {
    super(`Column "${column}" is not allowed on route "${route}"`)
    this.name = 'DisallowedColumnError'
  }
}

export class QueryRouteCatalog {
  private readonly defs = new Map<string, QueryRouteDef>()

  constructor(defs: QueryRouteDef[]) {
    for (const def of defs) this.defs.set(def.name, def)
  }

  get(route: string): QueryRouteDef {
    const def = this.defs.get(route)
    if (def === undefined) throw new UnknownRouteError(route)
    return def
  }

  /** Throws unless the route exists and every requested column is on its allowlist. */
  validate(route: string, columns: string[]): QueryRouteDef {
    const def = this.get(route)
    const allowed = new Set(def.allowedColumns)
    for (const column of columns) {
      if (!allowed.has(column)) throw new DisallowedColumnError(route, column)
    }
    return def
  }
}

export class QueryRouteClient {
  constructor(
    private readonly catalog: QueryRouteCatalog,
    private readonly executor: RouteExecutor,
  ) {}

  /**
   * Run a read-only query. The scoping param is bound from the VERIFIED identity,
   * never from caller input — so cross-user access is structurally unreachable
   * (issue 32). The agent picks a route + columns; it cannot choose whose data.
   */
  async query(
    request: { route: string; columns: string[] },
    identity: VerifiedIdentity,
  ): Promise<Row[]> {
    this.catalog.validate(request.route, request.columns)
    return this.executor.execute(request.route, request.columns, identity.userId)
  }
}

const SENSITIVE =
  /(password|passwd|secret|token|ssn|social.?security|credit.?card|card.?number|cvv|api.?key)/i

/** Flag plaintext-sensitive column names so setup can warn the founder (issue 33). */
export function findSensitiveColumns(columns: string[]): string[] {
  return columns.filter((column) => SENSITIVE.test(column))
}
