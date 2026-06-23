import { resilientFetch } from '@helpuit/resilience'

/** Posts replies and private notes back to a Chatwoot conversation (issue 2). */
export interface ChatwootClient {
  sendReply(conversationId: number, content: string): Promise<void>
  sendPrivateNote(conversationId: number, content: string): Promise<void>
}

export interface ChatwootConfig {
  baseUrl: string
  accountId: number
  apiAccessToken: string
}

/** Real Agent Bot client. Not unit-tested (needs a live Chatwoot); covered by integration. */
export class HttpChatwootClient implements ChatwootClient {
  constructor(private readonly config: ChatwootConfig) {}

  private async postMessage(
    conversationId: number,
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

  sendReply(conversationId: number, content: string): Promise<void> {
    return this.postMessage(conversationId, content, false)
  }

  sendPrivateNote(conversationId: number, content: string): Promise<void> {
    return this.postMessage(conversationId, content, true)
  }
}

/** Records calls instead of hitting the network — for tests and local dev. */
export class FakeChatwootClient implements ChatwootClient {
  readonly replies: Array<{ conversationId: number; content: string }> = []
  readonly notes: Array<{ conversationId: number; content: string }> = []

  async sendReply(conversationId: number, content: string): Promise<void> {
    this.replies.push({ conversationId, content })
  }

  async sendPrivateNote(conversationId: number, content: string): Promise<void> {
    this.notes.push({ conversationId, content })
  }
}
