import { describe, it, expect } from 'vitest'
import { resolveFeature } from './resolver.js'
import type { FeatureManifest } from './types.js'

const manifest: FeatureManifest = {
  ref: 'main',
  features: [
    {
      key: 'billing',
      name: 'Billing',
      routes: ['/settings/billing'],
      components: ['BillingForm.vue'],
      endpoints: ['POST /api/billing/update'],
      docsLinks: [],
      keywords: ['invoice', 'card', 'payment'],
    },
    {
      key: 'team',
      name: 'Team members',
      routes: ['/settings/team'],
      components: ['TeamInvite.vue'],
      endpoints: ['POST /api/team/invite'],
      docsLinks: [],
      keywords: ['invite', 'member'],
    },
  ],
}

describe('resolveFeature', () => {
  it('ranks the feature whose route the complaint mentions first', () => {
    const matches = resolveFeature(manifest, 'the save button on /settings/billing freezes')
    expect(matches[0]!.feature.key).toBe('billing')
  })

  it('matches on keywords when no route is mentioned', () => {
    const matches = resolveFeature(manifest, 'I cannot invite a new member')
    expect(matches[0]!.feature.key).toBe('team')
  })

  it('returns no matches for an unrelated complaint', () => {
    expect(resolveFeature(manifest, 'xyzzy plugh')).toHaveLength(0)
  })
})
