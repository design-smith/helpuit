import type { FeatureManifest } from './types.js'

/** Persistence for the confirmed feature manifest. Real impl uses Drizzle. */
export interface ManifestStore {
  load(): Promise<FeatureManifest | null>
  save(manifest: FeatureManifest): Promise<void>
}

/** In-memory store for tests and local dev. */
export class InMemoryManifestStore implements ManifestStore {
  private current: FeatureManifest | null = null

  async load(): Promise<FeatureManifest | null> {
    return this.current
  }

  async save(manifest: FeatureManifest): Promise<void> {
    this.current = manifest
  }
}
