import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, exists, getTableColumns, gte, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import {
  investigationId as brandId,
  normalizeListOptions,
  type Investigation,
  type InvestigationId,
  type InvestigationLevel,
  type InvestigationStatus,
  type Classification,
  type ListOptions,
  type Page,
} from '@helpuit/contracts'
import {
  InvestigationNotFoundError,
  type CreateInvestigationInput,
  type InvestigationRepository,
} from '@helpuit/investigation-store'
import type { Db } from './client.js'
import { investigations, tickets, githubLinks, issueDrafts } from './schema.js'

type Row = typeof investigations.$inferSelect

/** Filters for the operator-console investigation list. */
export interface InvestigationListFilter {
  status?: InvestigationStatus
  level?: InvestigationLevel
  classification?: Classification
  conversationId?: number
  customerId?: string
  createdAfter?: number
  createdBefore?: number
}

/** Console list filters that derive from related tables (tickets/issues/drafts). */
export interface ConsoleInvestigationFilter extends InvestigationListFilter {
  /** Only conversations that became a ticket. */
  ticket?: boolean
  /** Only conversations with a non-closed (open/unknown) linked GitHub issue. */
  openIssue?: boolean
  /** Only conversations with a draft awaiting review. */
  pendingDraft?: boolean
}

/** An investigation plus the cross-table flags the Conversations list filters/badges on. */
export interface EnrichedInvestigation extends Investigation {
  hasTicket: boolean
  hasOpenIssue: boolean
  pendingDraft: boolean
}

function toInvestigation(row: Row): Investigation {
  return {
    id: brandId(row.id),
    conversationId: row.conversationId,
    customerId: row.customerId,
    status: row.status as InvestigationStatus,
    level: row.level as InvestigationLevel,
    classification: (row.classification as Classification | null) ?? null,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Drizzle/SQLite-backed implementation of the shared `InvestigationRepository`. */
export class DrizzleInvestigationRepository implements InvestigationRepository {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async create(input: CreateInvestigationInput): Promise<Investigation> {
    const ts = this.now()
    const row: Row = {
      id: randomUUID(),
      conversationId: input.conversationId,
      customerId: input.customerId ?? null,
      status: 'open',
      level: 'guidance',
      classification: null,
      confidence: null,
      createdAt: ts,
      updatedAt: ts,
    }
    await this.db.insert(investigations).values(row)
    return toInvestigation(row)
  }

  async get(id: InvestigationId): Promise<Investigation | null> {
    const rows = await this.db.select().from(investigations).where(eq(investigations.id, id))
    const row = rows[0]
    return row === undefined ? null : toInvestigation(row)
  }

  /** Paginated, filtered list for the operator console (newest first by default). */
  async list(
    filter: InvestigationListFilter = {},
    options: ListOptions = {},
  ): Promise<Page<Investigation>> {
    const { limit, offset, order } = normalizeListOptions(options)
    const conditions: SQL[] = []
    if (filter.status !== undefined) conditions.push(eq(investigations.status, filter.status))
    if (filter.level !== undefined) conditions.push(eq(investigations.level, filter.level))
    if (filter.classification !== undefined)
      conditions.push(eq(investigations.classification, filter.classification))
    if (filter.conversationId !== undefined)
      conditions.push(eq(investigations.conversationId, filter.conversationId))
    if (filter.customerId !== undefined)
      conditions.push(eq(investigations.customerId, filter.customerId))
    if (filter.createdAfter !== undefined)
      conditions.push(gte(investigations.createdAt, filter.createdAfter))
    if (filter.createdBefore !== undefined)
      conditions.push(lte(investigations.createdAt, filter.createdBefore))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const orderBy = order === 'oldest' ? asc(investigations.createdAt) : desc(investigations.createdAt)
    const rows = await this.db
      .select()
      .from(investigations)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(investigations)
      .where(where)
    return { items: rows.map(toInvestigation), total: Number(totalRows[0]?.n ?? 0) }
  }

  /**
   * Console list: every investigation plus `hasTicket`/`hasOpenIssue`/`pendingDraft`
   * flags (computed in-query via EXISTS, so no N+1), and optional filtering by those
   * relations. Drives the Conversations page filters/badges.
   */
  async listEnriched(
    filter: ConsoleInvestigationFilter = {},
    options: ListOptions = {},
  ): Promise<Page<EnrichedInvestigation>> {
    const { limit, offset, order } = normalizeListOptions(options)

    // Correlated EXISTS predicates (no N+1). Built via the query builder so the
    // outer `investigations.id` reference is table-qualified inside the subquery
    // (a raw `sql` template renders columns unqualified, which mis-binds).
    const ticketExists = exists(
      this.db.select({ x: sql`1` }).from(tickets).where(eq(tickets.investigationId, investigations.id)),
    )
    const pendingDraftExists = exists(
      this.db
        .select({ x: sql`1` })
        .from(issueDrafts)
        .where(and(eq(issueDrafts.investigationId, investigations.id), eq(issueDrafts.status, 'pending'))),
    )
    const openIssueExists = exists(
      this.db
        .select({ x: sql`1` })
        .from(githubLinks)
        .where(
          and(
            eq(githubLinks.investigationId, investigations.id),
            or(isNull(githubLinks.status), ne(githubLinks.status, 'closed')),
          ),
        ),
    )

    const conditions: SQL[] = []
    if (filter.status !== undefined) conditions.push(eq(investigations.status, filter.status))
    if (filter.level !== undefined) conditions.push(eq(investigations.level, filter.level))
    if (filter.classification !== undefined)
      conditions.push(eq(investigations.classification, filter.classification))
    if (filter.conversationId !== undefined)
      conditions.push(eq(investigations.conversationId, filter.conversationId))
    if (filter.customerId !== undefined) conditions.push(eq(investigations.customerId, filter.customerId))
    if (filter.createdAfter !== undefined) conditions.push(gte(investigations.createdAt, filter.createdAfter))
    if (filter.createdBefore !== undefined) conditions.push(lte(investigations.createdAt, filter.createdBefore))
    if (filter.ticket === true) conditions.push(ticketExists)
    if (filter.pendingDraft === true) conditions.push(pendingDraftExists)
    if (filter.openIssue === true) conditions.push(openIssueExists)
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const orderBy = order === 'oldest' ? asc(investigations.createdAt) : desc(investigations.createdAt)
    const rows = await this.db
      .select({
        ...getTableColumns(investigations),
        hasTicket: sql<number>`case when ${ticketExists} then 1 else 0 end`,
        pendingDraft: sql<number>`case when ${pendingDraftExists} then 1 else 0 end`,
        hasOpenIssue: sql<number>`case when ${openIssueExists} then 1 else 0 end`,
      })
      .from(investigations)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db.select({ n: sql<number>`count(*)` }).from(investigations).where(where)

    const items = rows.map((row) => ({
      ...toInvestigation(row),
      hasTicket: Number(row.hasTicket) === 1,
      pendingDraft: Number(row.pendingDraft) === 1,
      hasOpenIssue: Number(row.hasOpenIssue) === 1,
    }))
    return { items, total: Number(totalRows[0]?.n ?? 0) }
  }

  setLevel(id: InvestigationId, level: InvestigationLevel): Promise<Investigation> {
    return this.patch(id, { level })
  }

  setStatus(id: InvestigationId, status: InvestigationStatus): Promise<Investigation> {
    return this.patch(id, { status })
  }

  classify(
    id: InvestigationId,
    classification: Classification,
    confidence: number,
  ): Promise<Investigation> {
    return this.patch(id, { classification, confidence })
  }

  private async patch(id: InvestigationId, fields: Partial<Row>): Promise<Investigation> {
    const result = await this.db
      .update(investigations)
      .set({ ...fields, updatedAt: this.now() })
      .where(eq(investigations.id, id))
      .returning()
    const row = result[0]
    if (row === undefined) throw new InvestigationNotFoundError(id)
    return toInvestigation(row)
  }
}
