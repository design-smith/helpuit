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
  })
})
