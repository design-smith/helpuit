import { describe, it, expect } from 'vitest'
import { SemanticDocsIndex, chunkText, type VectorStore } from './semantic-index.js'

/** Deterministic "embedding": a lookup table — no randomness, no network. */
function fakeEmbedder(table: Record<string, number[]>) {
  return {
    async embed(texts: string[]) {
      return texts.map((t) => {
        const hit = Object.entries(table).find(([key]) => t.includes(key))
        if (hit === undefined) throw new Error(`no fake vector for: ${t}`)
        return Float32Array.from(hit[1])
      })
    },
  }
}

/** Minimal in-memory VectorStore (the real Drizzle store is tested in @helpuit/db). */
function memoryStore(): VectorStore {
  const rows: Array<{ ownerKind: string; ownerId: string; seq: number; text: string; vector: Float32Array; model: string }> = []
  return {
    async replaceForOwner(kind, id, chunks) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.ownerKind === kind && rows[i]!.ownerId === id) rows.splice(i, 1)
      for (const c of chunks) rows.push({ ownerKind: kind, ownerId: id, ...c })
    },
    async loadKind(kind) {
      return rows.filter((r) => r.ownerKind === kind)
    },
    async removeOwner(kind, id) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.ownerKind === kind && rows[i]!.ownerId === id) rows.splice(i, 1)
    },
  }
}

describe('chunkText', () => {
  it('packs paragraphs greedily up to the limit and never returns empty chunks', () => {
    const text = `${'a'.repeat(900)}\n\n${'b'.repeat(900)}\n\n${'c'.repeat(100)}`
    const chunks = chunkText(text, 1500)
    expect(chunks).toHaveLength(2) // a alone (a+b would exceed), then b+c packed
    expect(chunks[0]).toBe('a'.repeat(900))
    expect(chunks[1]).toContain('c')
    expect(chunkText('   \n\n  ', 1500)).toEqual([])
  })
})

describe('SemanticDocsIndex', () => {
  it('ranks by MEANING: a paraphrase query finds the doc with zero token overlap', async () => {
    const embedder = fakeEmbedder({
      'Refunds are returned': [1, 0],
      'Exports require': [0, 1],
      'getting my money back': [0.95, 0.05],
    })
    const index = new SemanticDocsIndex({ embedder, store: memoryStore(), model: 'e1' })
    index.ingest([
      { id: 'refunds', title: 'Refund policy', text: 'Refunds are returned within five business days.' },
      { id: 'exports', title: 'Exports', text: 'Exports require an active subscription.' },
    ])
    await index.flush()

    const hits = await index.retrieve('getting my money back', 1)
    expect(hits[0]!.id).toBe('refunds')
  })

  it('upsert refreshes vectors in place and removeById drops them from retrieval', async () => {
    const embedder = fakeEmbedder({ old: [1, 0], 'new text': [0, 1], query: [0, 1] })
    const index = new SemanticDocsIndex({ embedder, store: memoryStore(), model: 'e1' })
    index.ingest([{ id: 'd1', text: 'old' }])
    await index.flush()

    index.upsert({ id: 'd1', text: 'new text' })
    await index.flush()
    const hits = await index.retrieve('query', 1)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).toBe('new text')

    index.removeById('d1')
    await index.flush()
    expect(await index.retrieve('query', 1)).toHaveLength(0)
  })

  it('falls back to token overlap for docs whose embedding failed (coverage never drops)', async () => {
    // The embedder knows the query but refuses the doc — embedding fails, fallback covers it.
    const embedder = fakeEmbedder({ 'billing page': [1, 0] })
    const index = new SemanticDocsIndex({ embedder, store: memoryStore(), model: 'e1' })
    index.ingest([{ id: 'sso', text: 'enable single sign-on under settings' }])
    await index.flush() // embed rejected; token-overlap fallback still has the doc

    const hits = await index.retrieve('how do I enable single sign-on billing page', 3)
    expect(hits.map((h) => h.id)).toContain('sso')
  })
})
