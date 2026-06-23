import { eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { restartFlag } from './schema.js'

const ROW_ID = 'current'

export interface RestartStatus {
  pending: boolean
  reasons: string[]
  setAt: number | null
}

const NONE: RestartStatus = { pending: false, reasons: [], setAt: null }

/**
 * Single-row marker tracking whether restart-class changes (secrets, DB url,
 * encryption key) are staged but not yet applied. Drives the "restart required"
 * banner. Cleared on a successful boot (a restart just applied everything).
 */
export class DrizzleRestartFlag {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get(): Promise<RestartStatus> {
    const rows = await this.db.select().from(restartFlag).where(eq(restartFlag.id, ROW_ID))
    const row = rows[0]
    if (row === undefined || row.pending === 0) return NONE
    return {
      pending: true,
      reasons: row.reasons !== null ? (JSON.parse(row.reasons) as string[]) : [],
      setAt: row.setAt,
    }
  }

  /** Add a reason and mark a restart pending (merges with any existing reasons). */
  async add(reason: string): Promise<void> {
    const current = await this.get()
    const reasons = Array.from(new Set([...current.reasons, reason]))
    const at = this.now()
    await this.db
      .insert(restartFlag)
      .values({ id: ROW_ID, pending: 1, reasons: JSON.stringify(reasons), setAt: at })
      .onConflictDoUpdate({
        target: restartFlag.id,
        set: { pending: 1, reasons: JSON.stringify(reasons), setAt: at },
      })
  }

  async clear(): Promise<void> {
    await this.db
      .insert(restartFlag)
      .values({ id: ROW_ID, pending: 0, reasons: null, setAt: this.now() })
      .onConflictDoUpdate({ target: restartFlag.id, set: { pending: 0, reasons: null, setAt: this.now() } })
  }
}
