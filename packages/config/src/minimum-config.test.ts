import { describe, it, expect } from 'vitest'
import { resolveEffectiveConfig } from './load.js'
import { MINIMUM_CONFIG } from './minimum-config.js'

// The documented minimal baseline (provider anthropic + hmac identity); structural
// values come from the console connectors, secrets from MINIMUM_CONFIG.
const MINIMAL_BASELINE = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 1 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m }, reasoning: { model: m }, vision: { model: m } }
`

describe('MINIMUM_CONFIG', () => {
  it('lists only secrets that are genuinely required by the config resolver', () => {
    const { missingSecrets } = resolveEffectiveConfig({ baselineYaml: MINIMAL_BASELINE, env: {} })
    for (const { env } of MINIMUM_CONFIG) {
      expect(missingSecrets).toContain(env) // no doc fiction — each is really required
    }
  })

  it('providing exactly these secrets satisfies each of them', () => {
    const env = Object.fromEntries(MINIMUM_CONFIG.map((c) => [c.env, 'value']))
    const { missingSecrets } = resolveEffectiveConfig({ baselineYaml: MINIMAL_BASELINE, env })
    for (const { env: key } of MINIMUM_CONFIG) {
      expect(missingSecrets).not.toContain(key)
    }
  })

  it('every item explains what it unlocks', () => {
    for (const item of MINIMUM_CONFIG) expect(item.purpose.trim().length).toBeGreaterThan(0)
  })
})
