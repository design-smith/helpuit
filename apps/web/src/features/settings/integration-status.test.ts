import { describe, it, expect } from 'vitest'
import type { EffectiveConfigView } from '../../lib/api'
import { integrationStatuses } from './integration-status'

const view: EffectiveConfigView = {
  config: {
    integrations: { github: true, chatwoot: false, identity: true, llm: true },
    github: { owner: 'acme', repo: 'product' },
    chatwoot: { baseUrl: 'https://chat.acme.com', accountId: 3, inboxId: 2 },
    identity: { mode: 'jwt', useridClaim: 'sub' },
    models: { provider: 'anthropic', tiers: { guidance: { model: 'claude' } } },
  },
  secrets: [
    { key: 'GITHUB_TOKEN', set: true, required: true, source: 'vault' },
    { key: 'CHATWOOT_API_TOKEN', set: true, required: true, source: 'env' },
    { key: 'ANTHROPIC_API_KEY', set: true, required: true, source: 'vault' },
  ],
  structuralIssues: ['identity.jwksUrl is required when identity.mode = jwt'],
  restart: { pending: false, reasons: [], setAt: null },
  editableSections: [],
}

describe('integrationStatuses', () => {
  const byId = Object.fromEntries(integrationStatuses(view).map((s) => [s.id, s]))

  it('reports GitHub connected + enabled with account and repo access', () => {
    expect(byId.github).toMatchObject({ connected: true, enabled: true, account: 'acme', access: 'acme/product' })
    expect(byId.github!.issue).toBeUndefined()
  })

  it('reflects a connected-but-disabled integration (Chatwoot off)', () => {
    expect(byId.chatwoot).toMatchObject({ connected: true, enabled: false, account: 'https://chat.acme.com' })
    expect(byId.chatwoot!.access).toBe('account #3 · inbox #2')
  })

  it('surfaces a structural issue and marks the integration not-connected (jwt missing jwksUrl)', () => {
    expect(byId.identity!.connected).toBe(false)
    expect(byId.identity!.issue).toContain('jwksUrl')
    expect(byId.identity!.account).toBe('jwt')
  })

  it('maps the LLM provider to its credential and model', () => {
    expect(byId.llm).toMatchObject({ connected: true, enabled: true, account: 'anthropic', access: 'claude' })
  })

  it('defaults enabled to true when the integrations map is absent (back-compat)', () => {
    const [gh] = integrationStatuses({ ...view, config: { ...view.config, integrations: undefined } })
    expect(gh!.enabled).toBe(true)
  })
})
