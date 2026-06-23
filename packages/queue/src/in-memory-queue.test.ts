import { describe, it, expect } from 'vitest'
import { InMemoryJobQueue } from './in-memory-queue.js'

describe('InMemoryJobQueue', () => {
  it('enqueues then claims the job (status→active, attempts incremented)', async () => {
    const q = new InMemoryJobQueue()
    const id = await q.enqueue({ type: 'investigation', payload: { conversationId: 7 } }, 1000)

    const job = await q.claim(1000)
    expect(job?.id).toBe(id)
    expect(job?.type).toBe('investigation')
    expect(job?.payload).toEqual({ conversationId: 7 })
    expect(job?.status).toBe('active')
    expect(job?.attempts).toBe(1)

    // already claimed → nothing left to claim
    expect(await q.claim(1000)).toBeNull()
  })

  it('does not claim a job whose runAfter is in the future', async () => {
    const q = new InMemoryJobQueue()
    await q.enqueue({ type: 't', payload: {}, runAfter: 5000 }, 1000)
    expect(await q.claim(1000)).toBeNull()
    expect((await q.claim(5000))?.runAfter).toBe(5000)
  })

  it('completing a job removes it from the runnable set', async () => {
    const q = new InMemoryJobQueue()
    const id = await q.enqueue({ type: 't', payload: {} }, 1000)
    await q.claim(1000)
    await q.complete(id, 1100)
    expect((await q.counts()).done).toBe(1)
    expect(await q.claim(2000)).toBeNull()
  })

  it('fail reschedules with backoff while attempts remain, then dead-letters', async () => {
    const q = new InMemoryJobQueue()
    const id = await q.enqueue({ type: 't', payload: {}, maxAttempts: 2 }, 1000)

    // attempt 1
    await q.claim(1000)
    await q.fail(id, 'boom', { now: 1000, retryDelayMs: 500 })
    expect((await q.counts()).pending).toBe(1)
    expect(await q.claim(1000)).toBeNull() // backed off
    const retried = await q.claim(1500)
    expect(retried?.attempts).toBe(2)

    // attempt 2 exhausts maxAttempts → dead-letter
    await q.fail(id, 'boom again', { now: 1500, retryDelayMs: 500 })
    const counts = await q.counts()
    expect(counts.failed).toBe(1)
    expect(counts.pending).toBe(0)
    expect(await q.claim(9999)).toBeNull()
  })
})
