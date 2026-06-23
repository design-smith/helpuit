import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { jobs } from './schema.js'
import { DrizzleJobQueue } from './job-queue.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('DrizzleJobQueue', () => {
  it('persists an enqueued job and claims it back with its payload intact', async () => {
    handle = await createDb(':memory:')
    const q = new DrizzleJobQueue(handle.db)

    const id = await q.enqueue({ type: 'investigation', payload: { conversationId: 7, token: 'abc' } }, 1000)

    // persisted as a real row
    expect((await handle.db.select().from(jobs))[0]!.status).toBe('pending')

    const job = await q.claim(1000)
    expect(job?.id).toBe(id)
    expect(job?.payload).toEqual({ conversationId: 7, token: 'abc' })
    expect(job?.status).toBe('active')
    expect(job?.attempts).toBe(1)
  })

  it('never hands the same job to two concurrent claimers', async () => {
    handle = await createDb(':memory:')
    const q = new DrizzleJobQueue(handle.db)
    await q.enqueue({ type: 't', payload: {} }, 1000)

    const [a, b] = await Promise.all([q.claim(1000), q.claim(1000)])
    const claimed = [a, b].filter((j) => j !== null)
    expect(claimed).toHaveLength(1) // exactly one claimer wins
  })

  it('completes a job so it is no longer claimable', async () => {
    handle = await createDb(':memory:')
    const q = new DrizzleJobQueue(handle.db)
    const id = await q.enqueue({ type: 't', payload: {} }, 1000)
    await q.claim(1000)
    await q.complete(id, 1100)

    expect(await q.claim(2000)).toBeNull()
    expect((await q.counts()).done).toBe(1)
  })

  it('retries with backoff then dead-letters after maxAttempts', async () => {
    handle = await createDb(':memory:')
    const q = new DrizzleJobQueue(handle.db)
    const id = await q.enqueue({ type: 't', payload: {}, maxAttempts: 2 }, 1000)

    await q.claim(1000)
    await q.fail(id, 'boom', { now: 1000, retryDelayMs: 500 })
    expect(await q.claim(1000)).toBeNull() // backed off
    const retried = await q.claim(1500)
    expect(retried?.attempts).toBe(2)

    await q.fail(id, 'again', { now: 1500, retryDelayMs: 500 })
    const counts = await q.counts()
    expect(counts.failed).toBe(1)
    expect(await q.claim(99_999)).toBeNull()
    expect((await handle.db.select().from(jobs))[0]!.lastError).toBe('again')
  })
})
