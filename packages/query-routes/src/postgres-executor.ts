import { Pool } from 'pg'
import type { RouteExecutor, Row } from './query-routes.js'

/** Plain SQL identifier (operator-configured table/column names only — never user input). */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: "${name}"`)
  return `"${name}"`
}

export interface PostgresRouteDef {
  name: string
  table: string
  /** Column matched against the verified user id. */
  userColumn: string
}

export interface PostgresExecutorOptions {
  connectionString: string
  routes: PostgresRouteDef[]
  /** Injected pool (tests); otherwise one is created from connectionString. */
  pool?: Pool
}

/**
 * Direct-Postgres fallback executor. Runs a parameterized, column-allowlisted,
 * single-row-owner read: `SELECT {cols} FROM {table} WHERE {userColumn} = $1`.
 * Table/column identifiers are operator-configured + allowlisted (validated as
 * plain identifiers, quoted); the verified user id is a bound parameter, never
 * interpolated. No agent-authored SQL.
 */
export class PostgresExecutor implements RouteExecutor {
  private readonly byName = new Map<string, PostgresRouteDef>()
  private readonly pool: Pool

  constructor(options: PostgresExecutorOptions) {
    for (const route of options.routes) this.byName.set(route.name, route)
    this.pool = options.pool ?? new Pool({ connectionString: options.connectionString })
  }

  async execute(route: string, columns: string[], boundParamValue: string): Promise<Row[]> {
    const def = this.byName.get(route)
    if (def === undefined) throw new Error(`Route "${route}" is not configured in the executor`)
    if (columns.length === 0) throw new Error(`Route "${route}" requested no columns`)

    const cols = columns.map(quoteIdent).join(', ')
    const sql = `select ${cols} from ${quoteIdent(def.table)} where ${quoteIdent(def.userColumn)} = $1`
    const result = await this.pool.query(sql, [boundParamValue])
    return result.rows as Row[]
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
