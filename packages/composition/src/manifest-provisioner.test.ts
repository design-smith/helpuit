import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createDb, DrizzleManifestStore, type DbHandle } from '@helpuit/db'
import type { HelpuitConfig } from '@helpuit/config'
import { GitHubRepoSource } from '@helpuit/github'
import { HeuristicManifestBuilder } from '@helpuit/feature-manifest'
import { ManifestProvisioner } from './manifest-provisioner.js'

let handle: DbHandle | undefined
let server: Server | undefined
afterEach(() => {
  handle?.close()
  server?.close()
  server = undefined
})

/** A real HTTP server returning a GitHub git-tree — drives a real GitHubRepoSource (no mocks). */
async function repoServer(tree: Array<{ path: string; type: string }>): Promise<string> {
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ tree }))
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  const addr = server!.address()
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0
  return `http://127.0.0.1:${port}`
}

function builderFor(apiBaseUrl: string): HeuristicManifestBuilder {
  return new HeuristicManifestBuilder(new GitHubRepoSource({ owner: 'o', repo: 'r', token: 't', apiBaseUrl, ref: 'main' }))
}

const FEATURES = [
  {
    key: 'billing',
    name: 'Billing',
    routes: ['/settings/billing'],
    components: ['BillingForm.vue'],
    endpoints: ['POST /api/billing/update'],
    docsLinks: [],
    keywords: ['invoice', 'card'],
    sandboxRole: 'admin',
    irreversible: true,
  },
] as unknown as HelpuitConfig['features']

async function store() {
  handle = await createDb(':memory:')
  return new DrizzleManifestStore(handle.db)
}

describe('ManifestProvisioner', () => {
  it('seeds a manifest from config.features (with the production ref) and persists it', async () => {
    const s = await store()
    const manifest = await new ManifestProvisioner({ store: s, features: FEATURES, ref: 'release' }).provision()

    expect(manifest?.ref).toBe('release')
    expect(manifest?.features.map((f) => f.key)).toEqual(['billing'])
    expect(manifest?.features[0]?.routes).toEqual(['/settings/billing'])
    // really persisted (no mocks): the store round-trips it
    const loaded = await s.load()
    expect(loaded?.features[0]?.name).toBe('Billing')
  })

  it('reuses a stored (confirmed) manifest instead of re-seeding from features', async () => {
    const s = await store()
    await s.save({ ref: 'pinned', features: [{ key: 'team', name: 'Team', routes: [], components: [], endpoints: [], docsLinks: [] }] })

    // provision with DIFFERENT features — the confirmed manifest must win (stable across boots)
    const manifest = await new ManifestProvisioner({ store: s, features: FEATURES, ref: 'release' }).provision()
    expect(manifest?.ref).toBe('pinned')
    expect(manifest?.features.map((f) => f.key)).toEqual(['team'])
  })

  it('returns undefined when there are no features and no stored manifest (degrade gracefully)', async () => {
    const s = await store()
    const manifest = await new ManifestProvisioner({ store: s, features: [], ref: 'main' }).provision()
    expect(manifest).toBeUndefined()
    expect(await s.load()).toBeNull() // nothing persisted
  })

  it('auto-drafts a manifest from the connected repo when there are no features/manifest', async () => {
    const s = await store()
    const base = await repoServer([
      { path: 'app/routes/billing.tsx', type: 'blob' },
      { path: 'app/routes/team/index.tsx', type: 'blob' },
      { path: 'src/util.ts', type: 'blob' }, // not a route file → ignored
    ])

    const manifest = await new ManifestProvisioner({
      store: s,
      features: [],
      ref: 'main',
      builder: builderFor(base),
    }).provision()

    expect(manifest?.features.map((f) => f.key).sort()).toEqual(['billing', 'team'])
    // really persisted (real DB) so the next boot reuses it
    expect((await s.load())?.features).toHaveLength(2)
  })

  it('does not crash when the repo is unreachable — degrades to no manifest', async () => {
    const s = await store()
    // a real GitHubRepoSource pointed at a closed port → a real failed fetch (no mock)
    const manifest = await new ManifestProvisioner({
      store: s,
      features: [],
      ref: 'main',
      builder: builderFor('http://127.0.0.1:1'),
    }).provision()

    expect(manifest).toBeUndefined()
    expect(await s.load()).toBeNull()
  })
})
