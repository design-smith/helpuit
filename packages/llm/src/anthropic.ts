import { LlmError, type ChatModel, type CompleteOptions, type CompletionResult } from './types.js'

export interface AnthropicOptions {
  apiKey: string
  model: string
  baseUrl?: string
  version?: string
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

/** Real Anthropic Messages API adapter (raw fetch — `baseUrl` override makes it testable). */
export class AnthropicModel implements ChatModel {
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string
  private readonly version: string

  constructor(options: AnthropicOptions) {
    this.apiKey = options.apiKey
    this.model = options.model
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com'
    this.version = options.version ?? '2023-06-01'
  }

  async complete(options: CompleteOptions): Promise<CompletionResult> {
    const system = options.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.version,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        ...(system !== '' ? { system } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        messages,
      }),
    })

    if (!res.ok) throw new LlmError('anthropic', res.status, await res.text())

    const json = (await res.json()) as AnthropicResponse
    const text = (json.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
    return {
      text,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    }
  }
}
