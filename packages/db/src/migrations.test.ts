import { describe, it, expect, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { createDb, ensureColumns, type DbHandle } from './client.js'

let client: Client | undefined
let handle: DbHandle | undefined
afterEach(() => {
  client?.close()
  handle?.close()
})

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
})
