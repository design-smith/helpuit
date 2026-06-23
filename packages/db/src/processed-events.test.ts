import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleProcessedEvents } from './processed-events.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleProcessedEvents', () => {
  it('claims an event id exactly once (real DB idempotency)', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleProcessedEvents(handle.db, 'chatwoot', () => 1)

    expect(await store.claim('1001')).toBe(true)
    expect(await store.claim('1001')).toBe(false)
  })

  it('namespaces by source so the same raw id from different sources is independent', async () => {
    handle = await createDb(':memory:')
    const chatwoot = new DrizzleProcessedEvents(handle.db, 'chatwoot', () => 1)
    const github = new DrizzleProcessedEvents(handle.db, 'github', () => 1)

    expect(await chatwoot.claim('1001')).toBe(true)
    expect(await github.claim('1001')).toBe(true)
    expect(await github.claim('1001')).toBe(false)
  })
})
