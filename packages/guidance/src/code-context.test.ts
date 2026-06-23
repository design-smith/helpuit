import { describe, it, expect } from 'vitest'
import type { FeatureManifest } from '@helpuit/feature-manifest'
import { ManifestCodeContextProvider, type CodeReader } from './code-context.js'

const manifest: FeatureManifest = {
  ref: 'main',
  features: [
    {
      key: 'billing',
      name: 'Billing',
      routes: ['/settings/billing'],
      components: ['app/routes/billing.tsx'],
      endpoints: [],
      docsLinks: [],
      keywords: ['card', 'payment', 'invoice'],
    },
    {
      key: 'team',
      name: 'Team',
      routes: ['/settings/team'],
      components: ['app/routes/team.tsx'],
      endpoints: [],
      docsLinks: [],
      keywords: ['invite', 'member'],
    },
  ],
}

/** Real in-memory reader — returns canned source for requested paths. */
function reader(files: Record<string, string>): CodeReader {
  return {
    async retrieve(paths) {
      const out: Record<string, string> = {}
      for (const p of paths) if (files[p] !== undefined) out[p] = files[p]!
      return out
    },
  }
}

describe('ManifestCodeContextProvider', () => {
  it('resolves the complaint to a feature and returns that feature’s code', async () => {
    const provider = new ManifestCodeContextProvider(
      manifest,
      reader({ 'app/routes/billing.tsx': 'function save() { /* ... */ }' }),
    )

    const snippets = await provider.retrieve('my payment card save fails')

    expect(snippets.map((s) => s.path)).toEqual(['app/routes/billing.tsx'])
    expect(snippets[0]!.content).toContain('function save')
  })

  it('returns nothing when no feature matches (no invented grounding)', async () => {
    const provider = new ManifestCodeContextProvider(manifest, reader({}))
    expect(await provider.retrieve('xyzzy plugh unrelated')).toEqual([])
  })

  it('caps each snippet to the configured byte budget', async () => {
    const big = 'x'.repeat(10_000)
    const provider = new ManifestCodeContextProvider(
      manifest,
      reader({ 'app/routes/billing.tsx': big }),
      { maxBytesPerFile: 100 },
    )

    const snippets = await provider.retrieve('billing card')
    expect(snippets[0]!.content.length).toBe(100)
  })
})
