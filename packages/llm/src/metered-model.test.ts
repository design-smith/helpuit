import { describe, it, expect, afterEach } from 'vitest'
import { SpendLedger, BudgetGovernor, BudgetExceededError } from '@helpuit/budget'
import { startTestServer, type TestServer } from './test-helpers.js'
import { OpenAICompatibleModel } from './openai-compatible.js'
import { MeteredChatModel } from './metered-model.js'

let srv: TestServer | undefined
afterEach(() => srv?.close())

const T = Date.UTC(2026, 0, 1, 12)

async function model(ledger: SpendLedger, governor: BudgetGovernor) {
  srv = await startTestServer(() => ({
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 5, completion_tokens: 5 },
  }))
  return new MeteredChatModel(new OpenAICompatibleModel({ model: 'm', baseUrl: srv.baseUrl }), {
    ledger,
    governor,
    now: () => T,
  })
}

describe('MeteredChatModel', () => {
  it('records token usage and allows calls under the cap', async () => {
    const ledger = new SpendLedger()
    const chat = await model(ledger, new BudgetGovernor({ perDay: 100 }, ledger))

    const result = await chat.complete({ messages: [{ role: 'user', content: 'hi' }] })

    expect(result.text).toBe('ok')
    expect(ledger.totalForPeriod('day', T)).toBe(10) // 5 in + 5 out
  })

  it('throws BudgetExceededError once a cap is reached, before calling the model', async () => {
    const ledger = new SpendLedger()
    ledger.record({ investigationId: 'global', amount: 100, at: T }) // already at the day cap
    const chat = await model(ledger, new BudgetGovernor({ perDay: 100 }, ledger))

    await expect(chat.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrowError(
      BudgetExceededError,
    )
    // no extra spend was recorded
    expect(ledger.totalForPeriod('day', T)).toBe(100)
  })
})
