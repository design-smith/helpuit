import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Db } from './client.js'
import {
  investigations,
  reproductionAttempts,
  spendEntries,
  githubLinks,
  jobs,
  conversationControls,
} from './schema.js'

/** Windowed operational snapshot for threshold alerting (structurally an `AlertSnapshot`). */
export interface AlertSnapshotData {
  spendToday: number
  dayCap: number
  reproAttempts: number
  reproFailures: number
  escalations: number
}

export interface DashboardOverview {
  investigations: {
    total: number
    byStatus: Record<string, number>
    byClassification: Record<string, number>
    recent: Array<{ id: string; status: string; level: string; classification: string | null; createdAt: number }>
  }
  reproduction: { attempts: number; reproduced: number; successRate: number }
  spend: { totalTokens: number }
  escalations: { issuesLinked: number }
  queue: { pending: number; active: number; done: number; failed: number }
  control: { pausedConversations: number }
}

const COUNT = sql<number>`count(*)`

/**
 * Read-only operational overview for the founder dashboard (issue 38): live
 * investigation mix, reproduction success rate, token spend, escalation volume,
 * and async-queue health — aggregated straight from the real database.
 */
export class DrizzleDashboardService {
  constructor(private readonly db: Db) {}

  async overview(options: { recentLimit?: number } = {}): Promise<DashboardOverview> {
    const recentLimit = options.recentLimit ?? 10

    const byStatusRows = await this.db
      .select({ key: investigations.status, n: COUNT })
      .from(investigations)
      .groupBy(investigations.status)
    const byClassRows = await this.db
      .select({ key: investigations.classification, n: COUNT })
      .from(investigations)
      .groupBy(investigations.classification)
    const recent = await this.db
      .select({
        id: investigations.id,
        status: investigations.status,
        level: investigations.level,
        classification: investigations.classification,
        createdAt: investigations.createdAt,
      })
      .from(investigations)
      .orderBy(desc(investigations.createdAt))
      .limit(recentLimit)

    const byStatus: Record<string, number> = {}
    let total = 0
    for (const row of byStatusRows) {
      byStatus[row.key] = Number(row.n)
      total += Number(row.n)
    }
    const byClassification: Record<string, number> = {}
    for (const row of byClassRows) {
      if (row.key !== null) byClassification[row.key] = Number(row.n)
    }

    const [repro] = await this.db
      .select({
        attempts: COUNT,
        reproduced: sql<number>`coalesce(sum(${reproductionAttempts.reproduced}), 0)`,
      })
      .from(reproductionAttempts)
    const attempts = Number(repro?.attempts ?? 0)
    const reproduced = Number(repro?.reproduced ?? 0)

    const [spend] = await this.db
      .select({ total: sql<number>`coalesce(sum(${spendEntries.amount}), 0)` })
      .from(spendEntries)

    const [links] = await this.db
      .select({ issues: sql<number>`count(distinct ${githubLinks.issueNumber})` })
      .from(githubLinks)

    const queueRows = await this.db
      .select({ status: jobs.status, n: COUNT })
      .from(jobs)
      .groupBy(jobs.status)
    const queue = { pending: 0, active: 0, done: 0, failed: 0 }
    for (const row of queueRows) {
      if (row.status in queue) queue[row.status as keyof typeof queue] = Number(row.n)
    }

    const [paused] = await this.db
      .select({ n: COUNT })
      .from(conversationControls)
      .where(eq(conversationControls.paused, 1))

    return {
      investigations: { total, byStatus, byClassification, recent },
      reproduction: {
        attempts,
        reproduced,
        successRate: attempts === 0 ? 0 : reproduced / attempts,
      },
      spend: { totalTokens: Number(spend?.total ?? 0) },
      escalations: { issuesLinked: Number(links?.issues ?? 0) },
      queue,
      control: { pausedConversations: Number(paused?.n ?? 0) },
    }
  }

  /** A snapshot of activity SINCE `since` (e.g. start of day) for the alert engine. */
  async alertSnapshot(options: { since: number; dayCap: number }): Promise<AlertSnapshotData> {
    const { since, dayCap } = options

    const [spend] = await this.db
      .select({ total: sql<number>`coalesce(sum(${spendEntries.amount}), 0)` })
      .from(spendEntries)
      .where(gte(spendEntries.at, since))

    const [repro] = await this.db
      .select({
        attempts: COUNT,
        reproduced: sql<number>`coalesce(sum(${reproductionAttempts.reproduced}), 0)`,
      })
      .from(reproductionAttempts)
      .where(gte(reproductionAttempts.createdAt, since))
    const attempts = Number(repro?.attempts ?? 0)
    const reproduced = Number(repro?.reproduced ?? 0)

    const [esc] = await this.db
      .select({ n: COUNT })
      .from(investigations)
      .where(and(eq(investigations.status, 'escalated'), gte(investigations.updatedAt, since)))

    return {
      spendToday: Number(spend?.total ?? 0),
      dayCap,
      reproAttempts: attempts,
      reproFailures: attempts - reproduced,
      escalations: Number(esc?.n ?? 0),
    }
  }
}
