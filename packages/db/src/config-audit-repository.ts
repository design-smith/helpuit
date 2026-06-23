import { desc } from 'drizzle-orm'
import type { Db } from './client.js'
import { configAudit } from './schema.js'

export interface ConfigAuditRecord {
  id: number
  action: string
  target: string
  at: number
}

/**
 * Append-only audit of config + secret changes. Records WHAT changed
 * (action + target) and WHEN — never the value (so the log can't leak a secret).
 */
export class DrizzleConfigAudit {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async record(action: string, target: string): Promise<void> {
    await this.db.insert(configAudit).values({ action, target, at: this.now() })
  }

  async recent(limit = 50): Promise<ConfigAuditRecord[]> {
    return this.db.select().from(configAudit).orderBy(desc(configAudit.at)).limit(limit)
  }
}
