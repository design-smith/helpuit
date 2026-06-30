import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm'
import type { EnqueueOptions, Job, JobQueue, JobStatus } from '@helpuit/queue'
import { normalizeListOptions, type ListOptions, type Page } from '@helpuit/contracts'
import type { Db } from './client.js'
import { jobs } from './schema.js'

/** Filters for the operator-console job list. */
export interface JobListFilter {
  status?: JobStatus
  type?: string
}

/** A job as the console lists it — payload omitted (can hold raw webhook content). */
export type JobSummary = Omit<Job, 'payload'>

const DEFAULT_MAX_ATTEMPTS = 3
const MAX_CLAIM_RETRIES = 10

type Row = typeof jobs.$inferSelect

function toJob(row: Row): Job {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status as JobStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Persistent `JobQueue` on the Helpuit database — jobs survive restarts.
 * `claim` is atomic via a conditional `UPDATE ... WHERE id=? AND status='pending'`:
 * a candidate is picked, then claimed only if still pending, so two concurrent
 * claimers can never win the same job (the loser retries the next candidate).
 */
export class DrizzleJobQueue implements JobQueue {
  constructor(private readonly db: Db) {}

  async enqueue<P>(options: EnqueueOptions<P>, now: number = Date.now()): Promise<string> {
    const id = randomUUID()
    await this.db.insert(jobs).values({
      id,
      type: options.type,
      payload: JSON.stringify(options.payload),
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

  /** Read one job by id, including its payload (for the console's per-job log view). */
  async get(id: string): Promise<Job | null> {
    const rows = await this.db.select().from(jobs).where(eq(jobs.id, id))
    return rows[0] !== undefined ? toJob(rows[0]) : null
  }

  async claim(now: number): Promise<Job | null> {
    for (let i = 0; i < MAX_CLAIM_RETRIES; i++) {
      const candidates = await this.db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, 'pending'), lte(jobs.runAfter, now)))
        .orderBy(asc(jobs.createdAt))
        .limit(1)
      const candidate = candidates[0]
      if (candidate === undefined) return null

      // Claim only if still pending — guards against a concurrent claimer.
      const claimed = await this.db
        .update(jobs)
        .set({ status: 'active', attempts: candidate.attempts + 1, updatedAt: now })
        .where(and(eq(jobs.id, candidate.id), eq(jobs.status, 'pending')))
        .returning()
      if (claimed.length > 0) return toJob(claimed[0]!)
      // lost the race — try the next candidate
    }
    return null
  }

  async complete(id: string, now: number): Promise<void> {
    await this.db.update(jobs).set({ status: 'done', updatedAt: now }).where(eq(jobs.id, id))
  }

  async fail(id: string, error: string, options: { now: number; retryDelayMs: number }): Promise<void> {
    const rows = await this.db.select().from(jobs).where(eq(jobs.id, id))
    const row = rows[0]
    if (row === undefined) return
    if (row.attempts >= row.maxAttempts) {
      await this.db
        .update(jobs)
        .set({ status: 'failed', lastError: error, updatedAt: options.now })
        .where(eq(jobs.id, id))
    } else {
      await this.db
        .update(jobs)
        .set({
          status: 'pending',
          lastError: error,
          runAfter: options.now + options.retryDelayMs,
          updatedAt: options.now,
        })
        .where(eq(jobs.id, id))
    }
  }

  async counts(): Promise<Record<JobStatus, number>> {
    const rows = await this.db
      .select({ status: jobs.status, n: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.status)
    const counts: Record<JobStatus, number> = { pending: 0, active: 0, done: 0, failed: 0 }
    for (const row of rows) counts[row.status as JobStatus] = Number(row.n)
    return counts
  }

  /**
   * Paginated job list for the operator console (newest activity first). The
   * `payload` is deliberately omitted — it can hold raw webhook content.
   */
  async listJobs(filter: JobListFilter = {}, options: ListOptions = {}): Promise<Page<JobSummary>> {
    const { limit, offset } = normalizeListOptions(options)
    const conditions: SQL[] = []
    if (filter.status !== undefined) conditions.push(eq(jobs.status, filter.status))
    if (filter.type !== undefined) conditions.push(eq(jobs.type, filter.type))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await this.db
      .select({
        id: jobs.id,
        type: jobs.type,
        status: jobs.status,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        runAfter: jobs.runAfter,
        lastError: jobs.lastError,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(where)
      .orderBy(desc(jobs.updatedAt))
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db.select({ n: sql<number>`count(*)` }).from(jobs).where(where)
    return {
      items: rows.map((r) => ({ ...r, status: r.status as JobStatus })),
      total: Number(totalRows[0]?.n ?? 0),
    }
  }

  /**
   * Requeue a dead-lettered (failed) job for another run — resets attempts and
   * makes it immediately claimable. Conditional on `status='failed'` so it can't
   * disturb a running/pending job; returns false if it wasn't failed / not found.
   */
  async retry(id: string, now: number = Date.now()): Promise<boolean> {
    const updated = await this.db
      .update(jobs)
      .set({ status: 'pending', attempts: 0, runAfter: now, lastError: null, updatedAt: now })
      .where(and(eq(jobs.id, id), eq(jobs.status, 'failed')))
      .returning({ id: jobs.id })
    return updated.length > 0
  }

  /** Delete all jobs in a terminal state (done/failed) to clear the queue. Returns the count removed. */
  async purge(status: 'done' | 'failed'): Promise<number> {
    const removed = await this.db.delete(jobs).where(eq(jobs.status, status)).returning({ id: jobs.id })
    return removed.length
  }
}
