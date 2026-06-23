import { describe, it, expect } from 'vitest'
import { assessGuidance, detectPushback } from './assess.js'

describe('assessGuidance', () => {
  const opts = { threshold: 0.7 }

  it('resolves when grounded and confident', () => {
    expect(assessGuidance({ confidence: 0.9, hasSources: true }, opts).decision).toBe('resolved')
  })

  it('escalates when confidence is below threshold', () => {
    expect(assessGuidance({ confidence: 0.4, hasSources: true }, opts).decision).toBe('escalate')
  })

  it('escalates when there is no grounding, even if confident', () => {
    expect(assessGuidance({ confidence: 0.99, hasSources: false }, opts).decision).toBe('escalate')
  })
})

describe('detectPushback', () => {
  it('detects "still broken" style pushback', () => {
    expect(detectPushback('it still does not work')).toBe(true)
    expect(detectPushback("that didn't work, same error")).toBe(true)
  })

  it('does not flag a neutral first message', () => {
    expect(detectPushback('how do I invite a teammate?')).toBe(false)
  })
})
