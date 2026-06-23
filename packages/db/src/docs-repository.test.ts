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
  })
})
