import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client'

/**
 * Helpuit's metrics surface. A thin, deep wrapper over a private prom-client
 * registry: callers record domain events (an investigation outcome, an inbound
 * webhook, an LLM call's latency/tokens) and never touch prom-client directly.
 * `text()` renders the Prometheus exposition format for a `/metrics` scrape.
 */
export interface Metrics {
  /** An investigation finished with the given orchestrator outcome. */
  recordOutcome(outcome: string): void
  /** An inbound webhook was received from a source (`chatwoot` | `github`). */
  recordWebhook(source: string): void
  /** An LLM call completed: its provider tier, token count, and wall-clock seconds. */
  recordLlmCall(tier: string, tokens: number, seconds: number): void
  /** Prometheus exposition text for a `/metrics` scrape. */
  text(): Promise<string>
  /** Content-Type a `/metrics` endpoint should return. */
  contentType: string
}

export function createMetrics(options: { defaultMetrics?: boolean } = {}): Metrics {
  const registry = new Registry()

  // Default process/runtime metrics (event loop lag, heap, GC, …) are valuable in
  // prod but noisy in tests, so they are opt-in.
  if (options.defaultMetrics) collectDefaultMetrics({ register: registry })

  const outcomes = new Counter({
    name: 'helpuit_outcomes_total',
    help: 'Investigations completed, by orchestrator outcome.',
    labelNames: ['outcome'],
    registers: [registry],
  })
  const webhooks = new Counter({
    name: 'helpuit_webhooks_total',
    help: 'Inbound webhooks received, by source.',
    labelNames: ['source'],
    registers: [registry],
  })
  const llmTokens = new Counter({
    name: 'helpuit_llm_tokens_total',
    help: 'LLM tokens consumed, by provider tier.',
    labelNames: ['tier'],
    registers: [registry],
  })
  const llmLatency = new Histogram({
    name: 'helpuit_llm_call_seconds',
    help: 'LLM call latency in seconds, by provider tier.',
    labelNames: ['tier'],
    buckets: [0.25, 0.5, 1, 2, 4, 8, 16, 32],
    registers: [registry],
  })

  return {
    recordOutcome: (outcome) => outcomes.inc({ outcome }),
    recordWebhook: (source) => webhooks.inc({ source }),
    recordLlmCall: (tier, tokens, seconds) => {
      llmTokens.inc({ tier }, tokens)
      llmLatency.observe({ tier }, seconds)
    },
    text: () => registry.metrics(),
    contentType: registry.contentType,
  }
}
