import { describe, it, expect } from 'vitest'
import { InMemoryJobQueue } from './in-memory-queue.js'
import { Worker } from './worker.js'
import type { Job } from './types.js'

describe('Worker', () => {
  it('drains the queue, running the registered handler for each job', async () => {
    const queue = new InMemoryJobQueue()
    const processed: number[] = []
    const worker = new Worker(queue, {
      investigation: async (job: Job) => {
        processed.push((job.payload as { n: number }).n)
      },
    })

    await queue.enqueue({ type: 'investigation', payload: { n: 1 } })
    await queue.enqueue({ type: 'investigation', payload: { n: 2 } })
    await queue.enqueue({ type: 'investigation', payload: { n: 3 } })

    await worker.drain()

    expect(processed.sort()).toEqual([1, 2, 3])
    expect((await queue.counts()).done).toBe(3)
  })

  it('retries a failing handler with backoff, then dead-letters after maxAttempts', async () => {
    const queue = new InMemoryJobQueue()
    let calls = 0
    const worker = new Worker(
      queue,
      {
        flaky: async () => {
          calls += 1
          throw new Error('always down')
        },
      },
      { retryDelayMs: 0 }, // no backoff so drain can run all attempts
    )
    await queue.enqueue({ type: 'flaky', payload: {}, maxAttempts: 3 })

    await worker.drain()

    expect(calls).toBe(3) // initial + 2 retries
    const counts = await queue.counts()
    expect(counts.failed).toBe(1)
    expect(counts.done).toBe(0)
  })

  it('recovers when a handler succeeds on a later attempt', async () => {
    const queue = new InMemoryJobQueue()
    let calls = 0
    const worker = new Worker(
      queue,
      {
        flaky: async () => {
          calls += 1
          if (calls < 2) throw new Error('transient')
        },
      },
      { retryDelayMs: 0 },
    )
    await queue.enqueue({ type: 'flaky', payload: {}, maxAttempts: 3 })

    await worker.drain()

    expect(calls).toBe(2)
    expect((await queue.counts()).done).toBe(1)
  })

  it('dead-letters a job with no registered handler', async () => {
    const queue = new InMemoryJobQueue()
    const worker = new Worker(queue, {}, { retryDelayMs: 0 })
    await queue.enqueue({ type: 'unknown', payload: {}, maxAttempts: 1 })

    await worker.drain()

    expect((await queue.counts()).failed).toBe(1)
  })

  it('start()/stop() processes enqueued jobs in the background and drains on stop', async () => {
    const queue = new InMemoryJobQueue()
    const processed: number[] = []
    const worker = new Worker(
      queue,
      { t: async (job: Job) => void processed.push((job.payload as { n: number }).n) },
      { pollIntervalMs: 5 },
    )
    for (let n = 0; n < 5; n++) await queue.enqueue({ type: 't', payload: { n } })

    worker.start()
    // wait until processed (bounded poll)
    for (let i = 0; i < 100 && processed.length < 5; i++) {
      await new Promise((r) => setTimeout(r, 5))
    }
    await worker.stop()

    expect(processed.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('stop() resolves immediately while loops are idle-polling (does not wait out the interval)', async () => {
    const queue = new InMemoryJobQueue()
    // Long poll interval + concurrency 2: both loops are parked in sleep() when we stop.
    // stop() must wake them so it resolves now, not in 60s (this would otherwise hang the test).
    const worker = new Worker(queue, { t: async () => {} }, { pollIntervalMs: 60_000, concurrency: 2 })
    worker.start()
    await new Promise((r) => setTimeout(r, 20)) // let both loops reach the idle sleep
    await worker.stop() // must resolve promptly, well under the test timeout
    expect(true).toBe(true)
  })
})
