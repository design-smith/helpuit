import { HeuristicManifestBuilder, type FeatureManifest, type ManifestStore, type ManifestBuilder } from '@helpuit/feature-manifest'
import { DrizzleManifestStore, type Db } from '@helpuit/db'
import { GitHubRepoSource } from '@helpuit/github'
import type { HelpuitConfig } from '@helpuit/config'
import { githubOptionsFromConfig } from './github-options.js'

export interface ManifestProvisionerDeps {
  store: ManifestStore
  /** Confirmed product features from config (may be empty). */
  features: HelpuitConfig['features']
  /** The production ref the manifest is built against (e.g. github.productionBranch). */
  ref: string
  /** Auto-drafts a manifest from the connected repo when there's nothing else (optional). */
  builder?: ManifestBuilder
}

/**
 * Provisions the feature manifest the orchestrator needs to turn on L3a static
 * investigation + L1 code-grounding. A confirmed manifest in the store wins
 * (stable across boots); otherwise it seeds one from `config.features`; otherwise
 * there's nothing to provision and the orchestrator stays docs-only (graceful).
 */
export class ManifestProvisioner {
  constructor(private readonly deps: ManifestProvisionerDeps) {}

  async provision(): Promise<FeatureManifest | undefined> {
    const existing = await this.deps.store.load()
    if (existing !== null) return existing

    if (this.deps.features.length > 0) {
      const manifest: FeatureManifest = {
        ref: this.deps.ref,
        features: this.deps.features.map((f) => ({
          key: f.key,
          name: f.name,
          routes: f.routes,
          components: f.components,
          endpoints: f.endpoints,
          docsLinks: f.docsLinks,
          keywords: f.keywords,
          sandboxRole: f.sandboxRole,
        })),
      }
      await this.deps.store.save(manifest)
      return manifest
    }

    // Nothing curated → auto-draft from the connected repo (heuristics over the
    // file listing). Best-effort: an unreachable/unauthed repo must not crash boot.
    if (this.deps.builder !== undefined) {
      try {
        const drafted = await this.deps.builder.build()
        if (drafted.features.length > 0) {
          await this.deps.store.save(drafted)
          return drafted
        }
      } catch (error) {
        console.warn(`could not auto-draft manifest from repo: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return undefined
  }
}

/**
 * Production factory: wire the manifest provisioner over the live DB + GitHub repo
 * source (auth from config) and provision. Confirmed store wins → seed from
 * config.features → auto-draft from the repo → docs-only. Boot-safe (degrades).
 */
export function provisionManifest(config: HelpuitConfig, deps: { db: Db }): Promise<FeatureManifest | undefined> {
  // Only auto-draft from the repo when GitHub is actually connected — otherwise the
  // call is a guaranteed 401 (placeholder repo / no token) that just spams the logs
  // on a fresh, unconfigured boot.
  const builder =
    config.github.token !== ''
      ? new HeuristicManifestBuilder(new GitHubRepoSource(githubOptionsFromConfig(config)))
      : undefined
  return new ManifestProvisioner({
    store: new DrizzleManifestStore(deps.db),
    features: config.features,
    ref: config.github.productionBranch,
    builder,
  }).provision()
}
