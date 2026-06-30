import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import { PostgresExecutor } from './postgres-executor.js'
import { QueryRouteCatalog, QueryRouteClient } from './query-routes.js'
import type { VerifiedIdentity } from '@helpuit/identity'

// Real Postgres via testcontainers (Docker). Run with `pnpm test:pg`.
let container: StartedPostgreSqlContainer | undefined
let pool: Pool | undefined
let executor: PostgresExecutor | undefined

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start()
  pool = new Pool({ connectionString: container.getConnectionUri() })
  await pool.query('create table accounts (user_id text primary key, plan text, status text, ssn text)')
  await pool.query("insert into accounts values ('user-1','pro','active','secret'), ('user-2','free','active','other')")
  executor = new PostgresExecutor({
    connectionString: container.getConnectionUri(),
    routes: [{ name: 'account', table: 'accounts', userColumn: 'user_id' }],
    pool,
  })
}, 120_000)

afterAll(async () => {
  await pool?.end()
  await container?.stop()
})

describe('PostgresExecutor (real Postgres)', () => {
  it('reads only the allowlisted columns for the verified user, scoped to their row', async () => {
    const catalog = new QueryRouteCatalog([{ name: 'account', allowedColumns: ['plan', 'status'], param: 'user_id' }])
    const client = new QueryRouteClient(catalog, executor!)
    const identity: VerifiedIdentity = { userId: 'user-1' }

    const rows = await client.query({ route: 'account', columns: ['plan', 'status'] }, identity)
    expect(rows).toEqual([{ plan: 'pro', status: 'active' }]) // only user-1's row, no ssn
  })

  it('blocks a non-allowlisted column before any SQL runs', async () => {
    const catalog = new QueryRouteCatalog([{ name: 'account', allowedColumns: ['plan'], param: 'user_id' }])
    const client = new QueryRouteClient(catalog, executor!)
    await expect(client.query({ route: 'account', columns: ['ssn'] }, { userId: 'user-1' })).rejects.toThrow(/not allowed/i)
  })

  it('cannot reach another user’s row — the filter is bound to the verified id', async () => {
    const rows = await executor!.execute('account', ['plan'], 'user-2')
    expect(rows).toEqual([{ plan: 'free' }])
  })
})
