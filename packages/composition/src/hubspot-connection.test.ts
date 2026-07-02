import { describe, expect, it } from 'vitest'
import { parseConfig, type HelpuitConfig } from '@helpuit/config'
import { buildHubSpotConnection } from './compose.js'

const CONFIG = `
chatwoot: { baseUrl: https://cw.example.com, accountId: 1, inboxId: 1 }
hubspot: { senderActorId: A-42 }
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
  HUBSPOT_ACCESS_TOKEN: 'pat',
  OPENAI_COMPATIBLE_BASE_URL: 'https://llm.example.com',
  SANDBOX_ADMIN_USER: 'a',
  SANDBOX_ADMIN_PASS: 'p',
}

const withHubSpot = (overrides: Partial<HelpuitConfig> = {}): HelpuitConfig => ({ ...parseConfig(CONFIG, ENV), ...overrides })

describe('buildHubSpotConnection', () => {
  it('wires a poll-only connection with account investigation OFF (Visitor-ID is not an account id)', () => {
    const conn = buildHubSpotConnection(withHubSpot())
    expect(conn?.connectionId).toBe('hubspot')
    expect(conn?.disableAccount).toBe(true)
    expect(typeof conn?.poll).toBe('function')

    const polled = { messageId: 'm1', conversationId: 't1', content: 'export is broken', requesterId: 'V-9' }
    expect(conn!.parse(polled)).toEqual({ conversationId: 't1', content: 'export is broken' })
    expect(conn!.extractContext!(polled)).toEqual({ customAttributes: { helpuit_auth_token: 'V-9' } })
  })

  it('is absent when hubspot is not configured or toggled off', () => {
    const noBlock = parseConfig(CONFIG.replace('hubspot: { senderActorId: A-42 }', ''), ENV)
    expect(buildHubSpotConnection(noBlock)).toBeUndefined()

    const off = withHubSpot({ integrations: { ...parseConfig(CONFIG, ENV).integrations, hubspot: false } })
    expect(buildHubSpotConnection(off)).toBeUndefined()
  })
})
