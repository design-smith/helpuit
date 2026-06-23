import { resilientFetch } from '@helpuit/resilience'
import { LlmError, type ChatModel, type CompleteOptions, type CompletionResult } from './types.js'

export interface OpenAICompatibleOptions {
  apiKey?: string
  model: string
  /** Includes the version segment, e.g. https://api.openai.com/v1 or a local http://host/v1 */
  baseUrl: string
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * Real adapter for any OpenAI-compatible chat-completions API — serves OpenAI,
 * DeepSeek, and local servers (Ollama/vLLM/LM Studio) by varying `baseUrl`/`model`.
 */
export class OpenAICompatibleModel implements ChatModel {
  constructor(private readonly options: OpenAICompatibleOptions) {}

  async complete(options: CompleteOptions): Promise<CompletionResult> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.options.apiKey !== undefined && this.options.apiKey !== '') {
      headers.authorization = `Bearer ${this.options.apiKey}`
    }

    const res = await resilientFetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.options.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? 1024,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      }),
    })

    if (!res.ok) throw new LlmError('openai-compatible', res.status, await res.text())

    const json = (await res.json()) as OpenAIResponse
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    }
  }
}
