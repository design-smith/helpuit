import { describe, expect, it } from 'vitest'
import { parseConfig, type HelpuitConfig } from '@helpuit/config'
import { buildFreshdeskConnection } from './compose.js'

const CONFIG = `
chatwoot: { baseUrl: https://cw.example.com, accountId: 1, inboxId: 1 }
freshdesk: { domain: acme }
github: { owner: o, repo: r }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { url: https://app.example.com/login }
models:
  provider: openai-compatible
  tiers:
    guidance: { model: local }
    reasoning: { model: local }
    vision: { model: local }
`
const ENV = {
  CHATWOOT_API_TOKEN: 'cw',
  GITHUB_TOKEN: 'gh',
  IDENTITY_HMAC_SECRET: 's',
  FRESHDESK_API_KEY: 'fk',
  OPENAI_COMPATIBLE_BASE_URL: 'https://llm.example.com',
  SANDBOX_ADMIN_USER: 'a',
  SANDBOX_ADMIN_PASS: 'p',
}

const withFreshdesk = (overrides: Partial<HelpuitConfig> = {}): HelpuitConfig => ({ ...parseConfig(CONFIG, ENV), ...overrides })

describe('buildFreshdeskConnection', () => {
  it('wires a freshdesk connection: normalizes polled messages and lifts the requester into the auth context', () => {
    const conn = buildFreshdeskConnection(withFreshdesk())
    expect(conn?.connectionId).toBe('freshdesk')

    const polled = { messageId: '7:c9', conversationId: '7', content: 'export is broken', requesterId: '55' }
    expect(conn!.parse(polled)).toEqual({ conversationId: '7', content: 'export is broken' })
    expect(conn!.extractContext!(polled)).toEqual({ customAttributes: { helpuit_auth_token: '55' } })

    // Empty content isn't actionable → parse returns null.
    expect(conn!.parse({ conversationId: '7', content: '' })).toBeNull()
  })

  it('is absent when freshdesk is not configured or toggled off', () => {
    const noBlock = parseConfig(CONFIG.replace('freshdesk: { domain: acme }', ''), ENV)
    expect(buildFreshdeskConnection(noBlock)).toBeUndefined()

    const off = withFreshdesk({ integrations: { ...parseConfig(CONFIG, ENV).integrations, freshdesk: false } })
    expect(buildFreshdeskConnection(off)).toBeUndefined()
  })
})
