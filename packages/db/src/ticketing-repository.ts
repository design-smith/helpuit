import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import {
  TicketNotFoundError,
  type CreateTicketInput,
  type Ticket,
  type Ticketing,
} from '@helpuit/ticketing'
import { normalizeListOptions, type ListOptions, type Page } from '@helpuit/contracts'
import type { Db } from './client.js'
import { tickets } from './schema.js'

/** Filters for the operator-console ticket list. */
export interface TicketListFilter {
  investigationId?: string
  issueNumber?: number
  /** true → only tickets linked to a GitHub issue; false → only unlinked. */
  linked?: boolean
}

/** Drizzle/SQLite-backed `Ticketing` — many tickets → one GitHub issue. */
export class DrizzleTicketing implements Ticketing {
  constructor(private readonly db: Db) {}

  async create(input: CreateTicketInput): Promise<Ticket> {
    const ticket: Ticket = {
      id: randomUUID(),
      investigationId: input.investigationId,
      conversationId: input.conversationId,
      issueNumber: null,
    }
    await this.db.insert(tickets).values(ticket)
    return ticket
  }

  async linkToIssue(ticketId: string, issueNumber: number): Promise<Ticket> {
    const result = await this.db
      .update(tickets)
      .set({ issueNumber })
      .where(eq(tickets.id, ticketId))
      .returning()
    const row = result[0]
    if (row === undefined) throw new TicketNotFoundError(ticketId)
    return row
  }

  async ticketsForIssue(issueNumber: number): Promise<Ticket[]> {
    return this.db.select().from(tickets).where(eq(tickets.issueNumber, issueNumber))
  }

  /** All tickets for one investigation (the console investigation-detail view). */
  async listByInvestigation(investigationId: string): Promise<Ticket[]> {
    return this.db.select().from(tickets).where(eq(tickets.investigationId, investigationId))
  }

  /** Paginated, filtered ticket list for the operator console. */
  async listAll(filter: TicketListFilter = {}, options: ListOptions = {}): Promise<Page<Ticket>> {
    const { limit, offset } = normalizeListOptions(options)
    const conditions: SQL[] = []
    if (filter.investigationId !== undefined)
      conditions.push(eq(tickets.investigationId, filter.investigationId))
    if (filter.issueNumber !== undefined) conditions.push(eq(tickets.issueNumber, filter.issueNumber))
    if (filter.linked === true) conditions.push(isNotNull(tickets.issueNumber))
    if (filter.linked === false) conditions.push(isNull(tickets.issueNumber))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await this.db
      .select()
      .from(tickets)
      .where(where)
      .orderBy(desc(tickets.id))
      .limit(limit)
      .offset(offset)
    const totalRows = await this.db.select({ n: sql<number>`count(*)` }).from(tickets).where(where)
    return { items: rows, total: Number(totalRows[0]?.n ?? 0) }
  }
}
