import { describe, it, expect } from 'vitest'
import { resolveEffectiveConfig, maskConfig, type Env } from './load.js'

const BASE_YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 2 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [basic]
  login: { mode: form, url: https://app.example.com/login }
models:
  provider: anthropic
  tiers: { guidance: { model: m1 }, reasoning: { model: m2 }, vision: { model: m3 } }
policy: { allowAnonymous: false }
budget: { perDay: 1000 }
`

const fullEnv: Env = {
  CHATWOOT_API_TOKEN: 'cwtok-DISTINCT',
  GITHUB_TOKEN: 'ghtok-DISTINCT',
  IDENTITY_HMAC_SECRET: 'hmac-DISTINCT',
  ANTHROPIC_API_KEY: 'sk-real-DISTINCT',
  SANDBOX_BASIC_USER: 'u',
  SANDBOX_BASIC_PASS: 'sbpass-DISTINCT',
}

describe('resolveEffectiveConfig', () => {
  it('boots leniently with unset secrets and reports them', () => {
    const { config, missingSecrets } = resolveEffectiveConfig({ baselineYaml: BASE_YAML, env: {} })
    expect(config.policy.allowAnonymous).toBe(false)
    // every required secret is reported as missing, not thrown
    expect(missingSecrets).toContain('CHATWOOT_API_TOKEN')
    expect(missingSecrets).toContain('GITHUB_TOKEN')
    expect(missingSecrets).toContain('IDENTITY_HMAC_SECRET')
    expect(missingSecrets).toContain('ANTHROPIC_API_KEY')
    expect(missingSecrets).toContain('SANDBOX_BASIC_USER')
  })

  it('overlays DB secrets over env and clears missing', () => {
    const { config, missingSecrets } = resolveEffectiveConfig({
      baselineYaml: BASE_YAML,
      env: {},
      secrets: fullEnv as Record<string, string>,
    })
    expect(missingSecrets).toEqual([])
    expect(config.github.token).toBe('ghtok-DISTINCT')
    expect(config.models.providerKeys.anthropic).toBe('sk-real-DISTINCT')
  })

  it('applies structural overrides (DB wins over file) live', () => {
    const { config } = resolveEffectiveConfig({
      baselineYaml: BASE_YAML,
      env: fullEnv,
      structural: { policy: { allowAnonymous: true }, budget: { perDay: 7777 } },
    })
    expect(config.policy.allowAnonymous).toBe(true)
    expect(config.budget.perDay).toBe(7777)
    expect(config.chatwoot.baseUrl).toBe('https://chat.example.com') // untouched section preserved
  })

  it('surfaces the public docs.dropboxAppKey unmasked (browser needs it for the Chooser)', () => {
    const yaml = `${BASE_YAML}\ndocs: { dropboxAppKey: dbx-public-123 }\n`
    const { config } = resolveEffectiveConfig({ baselineYaml: yaml, env: fullEnv })
    expect(config.docs.dropboxAppKey).toBe('dbx-public-123')
    const masked = maskConfig(config) as Record<string, any>
    expect(masked.docs.dropboxAppKey).toBe('dbx-public-123') // public client key — never masked
  })

  it('surfaces the public Google Picker keys unmasked (browser needs them)', () => {
    const yaml = `${BASE_YAML}\ndocs: { googleApiKey: gapi-public-1, googleClientId: client-123.apps.googleusercontent.com }\n`
    const { config } = resolveEffectiveConfig({ baselineYaml: yaml, env: fullEnv })
    expect(config.docs.googleApiKey).toBe('gapi-public-1')
    expect(config.docs.googleClientId).toBe('client-123.apps.googleusercontent.com')
    const masked = maskConfig(config) as Record<string, any>
    expect(masked.docs.googleApiKey).toBe('gapi-public-1') // public client keys — never masked
    expect(masked.docs.googleClientId).toBe('client-123.apps.googleusercontent.com')
  })

  it('surfaces the public Microsoft (OneDrive/SharePoint) client id unmasked', () => {
    const yaml = `${BASE_YAML}\ndocs: { microsoftClientId: ms-app-abc123 }\n`
    const { config } = resolveEffectiveConfig({ baselineYaml: yaml, env: fullEnv })
    expect(config.docs.microsoftClientId).toBe('ms-app-abc123')
    const masked = maskConfig(config) as Record<string, any>
    expect(masked.docs.microsoftClientId).toBe('ms-app-abc123') // public app id — never masked
  })

  it('masks every secret-bearing field', () => {
    const { config } = resolveEffectiveConfig({ baselineYaml: BASE_YAML, env: fullEnv })
    const masked = maskConfig(config) as Record<string, any>
    expect(masked.github.token).toBe('••••')
    expect(masked.models.providerKeys.anthropic).toBe('••••')
    expect(masked.chatwoot.apiToken).toBe('••••')
    // the raw secret never appears anywhere in the masked output
    expect(JSON.stringify(masked)).not.toContain('DISTINCT')
    // non-secret structure stays visible
    expect(masked.models.provider).toBe('anthropic')
    expect(masked.policy.allowAnonymous).toBe(false)
  })
})
