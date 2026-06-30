import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from '@helpuit/db'
import { GuidanceAgent, type GuidanceModel } from '@helpuit/guidance'
import { DocsService } from './docs-service.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

// The external LLM is the documented test seam ("faked in tests; a real Claude
// client in production"). The grounding `sources` come from the REAL index, not
// the model — so this still proves real retrieval behavior.
const fixedModel: GuidanceModel = {
  generate: async () => ({ message: 'Here are the steps.', confidence: 0.9 }),
}

describe('DocsService', () => {
  it('ingests an added doc into the live index so an L1 answer cites it as a source', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)

    const doc = await service.add({
      title: 'Exporting data',
      text: 'To export your data, open Settings, choose Export, and click Download.',
    })

    const agent = new GuidanceAgent(service.index, fixedModel)
    const answer = await agent.answer('how do I export my data?')

    expect(answer.sources).toContain(doc.id)
  })

  it('re-loads persisted docs into the index on a fresh start (survives restart)', async () => {
    handle = await createDb(':memory:')
    const first = await DocsService.create(handle.db)
    const doc = await first.add({ text: 'Billing invoices are emailed on the first of each month.' })

    // Simulate a restart: a brand-new service over the SAME database.
    const restarted = await DocsService.create(handle.db)
    const answer = await new GuidanceAgent(restarted.index, fixedModel).answer('when are invoices emailed?')

    expect(answer.sources).toContain(doc.id)
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
    const answer = await new GuidanceAgent(service.index, fixedModel).answer('how long do refunds take?')
    expect(answer.sources).toContain(v1.id)
    expect((await service.list())[0]).toMatchObject({ id: v1.id, source: 'gdrive', externalId: 'file-1' })

    // Re-importing the same file refreshes it in place — same id, no duplicate, new text live.
    const v2 = await service.importDoc({ source: 'gdrive', externalId: 'file-1', text: 'Refunds now take ten business days.' })
    expect(v2.id).toBe(v1.id)
    expect(await service.list()).toHaveLength(1)
    const hits = service.index.retrieve('refunds business days')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.text).toContain('ten business days')
  })

  it('remove drops the doc from the live index so it stops grounding immediately (no restart)', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)
    const doc = await service.add({ title: 'Old policy', text: 'The old refund window was seven days.' })

    // Grounds before removal.
    const before = await new GuidanceAgent(service.index, fixedModel).answer('what was the refund window?')
    expect(before.sources).toContain(doc.id)

    const removed = await service.remove(doc.id)
    expect(removed).toBe(true)

    // Gone from the store AND the live index — no longer grounds, with no restart.
    expect(await service.list()).toHaveLength(0)
    const after = await new GuidanceAgent(service.index, fixedModel).answer('what was the refund window?')
    expect(after.sources).not.toContain(doc.id)
  })

  it('grounds on nothing when no docs are ingested (unchanged behavior, no crash)', async () => {
    handle = await createDb(':memory:')
    const service = await DocsService.create(handle.db)

    const answer = await new GuidanceAgent(service.index, fixedModel).answer('anything at all')

    expect(answer.sources).toEqual([])
  })
})
