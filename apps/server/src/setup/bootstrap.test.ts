import { describe, it, expect } from 'vitest'
import { planBootstrapEnv, type Generators } from './bootstrap.js'

// Deterministic generators so the plan is assertable (the real ones use crypto).
const gens: Generators = {
  encryptionKey: () => 'Z'.repeat(64),
  adminToken: () => 'a'.repeat(48),
}

describe('planBootstrapEnv — reachability strategy', () => {
  it('tunnel mode persists HELPUIT_TUNNEL=1 and leaves HELPUIT_PUBLIC_URL unset', () => {
    const plan = planBootstrapEnv({}, { useTunnel: true }, gens)
    expect(plan.env.HELPUIT_TUNNEL).toBe('1')
    expect(plan.env.HELPUIT_PUBLIC_URL).toBeUndefined()
  })

  it('domain mode sets HELPUIT_PUBLIC_URL and does not enable the tunnel', () => {
    const plan = planBootstrapEnv({}, { publicUrl: 'https://helpuit.example.com' }, gens)
    expect(plan.env.HELPUIT_PUBLIC_URL).toBe('https://helpuit.example.com')
    expect(plan.env.HELPUIT_TUNNEL).toBeUndefined()
  })

  it('tunnel choice wins over any typed public URL', () => {
    const plan = planBootstrapEnv({}, { useTunnel: true, publicUrl: 'https://ignored.example.com' }, gens)
    expect(plan.env.HELPUIT_TUNNEL).toBe('1')
    expect(plan.env.HELPUIT_PUBLIC_URL).toBeUndefined()
  })
})
