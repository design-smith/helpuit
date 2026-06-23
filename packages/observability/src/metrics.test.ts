import { describe, it, expect } from 'vitest'
import { createMetrics } from './metrics.js'

describe('createMetrics', () => {
  it('counts outcomes by label and renders Prometheus exposition text', async () => {
    const metrics = createMetrics()
    metrics.recordOutcome('guided')
    metrics.recordOutcome('guided')
    metrics.recordOutcome('escalated')

    const text = await metrics.text()

    expect(text).toContain('helpuit_outcomes_total{outcome="guided"} 2')
    expect(text).toContain('helpuit_outcomes_total{outcome="escalated"} 1')
  })
})
