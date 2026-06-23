import { describe, it, expect } from 'vitest'
import type { AuditEntry } from './audit.js'
import { PersistingAuditLog } from './persisting-audit-log.js'

describe('PersistingAuditLog', () => {
  it('records in-memory AND forwards the exact entry to the sink once', () => {
    const forwarded: AuditEntry[] = []
    const log = new PersistingAuditLog({ record: (e) => forwarded.push(e) }, { now: () => 1234 })

    const entry = log.record('inv-1', { type: 'guidance', data: { decision: 'resolved' } })

    // in-memory base still works
    expect(log.forInvestigation('inv-1')).toEqual([entry])
    // sink got the same entry exactly once, with the base's timestamp
    expect(forwarded).toHaveLength(1)
    expect(forwarded[0]).toEqual({
      investigationId: 'inv-1',
      type: 'guidance',
      data: { decision: 'resolved' },
      at: 1234,
    })
  })
})
