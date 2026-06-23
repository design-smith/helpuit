import type { Job, JobQueue } from './types.js'

export type JobHandler<P = unknown> = (job: Job<P>) => Promise<void>

export interface WorkerOptions {
  /** Parallel claim loops in `start()` (default 1). */
  concurrency?: number
  /** Sleep between empty polls in `start()` (default 250ms). */
  pollIntervalMs?: number
  /** Backoff before a failed job becomes claimable again (default 5000ms). */
  retryDelayMs?: number
  now?: () => number
}

/**
 * Drains a {@link JobQueue}, dispatching each job to its registered handler.
 * Success → `complete`; a throw (or missing handler) → `fail`, which the queue
 * retries with backoff or dead-letters. `drain()` is deterministic (process
 * until nothing is currently claimable) for tests; `start()/stop()` runs
 * background loops and drains in-flight work on stop.
 */
export class Worker {
  private readonly concurrency: number
  private readonly pollIntervalMs: number
  private readonly retryDelayMs: number
  private readonly now: () => number
  private running = false
  private loops: Promise<void>[] = []

  constructor(
    private readonly queue: JobQueue,
    private readonly handlers: Record<string, JobHandler>,
    options: WorkerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 1
    this.pollIntervalMs = options.pollIntervalMs ?? 250
    this.retryDelayMs = options.retryDelayMs ?? 5000
    this.now = options.now ?? (() => Date.now())
  }

  /** Claim and process a single job. Returns false when nothing is claimable. */
  async processOne(): Promise<boolean> {
    const job = await this.queue.claim(this.now())
    if (job === null) return false

    const handler = this.handlers[job.type]
    try {
      if (handler === undefined) throw new Error(`No handler registered for job type "${job.type}"`)
      await handler(job)
      await this.queue.complete(job.id, this.now())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.queue.fail(job.id, message, { now: this.now(), retryDelayMs: this.retryDelayMs })
    }
    return true
  }

  /** Process every currently-claimable job (including same-tick retries). */
  async drain(): Promise<void> {
    while (await this.processOne()) {
      // keep going until the queue has nothing runnable right now
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    for (let i = 0; i < this.concurrency; i++) this.loops.push(this.loop())
  }

  async stop(): Promise<void> {
    this.running = false
    await Promise.all(this.loops)
    this.loops = []
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const processed = await this.processOne()
      if (!processed) await this.sleep(this.pollIntervalMs)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      timer.unref?.()
    })
  }
}
