import { resilientFetch } from '@helpuit/resilience'
import type { FreshdeskConfig, FreshdeskTicket } from './types.js'

/** A customer message discovered by polling — normalized for enqueue + dedup. */
export interface PolledMessage {
  /** Stable per message (`<ticketId>:desc` or `<ticketId>:c<convId>`) so overlapping polls dedup. */
  messageId: string
  /** The ticket id (the platform-native conversation id). */
  conversationId: string
  content: string
  /** The Freshdesk requester/author id (resolved to a verified identity later). */
  requesterId?: string
}

/** Freshdesk bodies can be HTML — reduce to plain text for grounding. */
function toText(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Freshdesk has no inbound webhook, so we poll. `poll(since)` fetches tickets
 * updated since a cursor and returns their customer messages: each ticket's
 * opening (description) plus incoming replies. Outgoing agent messages and private
 * notes are skipped so the agent never answers itself.
 */
export class FreshdeskPoller {
  constructor(private readonly config: FreshdeskConfig) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.apiKey}:X`).toString('base64')}`
  }

  private async get<T>(path: string): Promise<T> {
    const base = this.config.baseUrl.replace(/\/$/, '')
    const res = await resilientFetch(`${base}${path}`, {
      headers: { Authorization: this.authHeader(), Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Freshdesk request failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  }

  async poll(sinceIso: string): Promise<PolledMessage[]> {
    const tickets = await this.get<FreshdeskTicket[]>(
      `/tickets?updated_since=${encodeURIComponent(sinceIso)}&order_by=updated_at&order_type=asc`,
    )
    const out: PolledMessage[] = []
    for (const summary of tickets) {
      if (summary.id === undefined) continue
      const ticket = await this.get<FreshdeskTicket>(`/tickets/${summary.id}?include=conversations`)
      const requesterId = ticket.requester_id !== undefined ? String(ticket.requester_id) : undefined

      const opening = toText(ticket.description_text ?? ticket.description ?? '')
      if (opening !== '') {
        out.push({ messageId: `${summary.id}:desc`, conversationId: String(summary.id), content: opening, requesterId })
      }

      for (const c of ticket.conversations ?? []) {
        if (c.incoming !== true || c.private === true) continue
        const content = toText(c.body_text ?? c.body ?? '')
        if (content === '') continue
        out.push({
          messageId: `${summary.id}:c${c.id}`,
          conversationId: String(summary.id),
          content,
          requesterId: c.user_id !== undefined ? String(c.user_id) : requesterId,
        })
      }
    }
    return out
  }
}
