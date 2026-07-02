import { describe, it, expect, afterEach } from 'vitest'
import { TicketNotFoundError } from '@helpuit/ticketing'
import { createDb, type DbHandle } from './client.js'
import { DrizzleManifestStore } from './manifest-repository.js'
import { DrizzleTicketing } from './ticketing-repository.js'
import { DrizzleGithubLinks } from './github-links-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleManifestStore', () => {
  it('round-trips the manifest and upserts on save', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleManifestStore(handle.db, () => 1)
    expect(await store.load()).toBeNull()

    await store.save({ ref: 'main', features: [{ key: 'billing', name: 'Billing', routes: ['/b'], components: [], endpoints: [], docsLinks: [] }] })
    expect((await store.load())?.features[0]?.key).toBe('billing')

    await store.save({ ref: 'release', features: [] })
    const reloaded = await store.load()
    expect(reloaded?.ref).toBe('release')
    expect(reloaded?.features).toHaveLength(0)
  })
})

describe('DrizzleTicketing', () => {
  it('creates, links many tickets to one issue, and queries them back', async () => {
    handle = await createDb(':memory:')
    const ticketing = new DrizzleTicketing(handle.db)
    const a = await ticketing.create({ investigationId: 'inv-1', conversationId: '11' })
    const b = await ticketing.create({ investigationId: 'inv-2', conversationId: '22' })
    expect(a.issueNumber).toBeNull()

    await ticketing.linkToIssue(a.id, 99)
    await ticketing.linkToIssue(b.id, 99)
    const linked = await ticketing.ticketsForIssue(99)
    expect(linked.map((t) => t.conversationId).sort()).toEqual(['11', '22'])
  })

  it('throws when linking an unknown ticket', async () => {
    handle = await createDb(':memory:')
    const ticketing = new DrizzleTicketing(handle.db)
    await expect(ticketing.linkToIssue('nope', 1)).rejects.toThrow(TicketNotFoundError)
  })
})

describe('DrizzleGithubLinks', () => {
  it('links many investigations to one issue', async () => {
    handle = await createDb(':memory:')
    const links = new DrizzleGithubLinks(handle.db, () => 1)
    await links.link({ investigationId: 'inv-1', issueNumber: 7, issueUrl: 'u' })
    await links.link({ investigationId: 'inv-2', issueNumber: 7, issueUrl: 'u' })
    await links.link({ investigationId: 'inv-3', issueNumber: 8, issueUrl: 'u' })

    expect((await links.investigationsForIssue(7)).sort()).toEqual(['inv-1', 'inv-2'])
    expect(await links.investigationsForIssue(8)).toEqual(['inv-3'])
  })
})
