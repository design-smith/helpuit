import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleEmbeddingRepository } from './embedding-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const vec = (...n: number[]) => Float32Array.from(n)

describe('DrizzleEmbeddingRepository', () => {
  it('stores chunk vectors per owner and loads them back as Float32Array', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleEmbeddingRepository(handle.db, () => 1000)

    await repo.replaceForOwner('doc', 'd1', [
      { seq: 0, text: 'refunds take five days', vector: vec(1, 0), model: 'e1' },
      { seq: 1, text: 'exports need a subscription', vector: vec(0, 1), model: 'e1' },
    ])

    const rows = await repo.loadKind('doc')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ ownerKind: 'doc', ownerId: 'd1', seq: 0, text: 'refunds take five days', model: 'e1' })
    expect(Array.from(rows[0]!.vector)).toEqual([1, 0])
  })

  it('re-importing an owner replaces its chunks (no dupes) and removeOwner drops them', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleEmbeddingRepository(handle.db, () => 1000)

    await repo.replaceForOwner('doc', 'd1', [{ seq: 0, text: 'v1', vector: vec(1), model: 'e1' }])
    await repo.replaceForOwner('doc', 'd1', [{ seq: 0, text: 'v2', vector: vec(2), model: 'e1' }])
    const rows = await repo.loadKind('doc')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text).toBe('v2')

    await repo.removeOwner('doc', 'd1')
    expect(await repo.loadKind('doc')).toHaveLength(0)
  })

  it('keeps owner kinds separate (docs vs issues share the table, not the namespace)', async () => {
    handle = await createDb(':memory:')
    const repo = new DrizzleEmbeddingRepository(handle.db, () => 1)
    await repo.replaceForOwner('doc', 'x', [{ seq: 0, text: 'a', vector: vec(1), model: 'e1' }])
    await repo.replaceForOwner('issue', '42', [{ seq: 0, text: 'b', vector: vec(1), model: 'e1' }])
    expect(await repo.loadKind('issue')).toHaveLength(1)
    expect((await repo.loadKind('issue'))[0]!.ownerId).toBe('42')
  })
})
