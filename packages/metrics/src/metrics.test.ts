import { describe, it, expect } from 'vitest'
import { computeMetrics } from './metrics.js'

describe('computeMetrics', () => {
  it('counts investigations in total and by classification', () => {
    const summary = computeMetrics({
      investigations: [
        { classification: 'new_bug', level: 'escalation' },
        { classification: 'new_bug', level: 'static_repro' },
        { classification: null, level: 'guidance' },
      ],
      audits: [],
    })
    expect(summary.totalInvestigations).toBe(3)
    expect(summary.byClassification.new_bug).toBe(2)
    expect(summary.byClassification.unclassified).toBe(1)
  })

  it('counts investigations by level', () => {
    const summary = computeMetrics({
      investigations: [
        { classification: null, level: 'guidance' },
        { classification: null, level: 'guidance' },
        { classification: 'account_data_issue', level: 'account' },
      ],
      audits: [],
    })
    expect(summary.byLevel.guidance).toBe(2)
    expect(summary.byLevel.account).toBe(1)
  })

  it('counts known-issue short-circuits from the audit log', () => {
    const summary = computeMetrics({
      investigations: [],
      audits: [{ type: 'created' }, { type: 'known_issue' }, { type: 'known_issue' }],
    })
    expect(summary.knownIssueShortCircuits).toBe(2)
  })
})
