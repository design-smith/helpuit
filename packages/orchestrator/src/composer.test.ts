import { describe, it, expect } from 'vitest'
import { Composer } from './composer.js'
import type { ComposerBriefing } from './kernel.js'
import type { ChatPort } from './planner.js'

function scriptedChat(reply: string) {
  const calls: Array<{ system: string; user: string }> = []
  const chat: ChatPort & { calls: typeof calls } = {
    calls,
    async complete({ messages }) {
      calls.push({
        system: messages.find((m) => m.role === 'system')?.content ?? '',
        user: messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'),
      })
      return { text: reply }
    },
  }
  return chat
}

describe('Composer', () => {
  it('writes the reply from the briefing points + doc extracts and the customer message', async () => {
    const chat = scriptedChat('Refunds take five business days to appear on your statement.')
    const composer = new Composer(chat)

    const text = await composer.compose(
      {
        intent: 'answer',
        points: ['Refunds take five business days.'],
        docExtracts: [{ title: 'Refund policy', text: 'Refunds are processed within five business days.' }],
      },
      { customerMessage: 'how long do refunds take?' },
    )

    expect(text).toBe('Refunds take five business days to appear on your statement.')
    expect(chat.calls[0]!.user).toContain('how long do refunds take?')
    expect(chat.calls[0]!.user).toContain('Refunds take five business days.')
    expect(chat.calls[0]!.user).toContain('Refund policy')
    // The persona never mentions internal machinery to the model at all.
    expect(chat.calls[0]!.system).not.toMatch(/agent|codebase|database|planner|kernel/i)
  })

  it('the briefing type cannot carry technical payloads (the silo is compile-level)', () => {
    // @ts-expect-error — hypothesis is not expressible in a ComposerBriefing
    const smuggled: ComposerBriefing = { intent: 'answer', points: [], docExtracts: [], hypothesis: 'race condition' }
    // @ts-expect-error — suspectedFiles is not expressible in a ComposerBriefing
    const files: ComposerBriefing = { intent: 'answer', points: [], docExtracts: [], suspectedFiles: ['src/db.ts'] }
    expect(smuggled).toBeDefined()
    expect(files).toBeDefined()
  })

  it('falls back to a safe canned line when the chat model fails', async () => {
    const broken: ChatPort = {
      async complete() {
        throw new Error('provider down')
      },
    }
    const text = await new Composer(broken).compose(
      { intent: 'answer', points: ['x'], docExtracts: [] },
      { customerMessage: 'hi' },
    )
    expect(text.length).toBeGreaterThan(10)
    expect(text).not.toMatch(/provider|error|down/i)
  })
})
