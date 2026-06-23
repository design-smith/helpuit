import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { ModelsRoutingConfig } from '@helpuit/llm'
import { testLlm } from './llm-test.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

/** A real OpenAI-compatible chat-completions server. */
async function llmServer(): Promise<string> {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 6, completion_tokens: 1 },
      }),
    )
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
}

function models(over: Partial<ModelsRoutingConfig['providerKeys']> = {}): ModelsRoutingConfig {
  return {
    provider: 'openai-compatible',
    tiers: { guidance: { model: 'local' }, reasoning: { model: 'local' }, vision: { model: 'local' } },
    providerKeys: { ...over },
  }
}

describe('testLlm', () => {
  it('makes a real completion through the router and reports ok with token usage', async () => {
    const base = await llmServer()

    const result = await testLlm(models({ openaiCompatible: { baseUrl: `${base}/v1`, apiKey: 'k' } }))

    expect(result.ok).toBe(true)
    expect(result.provider).toBe('openai-compatible')
    expect(result.usage?.outputTokens).toBe(1)
  })

  it('reports a clear failure when no key/endpoint is configured (not silently at message time)', async () => {
    // openai-compatible with no baseUrl → lenient router yields a model that fails
    // clearly on use, with no network call.
    const result = await testLlm(models())

    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/no api key/i)
  })
})
