import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDatabaseUrl, DEFAULT_DATABASE_URL, createDb } from './client.js'

describe('resolveDatabaseUrl', () => {
  it('defaults to a local SQLite file when DATABASE_URL is unset or blank', () => {
    expect(resolveDatabaseUrl(undefined)).toBe(DEFAULT_DATABASE_URL)
    expect(resolveDatabaseUrl('')).toBe(DEFAULT_DATABASE_URL)
    expect(resolveDatabaseUrl('   ')).toBe(DEFAULT_DATABASE_URL)
    expect(DEFAULT_DATABASE_URL).toMatch(/^file:/)
  })

  it('passes a provided url through (trimmed)', () => {
    expect(resolveDatabaseUrl('file:/var/data/helpuit.db')).toBe('file:/var/data/helpuit.db')
    expect(resolveDatabaseUrl(':memory:')).toBe(':memory:')
    expect(resolveDatabaseUrl('  libsql://host  ')).toBe('libsql://host')
  })
})

describe('createDb', () => {
  it('rejects a postgres:// url with a clear, actionable message', async () => {
    await expect(createDb('postgres://user:pw@localhost:5432/helpuit')).rejects.toThrow(/sqlite/i)
    await expect(createDb('postgres://x')).rejects.toThrow(/DATABASE_URL/)
  })

  it('boots on a real SQLite file (the default kind of url) and runs migrations', async () => {
    // A real on-disk SQLite DB, kept in the OS temp dir so it never pollutes the repo.
    const dir = mkdtempSync(join(tmpdir(), 'helpuit-db-'))
    const url = `file:${join(dir, 'helpuit.sqlite').replace(/\\/g, '/')}`
    const handle = await createDb(url)
    try {
      // The migration ran (helpuit_docs exists) and the file DB is queryable.
      const rows = await handle.client.execute('SELECT count(*) AS n FROM helpuit_docs')
      expect(Number(rows.rows[0]!.n)).toBe(0)
    } finally {
      handle.close()
      // Best-effort — libsql can briefly hold a Windows file lock after close (temp dir is OS-reclaimed).
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* still locked; harmless temp dir */
      }
    }
  })
})
