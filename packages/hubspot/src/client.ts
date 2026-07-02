import { resilientFetch } from '@helpuit/resilience'
import type { SupportClient } from '@helpuit/chatwoot'
import type { HubSpotConfig, HubSpotMessage } from './types.js'

const DEFAULT_BASE = 'https://api.hubapi.com'

/**
 * Posts to a HubSpot Conversations thread. A public reply is a `MESSAGE` sent
 * through the thread's own channel (read off the latest message, since the send
 * endpoint requires channelId + channelAccountId). An internal note is a `COMMENT`.
 * `conversationId` is the thread id; attribution is the configured `senderActorId`.
 */
export class HttpHubSpotClient implements SupportClient {
  constructor(private readonly config: HubSpotConfig) {}

  private base(): string {
    return (this.config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private async post(threadId: string, body: Record<string, unknown>): Promise<void> {
    const res = await resilientFetch(`${this.base()}/conversations/v3/conversations/threads/${threadId}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HubSpot request failed: ${res.status} ${res.statusText}`)
  }

  async sendReply(conversationId: string, content: string): Promise<void> {
    // A MESSAGE must echo the channel it goes out on; read it from the latest message.
    const res = await resilientFetch(
      `${this.base()}/conversations/v3/conversations/threads/${conversationId}/messages?limit=10`,
      { headers: this.headers() },
    )
    if (!res.ok) throw new Error(`HubSpot request failed: ${res.status} ${res.statusText}`)
    const { results = [] } = (await res.json()) as { results?: HubSpotMessage[] }
    const channelled = [...results].reverse().find((m) => m.channelId !== undefined && m.channelAccountId !== undefined)
    if (channelled === undefined) throw new Error(`HubSpot thread ${conversationId} has no channel to reply through`)
    await this.post(conversationId, {
      type: 'MESSAGE',
      text: content,
      richText: content,
      senderActorId: this.config.senderActorId,
      channelId: channelled.channelId,
      channelAccountId: channelled.channelAccountId,
    })
  }

  // ponytail: COMMENT is prohibited on Help Desk threads from 2026-09-23 (works today
  //   on Conversations-inbox threads). Upgrade path: CRM Notes API associated via the
  //   thread's associatedTicketId. See the HubSpot conversations breaking-change changelog.
  sendPrivateNote(conversationId: string, content: string): Promise<void> {
    return this.post(conversationId, { type: 'COMMENT', text: content, senderActorId: this.config.senderActorId })
  }
}
