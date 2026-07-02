import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleDraftRepository } from './draft-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

async function repo() {
  handle = await createDb(':memory:')
  return new DrizzleDraftRepository(handle.db, () => 1000)
}

const sample = {
  investigationId: 'inv-1',
  conversationId: '42',
  title: '[new_bug] Export button does nothing',
  body: '## Summary\nCSV export fails',
  labels: ['helpuit', 'new_bug'],
  severity: 'high',
  signature: 'sig-abc',
}

describe('DrizzleDraftRepository', () => {
  it('saves a pending draft and lists it (labels round-trip through JSON)', async () => {
    const r = await repo()
    const saved = await r.save(sample)
    expect(saved.status).toBe('pending')
    expect(saved.labels).toEqual(['helpuit', 'new_bug'])

    const pending = await r.list({ status: 'pending' })
    expect(pending.total).toBe(1)
    expect(pending.items[0]!.id).toBe(saved.id)
    expect(await r.get(saved.id)).toEqual(saved)
  })

  it('publishes a pending draft exactly once (race guard)', async () => {
    const r = await repo()
    const saved = await r.save(sample)

    const first = await r.markPublished(saved.id, 123, 'https://github.com/o/r/issues/123')
    expect(first?.status).toBe('published')
    expect(first?.issueNumber).toBe(123)

    // a second decision loses the race → null (the API maps this to 409)
    expect(await r.markPublished(saved.id, 999, 'https://x')).toBeNull()
    expect(await r.markRejected(saved.id, 'too late')).toBeNull()
  })

  it('rejects a pending draft exactly once', async () => {
    const r = await repo()
    const saved = await r.save(sample)
    const rejected = await r.markRejected(saved.id, 'not a real bug')
    expect(rejected?.status).toBe('rejected')
    expect(rejected?.rejectionReason).toBe('not a real bug')
    expect(await r.markPublished(saved.id, 1, 'https://x')).toBeNull()
  })

  it('returns null when deciding an unknown draft', async () => {
    const r = await repo()
    expect(await r.markPublished('nope', 1, 'https://x')).toBeNull()
    expect(await r.get('nope')).toBeNull()
  })
})
