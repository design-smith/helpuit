import { describe, it, expect, afterEach } from 'vitest'
import { startTestServer, type TestServer } from './test-helpers.js'
import { OpenAICompatibleModel } from './openai-compatible.js'
import { createGuidanceModel } from './guidance-bridge.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

describe('createGuidanceModel (integration with @helpuit/guidance)', () => {
  it('produces a grounded GuidanceResult over a real HTTP round-trip', async () => {
    srv = await startTestServer((req) => {
      // the model receives the complaint + context and returns JSON guidance
      const body = req.body as { messages: Array<{ content: string }> }
      expect(body.messages[1]!.content).toContain('click Save on billing')
      return {
        choices: [{ message: { content: '{"message":"Click Save.","confidence":0.9}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }
    })

    const chat = new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl })
    const guidance = createGuidanceModel(chat)

    const result = await guidance.generate({
      complaint: 'saving billing is broken',
      context: [{ id: 'd1', text: 'click Save on billing', score: 2 }],
    })

    expect(result.message).toBe('Click Save.')
    expect(result.confidence).toBe(0.9)
  })

  it('includes the resolved feature source code in the prompt when provided', async () => {
    let userMessage = ''
    srv = await startTestServer((req) => {
      const body = req.body as { messages: Array<{ content: string }> }
      userMessage = body.messages[1]!.content
      return { choices: [{ message: { content: '{"message":"Known bug.","confidence":0.8}' } }], usage: {} }
    })

    const guidance = createGuidanceModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))
    await guidance.generate({
      complaint: 'saving billing throws',
      context: [],
      code: [{ path: 'app/routes/billing.tsx', content: 'function save() { throw new Error("boom") }' }],
    })

    expect(userMessage).toContain('Relevant source code:')
    expect(userMessage).toContain('app/routes/billing.tsx')
    expect(userMessage).toContain('throw new Error("boom")')
  })

  it('falls back to plain text + neutral confidence when the model does not return JSON', async () => {
    srv = await startTestServer(() => ({
      choices: [{ message: { content: 'Just click Save.' } }],
      usage: {},
    }))
    const guidance = createGuidanceModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))
    const result = await guidance.generate({ complaint: 'help', context: [] })
    expect(result.message).toBe('Just click Save.')
    expect(result.confidence).toBe(0.5)
  })
})
