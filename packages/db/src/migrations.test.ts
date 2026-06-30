import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { createDb, ensureColumns, type DbHandle } from './client.js'

let client: Client | undefined
let handle: DbHandle | undefined
let tempDir: string | undefined
afterEach(() => {
  client?.close()
  handle?.close()
  client = handle = undefined
  if (tempDir !== undefined) {
    // Best-effort: on Windows the native libsql file handle can linger briefly after
    // close(), so a failed temp cleanup must not fail the test (the OS reclaims temp).
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      /* leave the temp dir for the OS to reclaim */
    }
    tempDir = undefined
  }
})

/** A `file:` url to a fresh temp SQLite db (forward slashes so the url parses on Windows). */
function tempDbUrl(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'helpuit-db-'))
  return `file:${join(tempDir, 'helpuit.sqlite').replace(/\\/g, '/')}`
}

async function columnsOf(c: Client, table: string): Promise<string[]> {
  const info = await c.execute(`PRAGMA table_info(${table})`)
  return info.rows.map((r) => String((r as { name?: unknown }).name))
}

describe('schema migrations', () => {
  it('a fresh database has the docs source/external_id columns', async () => {
    handle = await createDb(':memory:')
    const cols = await columnsOf(handle.client, 'helpuit_docs')
    expect(cols).toEqual(expect.arrayContaining(['source', 'external_id']))
  })

  it('ensureColumns adds missing columns to an EXISTING table, and is idempotent', async () => {
    client = createClient({ url: ':memory:' })
    // Simulate a pre-existing DB created before the columns were introduced.
    await client.execute('CREATE TABLE helpuit_docs (id TEXT PRIMARY KEY, title TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL)')
    expect(await columnsOf(client, 'helpuit_docs')).not.toEqual(expect.arrayContaining(['source']))

    await ensureColumns(client)
    expect(await columnsOf(client, 'helpuit_docs')).toEqual(expect.arrayContaining(['source', 'external_id']))

    // Running again must not throw (no ADD COLUMN IF NOT EXISTS in SQLite — guarded by the pragma check).
    await expect(ensureColumns(client)).resolves.toBeUndefined()

    // A row written through the migrated table round-trips.
    await client.execute({
      sql: 'INSERT INTO helpuit_docs (id, title, text, source, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['d1', 'T', 'body', 'gdrive', 'file-9', 1000],
    })
    const rows = await client.execute({ sql: 'SELECT source, external_id FROM helpuit_docs WHERE id = ?', args: ['d1'] })
    expect(rows.rows[0]).toMatchObject({ source: 'gdrive', external_id: 'file-9' })
  })

  it('boots cleanly on a PERSISTED database created before the source columns (full createDb)', async () => {
    const url = tempDbUrl()

    // Seed an old-shape docs table + row, as an existing deployment would have on disk.
    const seed = createClient({ url })
    await seed.execute('CREATE TABLE helpuit_docs (id TEXT PRIMARY KEY, title TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL)')
    await seed.execute({
      sql: 'INSERT INTO helpuit_docs (id, title, text, created_at) VALUES (?, ?, ?, ?)',
      args: ['d1', 'Handbook', 'Vacation is 20 days.', 1000],
    })
    seed.close()

    // The full boot path must upgrade the existing DB without throwing
    // (CREATE INDEX on the new columns must run AFTER they're backfilled).
    handle = await createDb(url)

    const cols = await columnsOf(handle.client, 'helpuit_docs')
    expect(cols).toEqual(expect.arrayContaining(['source', 'external_id']))

    // The composite index on the backfilled columns exists.
    const idx = await handle.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_docs_source'",
    )
    expect(idx.rows).toHaveLength(1)

    // The pre-existing row survived the upgrade.
    const rows = await handle.client.execute('SELECT id, source FROM helpuit_docs')
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({ id: 'd1', source: null })
  })
})
