import { describe, it, expect, afterEach } from 'vitest'
import { createDb, type DbHandle } from './client.js'
import { DrizzleAuditRepository } from './audit-repository.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

async function repo() {
  handle = await createDb(':memory:')
  return new DrizzleAuditRepository(handle.db)
}

describe('DrizzleAuditRepository', () => {
  it('reads entries back in insertion order even when timestamps collide', async () => {
    const r = await repo()
    // three entries in the SAME millisecond — ordering must fall back to id
    await r.record({ investigationId: 'inv-1', type: 'created', at: 1000 })
    await r.record({ investigationId: 'inv-1', type: 'guidance', data: { decision: 'escalate' }, at: 1000 })
    await r.record({ investigationId: 'inv-1', type: 'escalated', at: 1000 })

    const trail = await r.forInvestigation('inv-1')
    expect(trail.map((e) => e.type)).toEqual(['created', 'guidance', 'escalated'])
    expect(trail[1]!.data).toEqual({ decision: 'escalate' })
  })

  it('scopes by investigation and counts', async () => {
    const r = await repo()
    await r.record({ investigationId: 'inv-1', type: 'created', at: 1 })
    await r.record({ investigationId: 'inv-2', type: 'created', at: 2 })
    await r.record({ investigationId: 'inv-1', type: 'guided', at: 3 })

    expect((await r.forInvestigation('inv-1')).map((e) => e.type)).toEqual(['created', 'guided'])
    expect(await r.countForInvestigation('inv-1')).toBe(2)
    expect(await r.countForInvestigation('inv-2')).toBe(1)
  })
})
