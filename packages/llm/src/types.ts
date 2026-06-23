export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompleteOptions {
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
}

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface CompletionResult {
  text: string
  usage: Usage
}

/** Provider-agnostic chat-completion model. Every adapter implements this. */
export interface ChatModel {
  complete(options: CompleteOptions): Promise<CompletionResult>
}

export class LlmError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    detail: string,
  ) {
    super(`${provider} request failed (${status}): ${detail}`)
    this.name = 'LlmError'
  }
}
