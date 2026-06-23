import { randomUUID } from 'node:crypto'
import { desc, eq, sql } from 'drizzle-orm'
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

  /** Paginated list of all links (newest first). */
  async listAll(options: ListOptions = {}): Promise<Page<GithubLinkRecord>> {
    const { limit, offset } = normalizeListOptions(options)
    const rows = await this.db
      .select()
      .from(githubLinks)
      .orderBy(desc(githubLinks.createdAt))
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db.select({ n: sql<number>`count(*)` }).from(githubLinks)
    return { items: rows, total: Number(totalRows[0]?.n ?? 0) }
  }
}
