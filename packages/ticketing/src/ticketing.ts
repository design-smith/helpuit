export interface Ticket {
  id: string
  investigationId: string
  conversationId: string
  /** The GitHub issue this ticket is linked to (many tickets → one issue), or null. */
  issueNumber: number | null
}

export interface CreateTicketInput {
  investigationId: string
  conversationId: string
}

/** Storage-agnostic ticketing contract. Satisfied by both the in-memory and DB impls. */
export interface Ticketing {
  create(input: CreateTicketInput): Promise<Ticket>
  linkToIssue(ticketId: string, issueNumber: number): Promise<Ticket>
  ticketsForIssue(issueNumber: number): Promise<Ticket[]>
}

export class TicketNotFoundError extends Error {
  constructor(public readonly ticketId: string) {
    super(`Ticket "${ticketId}" not found`)
    this.name = 'TicketNotFoundError'
  }
}

/**
 * Ticket store linking Chatwoot tickets to investigations and (many-to-one) to
 * GitHub issues (issue 49). The many-to-one link is what lets one fix fan out
 * to every affected customer later.
 */
export class InMemoryTicketing implements Ticketing {
  private readonly tickets = new Map<string, Ticket>()
  private counter = 0

  async create(input: CreateTicketInput): Promise<Ticket> {
    const id = `ticket-${++this.counter}`
    const ticket: Ticket = {
      id,
      investigationId: input.investigationId,
      conversationId: input.conversationId,
      issueNumber: null,
    }
    this.tickets.set(id, ticket)
    return ticket
  }

  async linkToIssue(ticketId: string, issueNumber: number): Promise<Ticket> {
    const current = this.tickets.get(ticketId)
    if (current === undefined) throw new TicketNotFoundError(ticketId)
    const updated: Ticket = { ...current, issueNumber }
    this.tickets.set(ticketId, updated)
    return updated
  }

  async ticketsForIssue(issueNumber: number): Promise<Ticket[]> {
    return [...this.tickets.values()].filter((t) => t.issueNumber === issueNumber)
  }
}
