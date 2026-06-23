import { describe, it, expect } from 'vitest'
import { SandboxPool } from './pool.js'
import type { SandboxAccount } from './types.js'

function account(id: string, role: string): SandboxAccount {
  return { id, role, usernameSecret: `${id}_USER`, passwordSecret: `${id}_PASS` }
}

describe('SandboxPool', () => {
  it('hands out a free account immediately', async () => {
    const pool = new SandboxPool([account('a1', 'admin')])
    const lease = await pool.acquire('admin')
    expect(lease.account.id).toBe('a1')
    expect(pool.availableCount('admin')).toBe(0)
  })

  it('serializes a single-account role and hands off on release (FIFO)', async () => {
    const pool = new SandboxPool([account('a1', 'admin')])
    const first = await pool.acquire('admin')

    let secondResolved = false
    const second = pool.acquire('admin').then((l) => {
      secondResolved = true
      return l
    })

    // No free account yet — the second acquire is still pending.
    await Promise.resolve()
    expect(secondResolved).toBe(false)

    first.release()
    const secondLease = await second
    expect(secondResolved).toBe(true)
    expect(secondLease.account.id).toBe('a1')
  })

  it('allows concurrency up to the provisioned pool size', async () => {
    const pool = new SandboxPool([account('a1', 'admin'), account('a2', 'admin')])
    const l1 = await pool.acquire('admin')
    const l2 = await pool.acquire('admin')
    expect(new Set([l1.account.id, l2.account.id]).size).toBe(2)
    expect(pool.availableCount('admin')).toBe(0)
  })

  it('rejects an unknown role', async () => {
    const pool = new SandboxPool([account('a1', 'admin')])
    await expect(pool.acquire('basic')).rejects.toThrow(/no sandbox account/i)
  })

  it('release is idempotent', async () => {
    const pool = new SandboxPool([account('a1', 'admin')])
    const lease = await pool.acquire('admin')
    lease.release()
    lease.release()
    expect(pool.availableCount('admin')).toBe(1)
  })
})
