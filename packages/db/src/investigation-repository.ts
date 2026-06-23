import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
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
import { investigations } from './schema.js'

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
