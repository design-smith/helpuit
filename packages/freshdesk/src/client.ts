import { resilientFetch } from '@helpuit/resilience'
import type { SupportClient } from '@helpuit/chatwoot'
import type { FreshdeskConfig } from './types.js'

/**
 * Posts to a Freshdesk ticket. `reply` = public message to the customer;
 * `notes` (private) = agent-only internal note. Auth is HTTP Basic with the API
 * key as username and any password (`apiKey:X`). `conversationId` is the ticket id.
 */
export class HttpFreshdeskClient implements SupportClient {
  constructor(private readonly config: FreshdeskConfig) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.apiKey}:X`).toString('base64')}`
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<void> {
    const base = this.config.baseUrl.replace(/\/$/, '')
    const res = await resilientFetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Freshdesk request failed: ${res.status} ${res.statusText}`)
  }

  sendReply(conversationId: string, content: string): Promise<void> {
    return this.post(`/tickets/${conversationId}/reply`, { body: content })
  }

  sendPrivateNote(conversationId: string, content: string): Promise<void> {
    return this.post(`/tickets/${conversationId}/notes`, { body: content, private: true })
  }
}
