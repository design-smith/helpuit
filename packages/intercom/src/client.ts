import { resilientFetch } from '@helpuit/resilience'
import type { SupportClient } from '@helpuit/chatwoot'

export interface IntercomConfig {
  accessToken: string
  /** The bot/admin teammate id replies post under. */
  adminId: string
  /** Region base URL; defaults to US. EU: https://api.eu.intercom.io · AU: https://api.au.intercom.io */
  baseUrl?: string
}

const DEFAULT_BASE = 'https://api.intercom.io'

/**
 * Posts to an Intercom conversation via `POST /conversations/{id}/reply`.
 * `comment` = public reply to the customer; `note` = admin-only internal note.
 * Attribution is the `admin_id` (a bot/teammate). `conversationId` is Intercom's
 * native id — the registry strips any `connectionId:` prefix before calling here.
 */
export class HttpIntercomClient implements SupportClient {
  constructor(private readonly config: IntercomConfig) {}

  private async reply(conversationId: string, body: string, messageType: 'comment' | 'note'): Promise<void> {
    const base = (this.config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '')
    const res = await resilientFetch(`${base}/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Intercom-Version': '2.11',
      },
      body: JSON.stringify({ message_type: messageType, type: 'admin', admin_id: this.config.adminId, body }),
    })
    if (!res.ok) throw new Error(`Intercom reply failed: ${res.status} ${res.statusText}`)
  }

  sendReply(conversationId: string, content: string): Promise<void> {
    return this.reply(conversationId, content, 'comment')
  }

  sendPrivateNote(conversationId: string, content: string): Promise<void> {
    return this.reply(conversationId, content, 'note')
  }
}
