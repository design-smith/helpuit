import { describe, it, expect } from 'vitest'
import { loadConfig } from './load.js'

// The shipped example must actually validate against the real loader, reading the
// real file from disk (vitest runs from the repo root). This guards against the
// example drifting out of sync with the schema.
const COMPLETE_ENV = {
  CHATWOOT_API_TOKEN: 'cw',
  GITHUB_TOKEN: 'gh',
  IDENTITY_HMAC_SECRET: 'hmac',
  QUERY_ROUTES_TOKEN: 'qr',
  ANTHROPIC_API_KEY: 'an',
  SANDBOX_ADMIN_USER: 'admin@example.com',
  SANDBOX_ADMIN_PASS: 'pw1',
  SANDBOX_BASIC_USER: 'basic@example.com',
  SANDBOX_BASIC_PASS: 'pw2',
}

describe('helpuit.config.example.yaml', () => {
  it('loads and validates with a complete environment', () => {
    const config = loadConfig({ path: 'helpuit.config.example.yaml', env: COMPLETE_ENV })

    expect(config.github.owner).toBe('your-org')
    expect(config.queryRoutes?.routes).toHaveLength(3)
    expect(Object.keys(config.reproduction.sandboxAccounts).sort()).toEqual(['admin', 'basic'])
    expect(config.features.find((f) => f.key === 'billing')?.irreversible).toBe(true)
    expect(config.models.providerKeys.anthropic).toBe('an')
  })
})
