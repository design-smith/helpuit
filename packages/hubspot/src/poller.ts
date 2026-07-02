import { resilientFetch } from '@helpuit/resilience'
import type { HubSpotConfig, HubSpotMessage, HubSpotThread } from './types.js'

/** A customer message discovered by polling — normalized for enqueue + dedup. */
export interface PolledMessage {
  messageId: string
  conversationId: string
  content: string
  requesterId?: string
}

const DEFAULT_BASE = 'https://api.hubapi.com'

function toText(input: string): string {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * HubSpot Conversations has no simple inbound webhook for our purpose, so we poll:
 * list threads with recent activity, then read each thread's messages. Only INCOMING
 * messages from a visitor/contact actor are returned (OUTGOING and agent/app actors
 * are our own — loop-safety), and only those newer than the cursor.
 */
export class HubSpotPoller {
  constructor(private readonly config: HubSpotConfig) {}

  private base(): string {
    return (this.config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
  }

  private async get<T>(path: string): Promise<T> {
    const res = await resilientFetch(`${this.base()}${path}`, {
      headers: { Authorization: `Bearer ${this.config.accessToken}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HubSpot request failed: ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  }

  async poll(sinceIso: string): Promise<PolledMessage[]> {
    const sinceMs = Date.parse(sinceIso)
    // ponytail: assumes the threads list honors latestMessageTimestampAfter; verify against
    //   a live inbox. messageId dedup (in the poll loop) is the real safety if it's loose.
    const threads = await this.get<{ results?: HubSpotThread[] }>(
      `/conversations/v3/conversations/threads?latestMessageTimestampAfter=${encodeURIComponent(sinceIso)}&limit=100`,
    )
    const out: PolledMessage[] = []
    for (const thread of threads.results ?? []) {
      if (thread.id === undefined) continue
      const msgs = await this.get<{ results?: HubSpotMessage[] }>(
        `/conversations/v3/conversations/threads/${thread.id}/messages?limit=100`,
      )
      for (const m of msgs.results ?? []) {
        if (m.direction !== 'INCOMING' || m.id === undefined) continue
        const actorId = m.senders?.[0]?.actorId
        if (actorId !== undefined && (actorId.startsWith('A-') || actorId.startsWith('S-'))) continue // agent/app
        if (m.createdAt !== undefined && !Number.isNaN(sinceMs) && Date.parse(m.createdAt) <= sinceMs) continue
        const text = (m.text ?? '').trim()
        const content = text !== '' ? text : toText(m.richText ?? '')
        if (content === '') continue
        out.push({ messageId: m.id, conversationId: thread.id, content, requesterId: actorId })
      }
    }
    return out
  }
}
