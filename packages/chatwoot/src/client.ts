import { resilientFetch } from '@helpuit/resilience'

/** One normalized message in a conversation transcript. */
export interface ConversationMessage {
  author: 'customer' | 'agent' | 'system'
  text: string
  /** Epoch milliseconds. */
  at: number
}

/** Posts replies and private notes back to a support conversation (issue 2). */
export interface SupportClient {
  sendReply(conversationId: string, content: string): Promise<void>
  sendPrivateNote(conversationId: string, content: string): Promise<void>
}

/** @deprecated Back-compat alias — use {@link SupportClient}. */
export type ChatwootClient = SupportClient

export interface ChatwootConfig {
  baseUrl: string
  accountId: number
  apiAccessToken: string
}

/** Real Agent Bot client. Not unit-tested (needs a live Chatwoot); covered by integration. */
export class HttpChatwootClient implements ChatwootClient {
  constructor(private readonly config: ChatwootConfig) {}

  private async postMessage(
    conversationId: string,
    content: string,
    isPrivate: boolean,
  ): Promise<void> {
    const url = `${this.config.baseUrl}/api/v1/accounts/${this.config.accountId}/conversations/${conversationId}/messages`
    const res = await resilientFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: this.config.apiAccessToken,
      },
      body: JSON.stringify({ content, message_type: 'outgoing', private: isPrivate }),
    })
    if (!res.ok) {
      throw new Error(`Chatwoot message failed: ${res.status} ${res.statusText}`)
    }
  }

  sendReply(conversationId: string, content: string): Promise<void> {
    return this.postMessage(conversationId, content, false)
  }

  sendPrivateNote(conversationId: string, content: string): Promise<void> {
    return this.postMessage(conversationId, content, true)
  }

  /**
   * Read the conversation transcript. Chatwoot `message_type`: 0 incoming
   * (customer), 1 outgoing (agent, unless `private` → internal note), else
   * activity. `created_at` is unix seconds → normalized to epoch ms. Empty/activity
   * messages are dropped.
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const url = `${this.config.baseUrl}/api/v1/accounts/${this.config.accountId}/conversations/${conversationId}/messages`
    const res = await resilientFetch(url, {
      method: 'GET',
      headers: { api_access_token: this.config.apiAccessToken },
    })
    if (!res.ok) throw new Error(`Chatwoot transcript fetch failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as {
      payload?: Array<{ content?: string; message_type?: number; private?: boolean; created_at?: number }>
    }
    return (json.payload ?? [])
      .filter((m) => typeof m.content === 'string' && m.content !== '')
      .map((m) => ({
        author: m.message_type === 0 ? 'customer' : m.message_type === 1 && m.private !== true ? 'agent' : 'system',
        text: m.content as string,
        at: (m.created_at ?? 0) * 1000,
      }))
  }
}

/** Records calls instead of hitting the network — for tests and local dev. */
export class FakeChatwootClient implements ChatwootClient {
  readonly replies: Array<{ conversationId: string; content: string }> = []
  readonly notes: Array<{ conversationId: string; content: string }> = []

  async sendReply(conversationId: string, content: string): Promise<void> {
    this.replies.push({ conversationId, content })
  }

  async sendPrivateNote(conversationId: string, content: string): Promise<void> {
    this.notes.push({ conversationId, content })
  }
}
