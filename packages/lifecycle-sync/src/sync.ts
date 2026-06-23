import type { ChatwootClient } from '@helpuit/chatwoot'
import type { Ticket } from '@helpuit/ticketing'
import type { InvestigationStatus } from '@helpuit/contracts'

export interface GitHubIssueEvent {
  type: 'opened' | 'assigned' | 'closed'
  issueNumber: number
  closeReason?: 'completed' | 'not_planned'
}

/** Normalize a GitHub issue webhook payload into an event we act on (issue 75). */
export function parseGitHubEvent(payload: unknown): GitHubIssueEvent | null {
  if (payload === null || typeof payload !== 'object') return null
  const p = payload as { action?: string; issue?: { number?: number; state_reason?: string } }
  const issueNumber = p.issue?.number
  if (typeof issueNumber !== 'number') return null

  switch (p.action) {
    case 'opened':
      return { type: 'opened', issueNumber }
    case 'assigned':
      return { type: 'assigned', issueNumber }
    case 'closed':
      return {
        type: 'closed',
        issueNumber,
        closeReason: p.issue?.state_reason === 'not_planned' ? 'not_planned' : 'completed',
      }
    default:
      return null
  }
}

export interface TicketStateChange {
  status?: InvestigationStatus
  note: string
}

/** Map a GitHub event to the ticket status + private note (issue 76). */
export function nextTicketState(event: GitHubIssueEvent): TicketStateChange {
  switch (event.type) {
    case 'opened':
      return { note: 'Engineering issue opened for this report.' }
    case 'assigned':
      return { note: 'Assigned to an engineer.' }
    case 'closed':
      return event.closeReason === 'completed'
        ? { status: 'resolved_pending_customer_update', note: 'Fix landed; pending customer update.' }
        : { note: 'Issue closed as not planned — needs founder review.' }
  }
}

export type ResolutionMode = 'manual' | 'auto'

/**
 * Whether to auto-send the customer "it's fixed" message (issue 78). Only on an
 * auto-mode `completed` closure — never on `not_planned`/duplicate, and never in
 * manual mode (which drafts for the founder instead).
 */
export function shouldNotifyCustomer(event: GitHubIssueEvent, mode: ResolutionMode): boolean {
  return mode === 'auto' && event.type === 'closed' && event.closeReason === 'completed'
}

export interface LifecycleSyncDeps {
  ticketing: { ticketsForIssue(issueNumber: number): Promise<Ticket[]> }
  client: ChatwootClient
  mode: ResolutionMode
}

export interface SyncOutcome {
  note: string
  status?: InvestigationStatus
  /** How many linked customers were sent the "try again" message. */
  notified: number
}

const RETRY_MESSAGE =
  'Good news — the issue you reported has been fixed. Please try again, and let me know if anything still looks off.'

/**
 * Syncs a GitHub event back to every linked Chatwoot ticket (issues 76, 79, 80).
 * Posts a private note to each; on an auto-mode completed closure, fans the
 * "try again" message out to all affected customers (many tickets → one issue).
 */
export class LifecycleSync {
  constructor(private readonly deps: LifecycleSyncDeps) {}

  async handleEvent(event: GitHubIssueEvent): Promise<SyncOutcome> {
    const change = nextTicketState(event)
    const tickets = await this.deps.ticketing.ticketsForIssue(event.issueNumber)

    for (const ticket of tickets) {
      await this.deps.client.sendPrivateNote(ticket.conversationId, change.note)
    }

    let notified = 0
    if (shouldNotifyCustomer(event, this.deps.mode)) {
      for (const ticket of tickets) {
        await this.deps.client.sendReply(ticket.conversationId, RETRY_MESSAGE)
        notified += 1
      }
    }

    return { note: change.note, status: change.status, notified }
  }
}
