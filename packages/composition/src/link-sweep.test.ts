import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from '@helpuit/db'
import { DocsService } from './docs-service.js'
import { sweepLinkDocs } from './link-sweep.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('sweepLinkDocs', () => {
  it('re-scrapes every link doc, refreshing store + live index in place; failures skip, never crash', async () => {
    handle = await createDb(':memory:')
    const docs = await DocsService.create(handle.db)
    await docs.importDoc({ source: 'link', externalId: 'https://a.example/pricing', text: 'Pro costs $20.' })
    await docs.importDoc({ source: 'link', externalId: 'https://b.example/dead', text: 'old text' })
    await docs.add({ title: 'Manual note', text: 'not a link — untouched' })

    const scrape = async (url: string) => {
      if (url.includes('dead')) throw new Error('HTTP 410')
      return { title: 'Pricing', text: 'Pro now costs $25.' }
    }

    const result = await sweepLinkDocs({ docs, scrape })

    expect(result).toEqual({ refreshed: 1, failed: 1 })
    const all = await docs.list()
    expect(all).toHaveLength(3) // refresh in place — no dupes
    expect(all.find((d) => d.externalId === 'https://a.example/pricing')!.text).toBe('Pro now costs $25.')
    expect(all.find((d) => d.externalId === 'https://b.example/dead')!.text).toBe('old text') // failure keeps prior text
    expect((await docs.index.retrieve('how much does pro cost'))[0]!.text).toContain('$25') // live index refreshed
  })
})
