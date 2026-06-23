import { describe, it, expect } from 'vitest'
import { canReproduce, planWithinCaps, isIrreversibleFeature } from './policy.js'

const caps = { maxSteps: 10, maxRetries: 2 }
const config = { playwrightEnabled: true, environment: 'production', caps }

describe('canReproduce', () => {
  it('blocks reproduction when the founder has disabled Playwright', () => {
    const gate = canReproduce({ ...config, playwrightEnabled: false }, { name: 'Billing' })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toMatch(/disabled/i)
  })

  it('blocks reproduction of irreversible-side-effect features (escalate instead)', () => {
    const gate = canReproduce(config, { name: 'Delete account', endpoints: ['DELETE /api/account'] })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toMatch(/irreversible/i)
  })

  it('allows reproduction of a normal feature when Playwright is enabled', () => {
    expect(canReproduce(config, { name: 'Billing', routes: ['/settings/billing'] }).allowed).toBe(
      true,
    )
  })

  it('honors an explicit irreversible marker', () => {
    expect(isIrreversibleFeature({ name: 'Export', irreversible: true })).toBe(true)
  })
})

describe('planWithinCaps', () => {
  it('rejects a plan that exceeds the step cap', () => {
    expect(planWithinCaps({ steps: new Array(11).fill({}) }, caps)).toBe(false)
  })
})
