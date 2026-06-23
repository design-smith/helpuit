import { describe, it, expect } from 'vitest'
import { AuditLog } from './audit.js'

describe('AuditLog', () => {
  it('records events for an investigation in order with timestamps', () => {
    let clock = 100
    const log = new AuditLog({ now: () => clock })
    log.record('inv-1', { type: 'created' })
    clock = 200
    log.record('inv-1', { type: 'guidance', data: { decision: 'resolved' } })

    const entries = log.forInvestigation('inv-1')
    expect(entries.map((e) => e.type)).toEqual(['created', 'guidance'])
    expect(entries[0]!.at).toBe(100)
    expect(entries[1]!.data).toEqual({ decision: 'resolved' })
  })

  it('isolates entries by investigation', () => {
    const log = new AuditLog({ now: () => 1 })
    log.record('inv-1', { type: 'created' })
    log.record('inv-2', { type: 'created' })
    expect(log.forInvestigation('inv-1')).toHaveLength(1)
    expect(log.forInvestigation('inv-2')).toHaveLength(1)
  })
})
