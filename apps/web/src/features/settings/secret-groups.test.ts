import { describe, it, expect } from 'vitest'
import type { SecretCatalogEntry } from '../../lib/api'
import { groupSecrets } from './secret-groups'

const cat = (key: string, over: Partial<SecretCatalogEntry> = {}): SecretCatalogEntry => ({
  key,
  set: false,
  required: false,
  source: 'unset',
  ...over,
})

const ALL_ON = { reproductionEnabled: true, accountDataEnabled: true }
const ALL_OFF = { reproductionEnabled: false, accountDataEnabled: false }

describe('groupSecrets', () => {
  it('groups secrets by the feature that uses them, each with a non-empty "used by" line', () => {
    const groups = groupSecrets(
      [cat('GITHUB_TOKEN'), cat('CHATWOOT_API_TOKEN'), cat('ANTHROPIC_API_KEY'), cat('IDENTITY_HMAC_SECRET'), cat('HELPUIT_ADMIN_TOKEN'), cat('SOME_CUSTOM')],
      ALL_OFF,
    )

    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId.github!.secrets.map((s) => s.key)).toEqual(['GITHUB_TOKEN'])
    expect(byId.chatwoot!.secrets.map((s) => s.key)).toEqual(['CHATWOOT_API_TOKEN'])
    expect(byId.llm!.secrets.map((s) => s.key)).toEqual(['ANTHROPIC_API_KEY'])
    expect(byId.identity!.secrets.map((s) => s.key)).toEqual(['IDENTITY_HMAC_SECRET'])
    expect(byId.operations!.secrets.map((s) => s.key)).toEqual(['HELPUIT_ADMIN_TOKEN'])
    // unknown keys fall into a catch-all group
    expect(byId.other!.secrets.map((s) => s.key)).toContain('SOME_CUSTOM')
    expect(groups.every((g) => g.usedBy.trim().length > 0)).toBe(true)
  })

  it('hides feature-gated secrets when the feature is off', () => {
    const secrets = [cat('GITHUB_TOKEN'), cat('SANDBOX_ADMIN_USER', { required: true }), cat('QUERY_ROUTES_TOKEN')]

    const groups = groupSecrets(secrets, ALL_OFF)

    expect(groups.find((g) => g.id === 'reproduction')).toBeUndefined()
    expect(groups.find((g) => g.id === 'accountData')).toBeUndefined()
    const visibleKeys = groups.flatMap((g) => g.secrets.map((s) => s.key))
    expect(visibleKeys).not.toContain('SANDBOX_ADMIN_USER') // even though required, the feature is off
    expect(visibleKeys).not.toContain('QUERY_ROUTES_TOKEN')
    expect(visibleKeys).toContain('GITHUB_TOKEN')
  })

  it('shows feature-gated secrets once their feature is enabled', () => {
    const secrets = [cat('SANDBOX_ADMIN_USER'), cat('QUERY_ROUTES_TOKEN')]

    const groups = groupSecrets(secrets, ALL_ON)

    expect(groups.find((g) => g.id === 'reproduction')?.secrets.map((s) => s.key)).toContain('SANDBOX_ADMIN_USER')
    expect(groups.find((g) => g.id === 'accountData')?.secrets.map((s) => s.key)).toContain('QUERY_ROUTES_TOKEN')
  })
})
