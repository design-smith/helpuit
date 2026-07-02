import { resilientFetch } from '@helpuit/resilience'
import { LlmError } from './types.js'

/** Text → vector. The semantic index's only model dependency. */
export interface EmbeddingModel {
  embed(texts: string[]): Promise<Float32Array[]>
}

export interface HttpEmbeddingOptions {
  /** Includes the version segment, e.g. https://api.openai.com/v1 or a local http://host/v1 */
  baseUrl: string
  model: string
  apiKey?: string
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[] }>
}

/**
 * Real adapter for any OpenAI-compatible `/embeddings` endpoint — OpenAI, local
 * Ollama/vLLM, and most gateways share the shape. No key configured upstream means
 * the semantic layer is simply off (the index falls back to token overlap).
 */
export class HttpEmbeddingModel implements EmbeddingModel {
  constructor(private readonly options: HttpEmbeddingOptions) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.options.apiKey !== undefined && this.options.apiKey !== '') {
      headers.authorization = `Bearer ${this.options.apiKey}`
    }
    const res = await resilientFetch(`${this.options.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.options.model, input: texts }),
    })
    if (!res.ok) throw new LlmError('embeddings', res.status, await res.text())
    const json = (await res.json()) as EmbeddingsResponse
    return (json.data ?? []).map((d) => Float32Array.from(d.embedding ?? []))
  }
}
