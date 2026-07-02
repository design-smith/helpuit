import { describe, it, expect } from 'vitest'
import { Planner, type ChatPort } from './planner.js'

/** Scripted chat model: returns canned responses in order, records every call. */
function scriptedChat(responses: string[]): ChatPort & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = []
  return {
    calls,
    async complete({ messages }) {
      calls.push({
        system: messages.find((m) => m.role === 'system')?.content ?? '',
        user: messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'),
      })
      return { text: responses[Math.min(calls.length - 1, responses.length - 1)]! }
    },
  }
}

const VALID = '{"directives":[{"kind":"consult_docs","query":"refund policy"}]}'

describe('Planner', () => {
  it('returns the validated plan and briefs the model with message + findings + denials', async () => {
    const chat = scriptedChat([VALID])
    const planner = new Planner(chat)

    const plan = await planner.plan({
      message: 'how do refunds work?',
      findings: [{ summary: 'Docs cover billing but not refunds.' }],
      denials: ['the account agent is not wired'],
      identity: 'anonymous',
    })

    expect(plan?.directives[0]).toEqual({ kind: 'consult_docs', query: 'refund policy' })
    expect(chat.calls[0]!.user).toContain('how do refunds work?')
    expect(chat.calls[0]!.user).toContain('Docs cover billing but not refunds.')
    expect(chat.calls[0]!.user).toContain('the account agent is not wired')
  })

  it('retries ONCE quoting the validation issues, then gives up with null', async () => {
    const invalidThenValid = scriptedChat(['I think we should look at the docs.', VALID])
    const plan = await new Planner(invalidThenValid).plan({ message: 'hi', findings: [], denials: [], identity: 'anonymous' })
    expect(plan).not.toBeNull()
    expect(invalidThenValid.calls).toHaveLength(2)
    expect(invalidThenValid.calls[1]!.user).toMatch(/JSON/i) // the issues are quoted back

    const alwaysInvalid = scriptedChat(['nope', 'still nope'])
    const failed = await new Planner(alwaysInvalid).plan({ message: 'hi', findings: [], denials: [], identity: 'anonymous' })
    expect(failed).toBeNull()
    expect(alwaysInvalid.calls).toHaveLength(2) // exactly one retry, never a loop
  })
})
