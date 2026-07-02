import type { HelpuitConfig } from '@helpuit/config'
import { HttpEmbeddingModel } from '@helpuit/llm'

export interface ResolvedEmbedder {
  embedder: HttpEmbeddingModel
  model: string
}

/**
 * Resolve the semantic index's embedding model from config, or undefined when it
 * can't run: no `models.embedding`, LLM integration off, a provider without an
 * OpenAI-style /embeddings API, or a missing credential. Absent ⇒ every semantic
 * feature degrades silently to token-overlap retrieval / no known-issue matching.
 */
export function buildEmbedder(config: HelpuitConfig): ResolvedEmbedder | undefined {
  // Tolerates partial configs (tests hand-build them without a models node).
  const embedding = config.models?.embedding
  if (embedding === undefined || !config.integrations.llm) return undefined

  const provider = embedding.provider ?? config.models.provider
  const keys = config.models.providerKeys
  if (provider === 'openai' && keys.openai !== undefined && keys.openai !== '') {
    return {
      embedder: new HttpEmbeddingModel({ baseUrl: 'https://api.openai.com/v1', apiKey: keys.openai, model: embedding.model }),
      model: embedding.model,
    }
  }
  const compat = keys.openaiCompatible
  if (provider === 'openai-compatible' && compat?.baseUrl !== undefined && compat.baseUrl !== '') {
    return {
      embedder: new HttpEmbeddingModel({ baseUrl: compat.baseUrl, apiKey: compat.apiKey, model: embedding.model }),
      model: embedding.model,
    }
  }
  return undefined
}
