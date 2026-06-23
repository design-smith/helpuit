import { describe, it, expect, afterEach } from 'vitest'
import { startTestServer, type TestServer } from './test-helpers.js'
import { OpenAICompatibleModel } from './openai-compatible.js'
import { createAccountModel } from './account-model.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

describe('createAccountModel', () => {
  it('summarizes account findings into safe text + a valid classification hint (real HTTP)', async () => {
    srv = await startTestServer(() => ({
      choices: [
        {
          message: {
            content:
              '{"summary":"You are on the Basic plan; exports are disabled.","classificationHint":"account_data_issue"}',
          },
        },
      ],
      usage: {},
    }))
    const model = createAccountModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))

    const result = await model.summarize({ findings: { getPlan: [{ plan: 'basic' }] } })

    expect(result.summary).toContain('Basic plan')
    expect(result.classificationHint).toBe('account_data_issue')
  })

  it('drops an invalid classification hint', async () => {
    srv = await startTestServer(() => ({
      choices: [{ message: { content: '{"summary":"All normal.","classificationHint":"garbage"}' } }],
      usage: {},
    }))
    const model = createAccountModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }))
    const result = await model.summarize({ findings: {} })
    expect(result.summary).toBe('All normal.')
    expect(result.classificationHint).toBeUndefined()
  })
})
