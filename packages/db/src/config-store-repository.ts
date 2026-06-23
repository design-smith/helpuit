import { eq, sql } from 'drizzle-orm'
import type { Db } from './client.js'
import { configStore } from './schema.js'

/** A structural-config override section as stored (parsed JSON). */
export interface ConfigSectionRecord {
  section: string
  value: unknown
  version: number
  updatedAt: number
}

/**
 * Persisted structural-config overrides, one row per editable section
 * (policy/budget/alerts/models/…). Layered over the file/env baseline by
 * `resolveEffectiveConfig`. Empty store ⇒ baseline behavior unchanged.
 */
export class DrizzleConfigStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** All overrides as `{ section: parsedJson }` — fed to the effective-config merge. */
  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.select().from(configStore)
    const out: Record<string, unknown> = {}
    for (const row of rows) out[row.section] = JSON.parse(row.json)
    return out
  }

  async get(section: string): Promise<ConfigSectionRecord | null> {
    const rows = await this.db.select().from(configStore).where(eq(configStore.section, section))
    const row = rows[0]
    return row === undefined
      ? null
      : { section: row.section, value: JSON.parse(row.json), version: row.version, updatedAt: row.updatedAt }
  }

  /** Upsert a section's override, bumping its version. */
  async put(section: string, value: unknown): Promise<ConfigSectionRecord> {
    const json = JSON.stringify(value)
    const at = this.now()
    await this.db
      .insert(configStore)
      .values({ section, json, version: 1, updatedAt: at })
      .onConflictDoUpdate({
        target: configStore.section,
        set: { json, version: sql`${configStore.version} + 1`, updatedAt: at },
      })
    const saved = await this.get(section)
    return saved!
  }
}
