import { ModelRouter, LlmError, type ModelsRoutingConfig } from '@helpuit/llm'

export interface LlmTestResult {
  ok: boolean
  /** The provider that was exercised (the guidance tier's, or the default). */
  provider: string
  /** Human-readable outcome — a success note, or the failure reason. */
  detail: string
  /** Token usage on success — proof a real completion happened. */
  usage?: { inputTokens: number; outputTokens: number }
}

const PROBE = 'Reply with the single word: ok'

/**
 * Makes a REAL completion call through the model router (FCW-09) to verify the
 * configured provider + key actually work — so a bad key fails here, loudly, at
 * setup, instead of silently at the first customer message. Uses the guidance
 * tier (the cheapest, always-present model). The router runs lenient, so an unset
 * key returns a `LazyMissingKeyModel` whose `complete` throws a clear error —
 * surfaced as `ok: false` rather than a crash.
 */
export async function testLlm(models: ModelsRoutingConfig): Promise<LlmTestResult> {
  const provider = models.tiers.guidance.provider ?? models.provider
  const router = new ModelRouter(models, { lenient: true })
  try {
    const result = await router.forTier('guidance').complete({
      messages: [{ role: 'user', content: PROBE }],
      maxTokens: 16,
      temperature: 0,
    })
    return { ok: true, provider, detail: 'Model responded successfully.', usage: result.usage }
  } catch (error) {
    const detail =
      error instanceof LlmError ? error.message : error instanceof Error ? error.message : String(error)
    return { ok: false, provider, detail }
  }
}
