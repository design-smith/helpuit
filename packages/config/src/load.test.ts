import { describe, it, expect } from 'vitest'
import { parseConfig, ConfigError } from './load.js'

function issuesOf(yaml: string, env: Record<string, string | undefined>): string[] {
  try {
    parseConfig(yaml, env)
  } catch (error) {
    if (error instanceof ConfigError) return error.issues
    throw error
  }
  throw new Error('expected parseConfig to throw ConfigError')
}

const VALID_YAML = `
chatwoot:
  baseUrl: https://chat.example.com
  accountId: 1
  inboxId: 2
github:
  owner: acme
  repo: product
identity:
  mode: hmac
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login:
    url: https://app.example.com/login
models:
  provider: anthropic
  tiers:
    guidance: { model: claude-haiku-4-5 }
    reasoning: { model: claude-opus-4-8 }
    vision: { model: claude-opus-4-8 }
`

const VALID_ENV = {
  CHATWOOT_API_TOKEN: 'cw-token',
  GITHUB_TOKEN: 'gh-token',
  IDENTITY_HMAC_SECRET: 'hmac-secret',
  ANTHROPIC_API_KEY: 'anthropic-key',
  SANDBOX_ADMIN_USER: 'admin@example.com',
  SANDBOX_ADMIN_PASS: 'pw',
}

describe('parseConfig', () => {
  it('parses a minimal valid config, applying defaults and binding secrets', () => {
    const config = parseConfig(VALID_YAML, VALID_ENV)

    expect(config.chatwoot.accountId).toBe(1)
    expect(config.chatwoot.apiToken).toBe('cw-token')
    expect(config.github.productionBranch).toBe('main') // default
    expect(config.policy.autopublish).toBe('draft') // default
    expect(config.reproduction.sandboxAccounts.admin).toEqual({
      user: 'admin@example.com',
      pass: 'pw',
    })
    expect(config.models.providerKeys.anthropic).toBe('anthropic-key')
  })

  it('aggregates ALL missing secrets into one error, not just the first', () => {
    const issues = issuesOf(VALID_YAML, {})
    const joined = issues.join('\n')
    expect(joined).toContain('CHATWOOT_API_TOKEN')
    expect(joined).toContain('GITHUB_TOKEN')
    expect(joined).toContain('IDENTITY_HMAC_SECRET')
    expect(joined).toContain('ANTHROPIC_API_KEY')
    expect(joined).toContain('SANDBOX_ADMIN_USER')
    expect(issues.length).toBeGreaterThanOrEqual(5)
  })

  it('reports structural errors with field paths', () => {
    const bad = VALID_YAML.replace('accountId: 1', 'accountId: "not-a-number"')
    const issues = issuesOf(bad, VALID_ENV)
    expect(issues.join('\n')).toMatch(/chatwoot\.accountId/)
  })

  it('rejects invalid YAML with a clear message', () => {
    const issues = issuesOf('chatwoot: [unclosed', VALID_ENV)
    expect(issues.join('\n')).toMatch(/not valid YAML/i)
  })

  it('requires jwksUrl when identity.mode = jwt', () => {
    const yaml = VALID_YAML.replace('mode: hmac', 'mode: jwt')
    const issues = issuesOf(yaml, { ...VALID_ENV, IDENTITY_HMAC_SECRET: undefined })
    expect(issues.join('\n')).toMatch(/jwksUrl is required/)
  })

  it('requires verifyUrl + IDENTITY_VERIFY_TOKEN when identity.mode = endpoint', () => {
    const yaml = VALID_YAML.replace('mode: hmac', 'mode: endpoint')
    const issues = issuesOf(yaml, { ...VALID_ENV, IDENTITY_HMAC_SECRET: undefined })
    const joined = issues.join('\n')
    expect(joined).toMatch(/verifyUrl is required/)
    expect(joined).toContain('IDENTITY_VERIFY_TOKEN')
  })

  it('requires the key for a provider used only via a per-tier override', () => {
    const yaml = VALID_YAML.replace(
      'reasoning: { model: claude-opus-4-8 }',
      'reasoning: { provider: openai, model: gpt-5 }',
    )
    const issues = issuesOf(yaml, VALID_ENV) // VALID_ENV has no OPENAI_API_KEY
    expect(issues.join('\n')).toContain('OPENAI_API_KEY')
  })

  it('requires QUERY_ROUTES_TOKEN when query routes are configured, and validates the catalog', () => {
    const withRoutes =
      VALID_YAML +
      `
queryRoutes:
  baseUrl: https://api.example.com/helpuit
  routes:
    - name: getPlan
      path: /plan
      param: userId
      columns: [plan, status]
`
    // token missing
    expect(issuesOf(withRoutes, VALID_ENV).join('\n')).toContain('QUERY_ROUTES_TOKEN')

    // with token: parses, route present
    const config = parseConfig(withRoutes, { ...VALID_ENV, QUERY_ROUTES_TOKEN: 'qr' })
    expect(config.queryRoutes?.token).toBe('qr')
    expect(config.queryRoutes?.routes[0]?.name).toBe('getPlan')
    expect(config.queryRoutes?.routes[0]?.method).toBe('GET') // default

    // a route missing columns is a structural error
    const badRoute = withRoutes.replace('columns: [plan, status]', 'columns: []')
    expect(issuesOf(badRoute, { ...VALID_ENV, QUERY_ROUTES_TOKEN: 'qr' }).join('\n')).toMatch(
      /queryRoutes\.routes\.0\.columns/,
    )
  })

  it('lets env override policy toggles, and validates override values', () => {
    const overridden = parseConfig(VALID_YAML, {
      ...VALID_ENV,
      HELPUIT_AUTOPUBLISH: 'auto',
      HELPUIT_ALLOW_ANONYMOUS: 'true',
    })
    expect(overridden.policy.autopublish).toBe('auto')
    expect(overridden.policy.allowAnonymous).toBe(true)

    expect(issuesOf(VALID_YAML, { ...VALID_ENV, HELPUIT_PLAYWRIGHT_ENABLED: 'nope' }).join('\n')).toMatch(
      /HELPUIT_PLAYWRIGHT_ENABLED must be/,
    )
  })
})
