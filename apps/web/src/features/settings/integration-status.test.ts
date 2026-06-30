import { describe, it, expect } from 'vitest'
import type { EffectiveConfigView } from '../../lib/api'
import { integrationStatuses, availableLlmProviders } from './integration-status'

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

  it('does NOT include identity — it is configured in setup / Configuration, not as a Connections card', () => {
    expect(byId.identity).toBeUndefined()
    expect(integrationStatuses(view).map((s) => s.id)).toEqual(['github', 'chatwoot', 'llm'])
  })

  it('maps the LLM provider to its credential and model', () => {
    expect(byId.llm).toMatchObject({ connected: true, enabled: true, account: 'anthropic', access: 'claude' })
  })

  it('treats GitHub as connected only once a repo is selected (app key set but no repo → not connected)', () => {
    const noRepo: EffectiveConfigView = {
      ...view,
      config: { ...view.config, github: { owner: 'acme' } }, // installed, repo not yet picked
      secrets: [{ key: 'GITHUB_APP_PRIVATE_KEY', set: true, required: true, source: 'vault' }],
    }
    const gh = integrationStatuses(noRepo).find((s) => s.id === 'github')!
    expect(gh.connected).toBe(false)
  })

  it('defaults enabled to true when the integrations map is absent (back-compat)', () => {
    const [gh] = integrationStatuses({ ...view, config: { ...view.config, integrations: undefined } })
    expect(gh!.enabled).toBe(true)
  })
})

describe('availableLlmProviders', () => {
  const withSecrets = (secrets: EffectiveConfigView['secrets']): EffectiveConfigView => ({ ...view, secrets })
  const entry = (key: string) => ({ key, set: true, required: false, source: 'vault' as const })

  it('lists only providers whose required credential is set', () => {
    expect(availableLlmProviders(withSecrets([entry('ANTHROPIC_API_KEY')]))).toEqual(['anthropic'])
    expect(availableLlmProviders(withSecrets([entry('ANTHROPIC_API_KEY'), entry('OPENAI_API_KEY')]))).toEqual([
      'anthropic',
      'openai',
    ])
    expect(availableLlmProviders(withSecrets([entry('AWS_REGION')]))).toEqual(['bedrock'])
  })

  it('is empty when no provider key is set (so the card prompts adding one in Secrets)', () => {
    expect(availableLlmProviders(withSecrets([{ key: 'ANTHROPIC_API_KEY', set: false, required: true, source: 'unset' }]))).toEqual([])
    expect(availableLlmProviders(withSecrets([]))).toEqual([])
  })
})
