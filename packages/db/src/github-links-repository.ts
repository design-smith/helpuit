import { randomUUID } from 'node:crypto'
import { desc, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { normalizeListOptions, type ListOptions, type Page } from '@helpuit/contracts'
import type { Db } from './client.js'
import { githubLinks } from './schema.js'

export interface GithubLink {
  investigationId: string
  issueNumber: number
  issueUrl: string
}

/** A full GitHub-link row (what the console renders). */
export type GithubLinkRecord = typeof githubLinks.$inferSelect

/**
 * Investigation ↔ GitHub issue links (many investigations → one issue), so a
 * single fix can fan out to every affected customer (issue 79 source).
 */
export class DrizzleGithubLinks {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async link(input: GithubLink): Promise<void> {
    await this.db.insert(githubLinks).values({
      id: randomUUID(),
      investigationId: input.investigationId,
      issueNumber: input.issueNumber,
      issueUrl: input.issueUrl,
      createdAt: this.now(),
    })
  }

  async investigationsForIssue(issueNumber: number): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(githubLinks)
      .where(eq(githubLinks.issueNumber, issueNumber))
    return rows.map((r) => r.investigationId)
  }

  /** Full link rows for one investigation (console investigation-detail view). */
  async listByInvestigation(investigationId: string): Promise<GithubLinkRecord[]> {
    return this.db
      .select()
      .from(githubLinks)
      .where(eq(githubLinks.investigationId, investigationId))
      .orderBy(desc(githubLinks.createdAt))
  }

  /** Paginated list of all links (newest first), optionally filtered by open/closed state. */
  async listAll(
    options: ListOptions = {},
    filter: { status?: 'open' | 'closed' } = {},
  ): Promise<Page<GithubLinkRecord>> {
    const { limit, offset } = normalizeListOptions(options)
    const where = statusWhere(filter.status)
    const rows = await this.db
      .select()
      .from(githubLinks)
      .where(where)
      .orderBy(desc(githubLinks.createdAt))
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db.select({ n: sql<number>`count(*)` }).from(githubLinks).where(where)
    return { items: rows, total: Number(totalRows[0]?.n ?? 0) }
  }

  /** Mark every link for an issue with the current GitHub open/closed state. */
  async updateStatus(issueNumber: number, status: string, syncedAt: number): Promise<void> {
    await this.db
      .update(githubLinks)
      .set({ status, lastSyncedAt: syncedAt })
      .where(eq(githubLinks.issueNumber, issueNumber))
  }

  /** Distinct issue numbers not known to be closed (null or open) — the refresh worklist. */
  async issueNumbersNeedingSync(limit = 200): Promise<number[]> {
    const rows = await this.db
      .selectDistinct({ issueNumber: githubLinks.issueNumber })
      .from(githubLinks)
      .where(or(isNull(githubLinks.status), ne(githubLinks.status, 'closed')))
      .orderBy(desc(githubLinks.issueNumber))
      .limit(limit)
    return rows.map((r) => r.issueNumber)
  }
}

/** WHERE for the open/closed status filter — `open` treats an unsynced (null) status as open. */
function statusWhere(status?: 'open' | 'closed'): SQL | undefined {
  if (status === 'closed') return eq(githubLinks.status, 'closed')
  if (status === 'open') return or(isNull(githubLinks.status), ne(githubLinks.status, 'closed'))
  return undefined
}
