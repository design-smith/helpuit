import { resilientFetch } from '@helpuit/resilience'
import type { SupportClient } from '@helpuit/chatwoot'
import type { ZendeskConfig } from './types.js'

/**
 * Posts to a Zendesk ticket by updating it with a comment: `public: true` is a
 * customer-facing reply, `public: false` an internal note. Auth is HTTP Basic with
 * the API token (`{email}/token:{apiToken}`). `conversationId` is the ticket id.
 */
export class HttpZendeskClient implements SupportClient {
  constructor(private readonly config: ZendeskConfig) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.email}/token:${this.config.apiToken}`).toString('base64')}`
  }

  private async comment(conversationId: string, body: string, isPublic: boolean): Promise<void> {
    const base = this.config.baseUrl.replace(/\/$/, '')
    const res = await resilientFetch(`${base}/tickets/${conversationId}.json`, {
      method: 'PUT',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: { comment: { body, public: isPublic } } }),
    })
    if (!res.ok) throw new Error(`Zendesk request failed: ${res.status} ${res.statusText}`)
  }

  sendReply(conversationId: string, content: string): Promise<void> {
    return this.comment(conversationId, content, true)
  }

  sendPrivateNote(conversationId: string, content: string): Promise<void> {
    return this.comment(conversationId, content, false)
  }
}
