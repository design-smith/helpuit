import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseConfig, type HelpuitConfig } from '@helpuit/config'
import { buildZendeskConnection } from './compose.js'

const CONFIG = `
chatwoot: { baseUrl: https://cw.example.com, accountId: 1, inboxId: 1 }
zendesk: { subdomain: acme, email: me@x.com }
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
  ZENDESK_API_TOKEN: 'tok',
  ZENDESK_WEBHOOK_SECRET: 'wh-secret',
  OPENAI_COMPATIBLE_BASE_URL: 'https://llm.example.com',
  SANDBOX_ADMIN_USER: 'a',
  SANDBOX_ADMIN_PASS: 'p',
}

const withZendesk = (overrides: Partial<HelpuitConfig> = {}): HelpuitConfig => ({ ...parseConfig(CONFIG, ENV), ...overrides })

describe('buildZendeskConnection', () => {
  it('parses public end-user comments, lifts the requester, and verifies the webhook signature', () => {
    const conn = buildZendeskConnection(withZendesk())
    expect(conn?.connectionId).toBe('zendesk')

    const payload = { ticket_id: 123, comment: 'export broken', is_public: true, author_role: 'end-user', requester_external_id: 'user-1', requester_email: 'u@x.com' }
    expect(conn!.parse(payload)).toEqual({ conversationId: '123', content: 'export broken' })
    expect(conn!.extractContext!(payload)).toEqual({ customAttributes: { helpuit_auth_token: 'user-1' } })

    const raw = JSON.stringify(payload)
    const ts = '2026-07-02T10:00:00Z'
    const sig = createHmac('sha256', 'wh-secret').update(ts + raw).digest('base64')
    const headers = { 'x-zendesk-webhook-signature': sig, 'x-zendesk-webhook-signature-timestamp': ts }
    expect(conn!.verify!(raw, headers)).toBe(true)
    expect(conn!.verify!(raw, { ...headers, 'x-zendesk-webhook-signature': 'bad' })).toBe(false)
  })

  it('is absent when zendesk is not configured or toggled off', () => {
    const noBlock = parseConfig(CONFIG.replace('zendesk: { subdomain: acme, email: me@x.com }', ''), ENV)
    expect(buildZendeskConnection(noBlock)).toBeUndefined()

    const off = withZendesk({ integrations: { ...parseConfig(CONFIG, ENV).integrations, zendesk: false } })
    expect(buildZendeskConnection(off)).toBeUndefined()
  })
})
