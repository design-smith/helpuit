import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleJobQueue } from './job-queue.js'
import { DrizzleAlertHistory } from './alert-history-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

describe('job retry + purge', () => {
  it('retries a dead-lettered job (resets to pending) and refuses non-failed ones', async () => {
    handle = await createDb(':memory:')
    const q = new DrizzleJobQueue(handle.db)
    const id = await q.enqueue({ type: 'investigation', payload: {}, maxAttempts: 1 }, 1000)
    // claim then fail → dead-letter (attempts 1 >= maxAttempts 1)
    await q.claim(1000)
    await q.fail(id, 'boom', { now: 1000, retryDelayMs: 0 })
    expect((await q.counts()).failed).toBe(1)

    expect(await q.retry(id, 2000)).toBe(true)
    const counts = await q.counts()
    expect(counts.failed).toBe(0)
    expect(counts.pending).toBe(1)
    // a job that isn't failed can't be retried
    expect(await q.retry(id, 3000)).toBe(false)
  })

  it('purges terminal jobs by status', async () => {
    handle = await createDb(':memory:')
    const q = new DrizzleJobQueue(handle.db)
    const a = await q.enqueue({ type: 't', payload: {} }, 1)
    await q.claim(1)
    await q.complete(a, 1)
    const b = await q.enqueue({ type: 't', payload: {}, maxAttempts: 1 }, 1)
    await q.claim(1)
    await q.fail(b, 'x', { now: 1, retryDelayMs: 0 })

    expect(await q.purge('done')).toBe(1)
    expect(await q.purge('failed')).toBe(1)
    expect((await q.counts()).done).toBe(0)
  })
})

describe('alert history', () => {
  it('records fired alerts and returns them newest-first', async () => {
    handle = await createDb(':memory:')
    let t = 100
    const hist = new DrizzleAlertHistory(handle.db, () => t)
    await hist.record({ kind: 'budget', severity: 'warn', message: 'spend 80%' })
    t = 200
    await hist.record({ kind: 'escalation_spike', severity: 'critical', message: '30 escalations' })

    const recent = await hist.recent()
    expect(recent.map((a) => a.kind)).toEqual(['escalation_spike', 'budget'])
    expect(recent[0]!.severity).toBe('critical')
  })
})
