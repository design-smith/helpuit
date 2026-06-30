import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleDocsRepository } from './docs-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleDocsRepository', () => {
  it('persists a pasted doc and lists it back with a generated id', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleDocsRepository(handle.db)

    const saved = await repo.add({ title: 'Refunds', text: 'Refunds are processed within 5 business days.' })
    expect(saved.id).toBeTruthy()
    expect(saved.title).toBe('Refunds')
    expect(saved.text).toBe('Refunds are processed within 5 business days.')

    const all = await repo.list()
    expect(all).toHaveLength(1)
    expect(all[0]!.id).toBe(saved.id)
    expect(all[0]!.text).toBe('Refunds are processed within 5 business days.')
    // Legacy paste: no source/externalId.
    expect(all[0]!.source).toBeNull()
    expect(all[0]!.externalId).toBeNull()
  })

  it('persists source + externalId when given', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleDocsRepository(handle.db)
    const saved = await repo.add({ title: 'Handbook', text: 'body', source: 'gdrive', externalId: 'file-1' })
    expect(saved).toMatchObject({ source: 'gdrive', externalId: 'file-1' })
    expect((await repo.list())[0]).toMatchObject({ source: 'gdrive', externalId: 'file-1' })
  })

  describe('upsertBySource', () => {
    it('inserts once, then replaces in place on re-import (same id, no duplicate)', async () => {
      let clock = 1000
      handle = await createDb(':memory:')
      const repo = new DrizzleDocsRepository(handle.db, () => clock)

      const first = await repo.upsertBySource('gdrive', 'file-1', { title: 'Doc', text: 'v1' })
      expect(first).toMatchObject({ source: 'gdrive', externalId: 'file-1', text: 'v1' })

      clock = 2000
      const second = await repo.upsertBySource('gdrive', 'file-1', { title: 'Doc (updated)', text: 'v2' })
      expect(second.id).toBe(first.id) // stable id → the live index can replace by id
      expect(second.text).toBe('v2')

      const all = await repo.list()
      expect(all).toHaveLength(1) // replaced, not duplicated
      expect(all[0]).toMatchObject({ id: first.id, title: 'Doc (updated)', text: 'v2' })
    })

    it('keeps docs with the same externalId but a different source separate', async () => {
      handle = await createDb(':memory:')
      const repo = new DrizzleDocsRepository(handle.db)
      await repo.upsertBySource('gdrive', 'shared-id', { text: 'from drive' })
      await repo.upsertBySource('dropbox', 'shared-id', { text: 'from dropbox' })
      expect(await repo.list()).toHaveLength(2)
    })
  })
})
