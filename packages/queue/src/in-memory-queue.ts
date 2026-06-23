import { randomUUID } from 'node:crypto'
import type { EnqueueOptions, Job, JobQueue, JobStatus } from './types.js'

const DEFAULT_MAX_ATTEMPTS = 3

/**
 * In-memory `JobQueue` for dev and tests — a real, working implementation (not a
 * mock), mirroring `DrizzleJobQueue`'s semantics so the `Worker` can be exercised
 * without a database. Single-process only; jobs are lost on restart.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, Job>()

  async enqueue<P>(options: EnqueueOptions<P>, now: number = Date.now()): Promise<string> {
    const id = randomUUID()
    this.jobs.set(id, {
      id,
      type: options.type,
      payload: options.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      runAfter: options.runAfter ?? now,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async claim(now: number): Promise<Job | null> {
    const runnable = [...this.jobs.values()]
      .filter((j) => j.status === 'pending' && j.runAfter <= now)
      .sort((a, b) => a.createdAt - b.createdAt)
    const job = runnable[0]
    if (job === undefined) return null
    job.status = 'active'
    job.attempts += 1
    job.updatedAt = now
    return { ...job }
  }

  async complete(id: string, now: number): Promise<void> {
    const job = this.jobs.get(id)
    if (job === undefined) return
    job.status = 'done'
    job.updatedAt = now
  }

  async fail(id: string, error: string, options: { now: number; retryDelayMs: number }): Promise<void> {
    const job = this.jobs.get(id)
    if (job === undefined) return
    job.lastError = error
    job.updatedAt = options.now
    if (job.attempts >= job.maxAttempts) {
      job.status = 'failed' // dead-letter
    } else {
      job.status = 'pending'
      job.runAfter = options.now + options.retryDelayMs
    }
  }

  async counts(): Promise<Record<JobStatus, number>> {
    const counts: Record<JobStatus, number> = { pending: 0, active: 0, done: 0, failed: 0 }
    for (const job of this.jobs.values()) counts[job.status] += 1
    return counts
  }
}
