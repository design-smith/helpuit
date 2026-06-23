import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleControlStore } from './control-store.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleControlStore', () => {
  it('defaults to not paused for an unknown conversation', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleControlStore(handle.db)
    expect(await store.isPaused(7)).toBe(false)
  })

  it('pauses and resumes a conversation', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleControlStore(handle.db, () => 1000)

    await store.pause(7, 'founder handling the refund manually')
    expect(await store.isPaused(7)).toBe(true)

    await store.resume(7)
    expect(await store.isPaused(7)).toBe(false)
  })

  it('upserts (pausing twice keeps a single row) and lists paused conversations', async () => {
    handle = await createDb(':memory:')
    const store = new DrizzleControlStore(handle.db)

    await store.pause(7)
    await store.pause(7, 'updated note')
    await store.pause(9)

    const paused = await store.listPaused()
    expect(paused.map((c) => c.conversationId).sort((a, b) => a - b)).toEqual([7, 9])
    expect(paused.find((c) => c.conversationId === 7)?.note).toBe('updated note')
  })
})
