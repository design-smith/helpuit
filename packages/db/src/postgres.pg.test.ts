import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createPostgresDb, type PostgresHandle } from './postgres.js'
import { docs, manifests, auditEntries } from './schema.pg.js'

// Real Postgres via testcontainers (Docker). Run with `pnpm test:pg`.
let container: StartedPostgreSqlContainer | undefined
let handle: PostgresHandle | undefined

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start()
  handle = await createPostgresDb(container.getConnectionUri())
}, 120_000)

afterAll(async () => {
  await handle?.close()
  await container?.stop()
})

describe('createPostgresDb (real Postgres)', () => {
  it('applies the full schema migration to a real Postgres (all tables created)', async () => {
    const { rows } = await handle!.client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'helpuit_%'",
    )
    // 19 helpuit_* tables in the schema.
    expect(rows[0].n).toBe(19)
  })

  it('round-trips a TEXT-keyed row with a BIGINT timestamp returned as a number', async () => {
    await handle!.client.query('INSERT INTO helpuit_docs (id, title, text, created_at) VALUES ($1, $2, $3, $4)', [
      'doc-1',
      'Refunds',
      'Refunds take 5 days.',
      1_700_000_000_000,
    ])
    const { rows } = await handle!.client.query('SELECT * FROM helpuit_docs WHERE id = $1', ['doc-1'])
    expect(rows[0].text).toBe('Refunds take 5 days.')
    expect(rows[0].created_at).toBe(1_700_000_000_000) // int8 parsed to number, not "1700000000000"
    expect(typeof rows[0].created_at).toBe('number')
  })

  it('auto-assigns BIGSERIAL ids (the AUTOINCREMENT translation)', async () => {
    await handle!.client.query('INSERT INTO helpuit_audit_entries (investigation_id, type, at) VALUES ($1, $2, $3)', [
      'doc-1',
      'note',
      1_700_000_000_001,
    ])
    const { rows } = await handle!.client.query('SELECT id FROM helpuit_audit_entries ORDER BY id LIMIT 1')
    expect(typeof rows[0].id).toBe('number')
    expect(rows[0].id).toBeGreaterThan(0)
  })

  it('is idempotent — applying the migration again is a no-op', async () => {
    await expect(createPostgresDb(container!.getConnectionUri()).then((h) => h.close())).resolves.toBeUndefined()
  })

  describe('Drizzle query patterns (the same surface the repositories use) work on Postgres', () => {
    it('insert + select round-trips, with bigint columns read as numbers', async () => {
      await handle!.db.insert(docs).values({ id: 'd-pg', title: 'SSO', text: 'Enable SSO.', createdAt: 1_700_000_000_000 })
      const rows = await handle!.db.select().from(docs).where(eq(docs.id, 'd-pg'))
      expect(rows[0]!.text).toBe('Enable SSO.')
      expect(rows[0]!.createdAt).toBe(1_700_000_000_000)
      expect(typeof rows[0]!.createdAt).toBe('number')
    })

    it('onConflictDoUpdate upserts a single-row keyed table (the manifest-store pattern)', async () => {
      const put = (json: string) =>
        handle!.db
          .insert(manifests)
          .values({ id: 'current', json, updatedAt: 1 })
          .onConflictDoUpdate({ target: manifests.id, set: { json, updatedAt: 2 } })

      await put('{"v":1}')
      await put('{"v":2}')

      const rows = await handle!.db.select().from(manifests).where(eq(manifests.id, 'current'))
      expect(rows).toHaveLength(1) // upserted, not duplicated
      expect(rows[0]!.json).toBe('{"v":2}')
    })

    it('bigserial ids auto-increment and come back as numbers (the autoincrement pattern)', async () => {
      const [row] = await handle!.db
        .insert(auditEntries)
        .values({ investigationId: 'd-pg', type: 'note', at: 1_700_000_000_002 })
        .returning({ id: auditEntries.id })
      expect(typeof row!.id).toBe('number')
      expect(row!.id).toBeGreaterThan(0)
    })
  })
})
