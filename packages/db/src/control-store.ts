import { eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { conversationControls } from './schema.js'

export interface ConversationControl {
  conversationId: string
  paused: boolean
  note: string | null
  updatedAt: number
}

/**
 * Founder takeover store (issue 38): records which conversations the human has
 * paused so the orchestrator stays silent and lets them handle it directly.
 * One row per conversation (upserted), so pausing is idempotent.
 */
export class DrizzleControlStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async pause(conversationId: string, note?: string): Promise<void> {
    await this.upsert(conversationId, true, note ?? null)
  }

  async resume(conversationId: string): Promise<void> {
    await this.upsert(conversationId, false, null)
  }

  async isPaused(conversationId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(conversationControls)
      .where(eq(conversationControls.conversationId, conversationId))
    return rows[0]?.paused === 1
  }

  async listPaused(): Promise<ConversationControl[]> {
    const rows = await this.db
      .select()
      .from(conversationControls)
      .where(eq(conversationControls.paused, 1))
    return rows.map((row) => ({
      conversationId: row.conversationId,
      paused: row.paused === 1,
      note: row.note,
      updatedAt: row.updatedAt,
    }))
  }

  private async upsert(conversationId: string, paused: boolean, note: string | null): Promise<void> {
    const now = this.now()
    const pausedInt = paused ? 1 : 0
    await this.db
      .insert(conversationControls)
      .values({ conversationId, paused: pausedInt, note, updatedAt: now })
      .onConflictDoUpdate({
        target: conversationControls.conversationId,
        set: { paused: pausedInt, note, updatedAt: now },
      })
  }
}
