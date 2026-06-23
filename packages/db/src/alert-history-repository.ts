import { desc } from 'drizzle-orm'
import type { Db } from './client.js'
import { alerts } from './schema.js'

/** A fired alert as the console reads it. */
export interface AlertRecord {
  id: number
  kind: string
  severity: string
  message: string
  at: number
}

/** A persistable alert (structurally compatible with observability's `Alert`). */
export interface PersistableAlert {
  kind: string
  severity: string
  message: string
}

/**
 * Durable history of fired operational alerts. The alert engine is otherwise
 * fire-and-forget (webhook/log); this records each fired alert so the console
 * can show what tripped and when.
 */
export class DrizzleAlertHistory {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async record(alert: PersistableAlert): Promise<void> {
    await this.db.insert(alerts).values({
      kind: alert.kind,
      severity: alert.severity,
      message: alert.message,
      at: this.now(),
    })
  }

  async recent(limit = 50): Promise<AlertRecord[]> {
    return this.db.select().from(alerts).orderBy(desc(alerts.at)).limit(limit)
  }
}
