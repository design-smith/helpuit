import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from '@helpuit/db'
import { DocsService } from './docs-service.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

// Grounding is proven at the retrieval seam: the live index either surfaces the
// doc (it can ground a reply) or it doesn't.
const sourcesFor = async (index: { retrieve(q: string, k?: number): unknown }, q: string) =>
  ((await index.retrieve(q)) as Array<{ id: string }>).map((h) => h.id)

describe('DocsService', () => {
  it('ingests an added doc into the live index so an L1 answer cites it as a source', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)

    const doc = await service.add({
      title: 'Exporting data',
      text: 'To export your data, open Settings, choose Export, and click Download.',
    })

    expect(await sourcesFor(service.index, 'how do I export my data?')).toContain(doc.id)
  })

  it('re-loads persisted docs into the index on a fresh start (survives restart)', async () => {
    handle = await createDb(':memory:')
    const first = await DocsService.create(handle.db)
    const doc = await first.add({ text: 'Billing invoices are emailed on the first of each month.' })

    // Simulate a restart: a brand-new service over the SAME database.
    const restarted = await DocsService.create(handle.db)
    expect(await sourcesFor(restarted.index, 'when are invoices emailed?')).toContain(doc.id)
  })

  it('importDoc persists + grounds live, and re-import replaces in place (no duplicate)', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)

    const v1 = await service.importDoc({
      source: 'gdrive',
      externalId: 'file-1',
      title: 'Refunds',
      text: 'Refunds take five business days.',
    })
    // Live in the index (grounds L1) and persisted with its source identity.
    expect(await sourcesFor(service.index, 'how long do refunds take?')).toContain(v1.id)
    expect((await service.list())[0]).toMatchObject({ id: v1.id, source: 'gdrive', externalId: 'file-1' })

    // Re-importing the same file refreshes it in place — same id, no duplicate, new text live.
    const v2 = await service.importDoc({ source: 'gdrive', externalId: 'file-1', text: 'Refunds now take ten business days.' })
    expect(v2.id).toBe(v1.id)
    expect(await service.list()).toHaveLength(1)
    const hits = await service.index.retrieve('refunds business days')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).toContain('ten business days')
  })

  it('remove drops the doc from the live index so it stops grounding immediately (no restart)', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)
    const doc = await service.add({ title: 'Old policy', text: 'The old refund window was seven days.' })

    // Grounds before removal.
    expect(await sourcesFor(service.index, 'what was the refund window?')).toContain(doc.id)

    const removed = await service.remove(doc.id)
    expect(removed).toBe(true)

    // Gone from the store AND the live index — no longer grounds, with no restart.
    expect(await service.list()).toHaveLength(0)
    expect(await sourcesFor(service.index, 'what was the refund window?')).not.toContain(doc.id)
  })

  it('with an embedder configured, retrieval is semantic: a paraphrase finds the doc (real vector store)', async () => {
    handle = await createDb(':memory:')
    const embedder = {
      async embed(texts: string[]) {
        // Deterministic: refund-ish text → [1,0]; anything else → [0,1].
        return texts.map((t) => Float32Array.from(/refund|money back/i.test(t) ? [1, 0] : [0, 1]))
      },
    }
    const service = await DocsService.create(handle.db, { embedder, embeddingModel: 'e1' })

    await service.add({ title: 'Refund policy', text: 'Refunds are returned within five business days.' })
    await service.add({ title: 'Exports', text: 'Exports require an active subscription.' })
    await service.flush()

    const hits = await service.index.retrieve('money back', 1)
    expect(hits[0]!.text).toContain('Refunds are returned')
  })

  it('grounds on nothing when no docs are ingested (unchanged behavior, no crash)', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)

    expect(await sourcesFor(service.index, 'anything at all')).toEqual([])
  })
})
