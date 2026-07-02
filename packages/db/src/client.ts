import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { schema } from './schema.js'
import { MIGRATION_SQL, COLUMN_BACKFILL, BACKFILL_INDEXES } from './migrations.js'

export type Db = LibSQLDatabase<typeof schema>

export interface DbHandle {
  db: Db
  client: Client
  close: () => void
}

/** The default local SQLite file used when DATABASE_URL is unset — data persists across restarts. */
export const DEFAULT_DATABASE_URL = 'file:./helpuit.sqlite'

/**
 * Resolve the runtime database url: an unset/blank DATABASE_URL falls back to a
 * sensible local SQLite file (so a fork boots and KEEPS its data without any DB
 * setup), otherwise the provided value (trimmed) is used as-is.
 */
export function resolveDatabaseUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? DEFAULT_DATABASE_URL : trimmed
}

/** Map a config DATABASE_URL to a libsql url. Bare paths become file: urls. */
function toLibsqlUrl(url: string): string {
  if (url === ':memory:' || url.startsWith('file:') || url.startsWith('libsql:') || url.startsWith('http')) {
    return url
  }
  // treat anything else as a local file path
  return `file:${url}`
}

/**
 * Build the @libsql/client config from a DATABASE_URL + optional auth token. The
 * token is attached only for REMOTE libsql/Turso urls (`libsql://`, `http(s)://`),
 * which is what a managed/HA libsql server (e.g. Turso) requires; local
 * `file:`/`:memory:` dbs need no auth, so the token is dropped.
 */
export function libsqlClientConfig(url: string, authToken?: string): { url: string; authToken?: string } {
  const resolved = toLibsqlUrl(url)
  const remote = resolved.startsWith('libsql:') || resolved.startsWith('http')
  return remote && authToken !== undefined && authToken !== '' ? { url: resolved, authToken } : { url: resolved }
}

export interface CreateDbOptions {
  /** Auth token for a remote libsql/Turso server (ignored for local file/:memory:). */
  authToken?: string
}

/**
 * Open a real database, apply the schema migrations, and return a Drizzle handle.
 * Helpuit runs on SQLite/libsql: `:memory:` for tests, a local `file:` for
 * single-tenant durable storage, or a remote libsql server (Turso) for managed/HA
 * — see docs/adr/0001-database-engine.md. A `postgres://` url is rejected with a
 * clear message (the Postgres dialect foundation is built + real-PG tested, but
 * not wired — see the ADR).
 */
export async function createDb(url = ':memory:', options: CreateDbOptions = {}): Promise<DbHandle> {
  if (url.startsWith('postgres')) {
    throw new Error(
      'Helpuit runs on SQLite/libsql, not Postgres (see docs/adr/0001-database-engine.md). ' +
        'Leave DATABASE_URL unset for the default local file (file:./helpuit.sqlite), set a SQLite ' +
        'path (e.g. "file:/var/data/helpuit.db"), or use a remote libsql/Turso url ("libsql://…") ' +
        'with DATABASE_AUTH_TOKEN for managed/HA.',
    )
  }
  const client = createClient(libsqlClientConfig(url, options.authToken))
  await client.executeMultiple(MIGRATION_SQL)
  await ensureColumns(client)
  const db = drizzle(client, { schema })
  return { db, client, close: () => client.close() }
}

/**
 * Apply additive column migrations to EXISTING tables (the CREATE statements cover
 * fresh DBs). SQLite has no `ADD COLUMN IF NOT EXISTS`, so each column is added
 * only when `PRAGMA table_info` shows it's missing — making this safe to run on
 * every boot, on both fresh and upgraded databases. Indexes that reference those
 * columns are created here too, AFTER the columns exist (they can't be in the
 * CREATE block, which is a no-op on a table that predates the columns).
 */
export async function ensureColumns(client: Client): Promise<void> {
  const tableExists = async (table: string): Promise<boolean> =>
    (await client.execute(`PRAGMA table_info(${table})`)).rows.length > 0

  for (const { table, column, type } of COLUMN_BACKFILL) {
    // A missing table belongs to the CREATE block, not the backfill.
    if (!(await tableExists(table))) continue
    const info = await client.execute(`PRAGMA table_info(${table})`)
    const present = info.rows.some((row) => (row as { name?: unknown }).name === column)
    if (!present) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
  for (const index of BACKFILL_INDEXES) {
    if (await tableExists(index.table)) await client.execute(index.sql)
  }
}
