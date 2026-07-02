import { describe, it, expect, afterEach } from 'vitest'
import { createDb, DrizzleEmbeddingRepository, DrizzleInvestigationRepository, type DbHandle } from '@helpuit/db'
import { syncIssueEmbeddings, withCaseEmbedding } from './knowledge-sync.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

/** Deterministic embedder: export-ish text → x-axis, everything else → y-axis. */
const embedder = {
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => (t.includes('export') ? Float32Array.from([1, 0]) : Float32Array.from([0, 1])))
  },
}

describe('syncIssueEmbeddings', () => {
  it('embeds open issues and drops issues that are no longer open on the next sweep', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleEmbeddingRepository(handle.db, () => 1000)
    const issues = [
      { number: 7, title: 'Large export stalls', body: 'export never finishes' },
      { number: 11, title: 'Login loop', body: 'redirected forever' },
    ]

    const first = await syncIssueEmbeddings({ listIssues: async () => issues, embedder, store, model: 'e1' })
    expect(first).toEqual({ embedded: 2, removed: 0 })
    expect(new Set((await store.loadKind('issue')).map((r) => r.ownerId))).toEqual(new Set(['7', '11']))

    // Issue 7 closes: the next sweep removes it from the match pool.
    const second = await syncIssueEmbeddings({ listIssues: async () => issues.slice(1), embedder, store, model: 'e1' })
    expect(second).toEqual({ embedded: 1, removed: 1 })
    expect((await store.loadKind('issue')).map((r) => r.ownerId)).toEqual(['11'])
  })
})

describe('withCaseEmbedding', () => {
  it('embeds case memory on save and removes it when the case concludes', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleEmbeddingRepository(handle.db, () => 1000)
    const repo = withCaseEmbedding(new DrizzleInvestigationRepository(handle.db), { embedder, store, model: 'e1' })

    const inv = await repo.getOrCreateForConversation('9', 'u1')
    await repo.saveCase(inv.id, JSON.stringify({ complaint: 'my export hangs at 99%', notes: 'suspects large CSV' }))
    await repo.flushEmbeds()

    const rows = await store.loadKind('case')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ownerId: inv.id })
    expect(rows[0]!.text).toContain('export hangs')

    await repo.setStatus(inv.id, 'resolved')
    await repo.flushEmbeds()
    expect(await store.loadKind('case')).toEqual([])
  })

  it('skips embedding when the case memory has nothing usable yet', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleEmbeddingRepository(handle.db, () => 1000)
    const repo = withCaseEmbedding(new DrizzleInvestigationRepository(handle.db), { embedder, store, model: 'e1' })

    const inv = await repo.getOrCreateForConversation('9')
    await repo.saveCase(inv.id, '{}')
    await repo.flushEmbeds()
    expect(await store.loadKind('case')).toEqual([])
  })
})
