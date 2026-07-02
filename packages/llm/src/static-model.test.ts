import { describe, it, expect, afterEach } from 'vitest'
import { startTestServer, type TestServer } from './test-helpers.js'
import { OpenAICompatibleModel } from './openai-compatible.js'
import { createStaticAnalysisModel } from './static-model.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

describe('createStaticAnalysisModel', () => {
  it('produces hypothesis + suspected files + confidence (real HTTP)', async () => {
    srv = await startTestServer(() => ({
      choices: [
        {
          message: {
            content:
              '{"hypothesis":"null deref in the save handler","suspectedFiles":["BillingForm.vue"],"confidence":0.85}',
          },
        },
      ],
      usage: {},
    }))
    const model = createStaticAnalysisModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))

    const result = await model.analyze({
      complaint: 'save is broken',
      feature: 'Billing',
      code: { 'BillingForm.vue': 'function save() {}' },
    })

    expect(result.hypothesis).toContain('null deref')
    expect(result.suspectedFiles).toContain('BillingForm.vue')
    expect(result.confidence).toBe(0.85)
  })

  it('falls back to low confidence + the retrieved files when the model returns no JSON', async () => {
    srv = await startTestServer(() => ({ choices: [{ message: { content: 'not sure' } }], usage: {} }))
    const model = createStaticAnalysisModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))
    const result = await model.analyze({ complaint: 'x', code: { 'a.ts': 'y' } })
    expect(result.confidence).toBe(0.2)
    expect(result.suspectedFiles).toEqual(['a.ts'])
    expect(result.verdict).toBe('explains_behavior') // prose fallback never invents a bug
  })

  it('returns BOTH layers: technical (hypothesis/files) and product-language (explanation + verdict)', async () => {
    srv = await startTestServer(() => ({
      choices: [
        {
          message: {
            content:
              '{"hypothesis":"export gate checks subscription.active","suspectedFiles":["export.ts"],"confidence":0.7,"explanation":"Exports are only available on an active subscription — renewing re-enables the button.","verdict":"user_error_or_prerequisite"}',
          },
        },
      ],
      usage: {},
    }))
    const model = createStaticAnalysisModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))

    const result = await model.analyze({ complaint: 'export button greyed out', code: { 'export.ts': '...' } })

    expect(result.verdict).toBe('user_error_or_prerequisite')
    expect(result.explanation).toContain('active subscription')
    expect(result.hypothesis).toContain('subscription.active')
  })

  it('degrades a missing/bogus verdict to explains_behavior and defaults the explanation from the hypothesis', async () => {
    srv = await startTestServer(() => ({
      choices: [
        { message: { content: '{"hypothesis":"timeout in webhook retry","suspectedFiles":[],"confidence":0.5,"verdict":"launch_missiles"}' } },
      ],
      usage: {},
    }))
    const model = createStaticAnalysisModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))

    const result = await model.analyze({ complaint: 'x', code: {} })

    expect(result.verdict).toBe('explains_behavior')
    expect(result.explanation).toContain('timeout in webhook retry')
  })
})
