export type JobStatus = 'pending' | 'active' | 'done' | 'failed'

/** A unit of deferred work. `failed` is the terminal dead-letter state. */
export interface Job<P = unknown> {
  id: string
  type: string
  payload: P
  status: JobStatus
  /** How many times this job has been claimed (attempted). */
  attempts: number
  /** Claims beyond this dead-letter the job. */
  maxAttempts: number
  /** Earliest time (ms epoch) the job may be claimed — used for retry backoff. */
  runAfter: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface EnqueueOptions<P = unknown> {
  type: string
  payload: P
  /** Default 3. */
  maxAttempts?: number
  /** Earliest run time (ms epoch); default = now. */
  runAfter?: number
}

/**
 * A durable-ish job queue. Implementations: `InMemoryJobQueue` (dev/tests) and
 * `DrizzleJobQueue` (persistent, survives restarts). `claim` MUST be atomic — two
 * concurrent claimers never get the same job.
 */
export interface JobQueue {
  enqueue<P>(options: EnqueueOptions<P>, now?: number): Promise<string>
  /** Claim the oldest runnable pending job (status→active, attempts++), or null. */
  claim(now: number): Promise<Job | null>
  complete(id: string, now: number): Promise<void>
  /** Reschedule with backoff if attempts remain, else dead-letter (status→failed). */
  fail(id: string, error: string, options: { now: number; retryDelayMs: number }): Promise<void>
  counts(): Promise<Record<JobStatus, number>>
}
