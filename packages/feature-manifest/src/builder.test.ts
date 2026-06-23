import { describe, it, expect } from 'vitest'
import { HeuristicManifestBuilder, type RepoSource, type RepoFile } from './builder.js'
import { InMemoryManifestStore } from './store.js'

function fakeSource(ref: string, files: RepoFile[]): RepoSource {
  return {
    ref: () => ref,
    listFiles: async () => files,
  }
}

describe('HeuristicManifestBuilder', () => {
  it('drafts features from route files and ignores non-route files', async () => {
    const builder = new HeuristicManifestBuilder(
      fakeSource('release', [
        { path: 'app/routes/settings/billing.tsx' },
        { path: 'app/pages/team/index.vue' },
        { path: 'src/utils/helpers.ts' },
      ]),
    )
    const manifest = await builder.build()
    expect(manifest.ref).toBe('release')
    const routes = manifest.features.map((f) => f.routes[0]).sort()
    expect(routes).toEqual(['/settings/billing', '/team'])
  })
})

describe('InMemoryManifestStore', () => {
  it('round-trips a saved manifest', async () => {
    const store = new InMemoryManifestStore()
    expect(await store.load()).toBeNull()
    await store.save({ ref: 'main', features: [] })
    expect(await store.load()).toEqual({ ref: 'main', features: [] })
  })
})
