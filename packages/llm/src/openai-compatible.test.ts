import { describe, it, expect, afterEach } from 'vitest'
import { startTestServer, type TestServer } from './test-helpers.js'
import { OpenAICompatibleModel } from './openai-compatible.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

describe('OpenAICompatibleModel', () => {
  it('makes a real request to /chat/completions and parses content + usage', async () => {
    srv = await startTestServer(() => ({
      choices: [{ message: { content: 'Invite from the team settings page.' } }],
      usage: { prompt_tokens: 9, completion_tokens: 5 },
    }))

    const model = new OpenAICompatibleModel({ apiKey: 'sk', model: 'gpt-x', baseUrl: srv.baseUrl })
    const result = await model.complete({ messages: [{ role: 'user', content: 'invite teammate?' }] })

    expect(result.text).toContain('team settings')
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 5 })

    const req = srv.requests[0]!
    expect(req.url).toBe('/chat/completions')
    expect(req.headers.authorization).toBe('Bearer sk')
    expect((req.body as { model: string }).model).toBe('gpt-x')
  })

  it('omits the Authorization header when no api key is set (local models)', async () => {
    srv = await startTestServer(() => ({ choices: [{ message: { content: 'ok' } }], usage: {} }))
    const model = new OpenAICompatibleModel({ model: 'llama3', baseUrl: srv.baseUrl })
    await model.complete({ messages: [{ role: 'user', content: 'hi' }] })
    expect(srv.requests[0]!.headers.authorization).toBeUndefined()
  })
})
