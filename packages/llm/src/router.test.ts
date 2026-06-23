import { describe, it, expect, afterEach } from 'vitest'
import { startTestServer, type TestServer } from './test-helpers.js'
import { ModelRouter, type ModelsRoutingConfig } from './router.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

describe('ModelRouter', () => {
  it('routes a tier to the configured provider and reaches it over real HTTP', async () => {
    srv = await startTestServer(() => ({
      choices: [{ message: { content: 'routed!' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }))

    const config: ModelsRoutingConfig = {
      provider: 'openai-compatible',
      tiers: {
        guidance: { model: 'guidance-model' },
        reasoning: { model: 'reasoning-model' },
        vision: { model: 'vision-model' },
      },
      providerKeys: { openaiCompatible: { baseUrl: srv.baseUrl, apiKey: 'k' } },
    }
    const router = new ModelRouter(config)

    const result = await router.forTier('guidance').complete({
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.text).toBe('routed!')
    expect((srv.requests[0]!.body as { model: string }).model).toBe('guidance-model')
  })

  it('honors a per-tier provider override', async () => {
    srv = await startTestServer(() => ({ choices: [{ message: { content: 'ok' } }], usage: {} }))
    const config: ModelsRoutingConfig = {
      provider: 'anthropic', // default would need an anthropic key…
      tiers: {
        guidance: { provider: 'openai-compatible', model: 'local-llm' }, // …but guidance overrides to local
        reasoning: { model: 'claude' },
        vision: { model: 'claude' },
      },
      providerKeys: { openaiCompatible: { baseUrl: srv.baseUrl } },
    }
    const router = new ModelRouter(config)

    // guidance routes to the override (no anthropic key needed to build it)
    await router.forTier('guidance').complete({ messages: [{ role: 'user', content: 'hi' }] })
    expect((srv.requests[0]!.body as { model: string }).model).toBe('local-llm')

    // the default-provider tier needs its key — building it without one throws
    expect(() => router.forTier('reasoning')).toThrow(/anthropic/)
  })
})
