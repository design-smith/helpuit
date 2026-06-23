import type { Db } from './client.js'
import { processedWebhookEvents } from './schema.js'

/**
 * Webhook idempotency guard. `claim(id)` atomically records an event and returns
 * true only the first time — redelivered webhooks return false and are skipped.
 * Ids are namespaced by source so the same raw id from Chatwoot vs GitHub is independent.
 */
export class DrizzleProcessedEvents {
  constructor(
    private readonly db: Db,
    private readonly source: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async claim(rawId: string): Promise<boolean> {
    const id = `${this.source}:${rawId}`
    const inserted = await this.db
      .insert(processedWebhookEvents)
      .values({ id, source: this.source, processedAt: this.now() })
      .onConflictDoNothing()
      .returning()
    return inserted.length > 0
  }
}
