import { eq } from 'drizzle-orm'
import type { FeatureManifest, ManifestStore } from '@helpuit/feature-manifest'
import type { Db } from './client.js'
import { manifests } from './schema.js'

const CURRENT = 'current'

/** Drizzle/SQLite-backed `ManifestStore` — stores the confirmed manifest as one row. */
export class DrizzleManifestStore implements ManifestStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async load(): Promise<FeatureManifest | null> {
    const rows = await this.db.select().from(manifests).where(eq(manifests.id, CURRENT))
    const row = rows[0]
    return row === undefined ? null : (JSON.parse(row.json) as FeatureManifest)
  }

  async save(manifest: FeatureManifest): Promise<void> {
    const json = JSON.stringify(manifest)
    await this.db
      .insert(manifests)
      .values({ id: CURRENT, json, updatedAt: this.now() })
      .onConflictDoUpdate({ target: manifests.id, set: { json, updatedAt: this.now() } })
  }
}
