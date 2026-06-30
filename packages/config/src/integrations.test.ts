import { describe, it, expect } from 'vitest'
import { parseConfig, resolveEffectiveConfig } from './load.js'

// A minimal valid structural config (secrets bound from env).
const YAML = `
chatwoot: { baseUrl: https://chat.example.com, accountId: 1, inboxId: 1 }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { url: https://app.example.com/login }
models:
  provider: anthropic
  tiers:
    guidance: { model: m }
    reasoning: { model: m }
    vision: { model: m }
`
const ENV = {
  CHATWOOT_API_TOKEN: 'cw',
  GITHUB_TOKEN: 'gh',
  IDENTITY_HMAC_SECRET: 'hmac',
  ANTHROPIC_API_KEY: 'an',
  SANDBOX_ADMIN_USER: 'a@x.com',
  SANDBOX_ADMIN_PASS: 'pw',
}

describe('integrations enable-map', () => {
  it('defaults every integration ON when the section is absent (back-compat)', () => {
    const config = parseConfig(YAML, ENV)
    expect(config.integrations).toEqual({ github: true, chatwoot: true, identity: true, llm: true })
  })

  it('honors a partial override, leaving the rest ON', () => {
    const config = resolveEffectiveConfig({
      baselineYaml: YAML,
      env: ENV,
      structural: { integrations: { github: false } },
    }).config
    expect(config.integrations).toEqual({ github: false, chatwoot: true, identity: true, llm: true })
  })
})
