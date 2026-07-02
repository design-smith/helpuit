import { describe, it, expect, afterEach } from 'vitest'
import { createDb, DrizzleEmbeddingRepository, type DbHandle } from '@helpuit/db'
import { KnownIssueMatcher } from './known-issue.js'

let handle: DbHandle | undefined
afterEach(() => handle?.close())

const embedder = {
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => (t.includes('export') ? Float32Array.from([1, 0]) : Float32Array.from([0, 1])))
  },
}

function scriptedChat(responses: string[]) {
  const calls: string[] = []
  return {
    calls,
    async complete({ messages }: { messages: Array<{ role: string; content: string }> }) {
      calls.push(messages.map((m) => m.content).join('\n'))
      return { text: responses[Math.min(calls.length - 1, responses.length - 1)] ?? '' }
    },
  }
}

async function seededStore() {
  handle = await createDb(':memory:')
  const store = new DrizzleEmbeddingRepository(handle.db, () => 1000)
  await store.replaceForOwner('issue', '7', [
    { seq: 0, text: 'Large export stalls\n\nexport never finishes', vector: Float32Array.from([1, 0]), model: 'e1' },
  ])
  return store
}

describe('KnownIssueMatcher', () => {
  it('matches a same-symptom message to the open issue once the model confirms', async () => {
    const store = await seededStore()
    const chat = scriptedChat(['{"match": true}'])
    const matcher = new KnownIssueMatcher({ embedder, store, chat, model: 'e1' })

    const match = await matcher.match('my export hangs at 99% and never completes')

    expect(match).toEqual({ issueNumber: 7, title: 'Large export stalls' })
    expect(chat.calls[0]).toContain('export never finishes') // the model saw the candidate
  })

  it('does not short-circuit when the model refutes the candidate', async () => {
    const store = await seededStore()
    const matcher = new KnownIssueMatcher({ embedder, store, chat: scriptedChat(['{"match": false}']), model: 'e1' })
    expect(await matcher.match('my export hangs')).toBeNull()
  })

  it('skips the model entirely below the similarity threshold', async () => {
    const store = await seededStore()
    const chat = scriptedChat(['{"match": true}'])
    const matcher = new KnownIssueMatcher({ embedder, store, chat, model: 'e1' })

    expect(await matcher.match('I cannot log in')).toBeNull()
    expect(chat.calls).toHaveLength(0)
  })

  it('treats model garbage as no match (never blocks the normal flow)', async () => {
    const store = await seededStore()
    const matcher = new KnownIssueMatcher({ embedder, store, chat: scriptedChat(['definitely!']), model: 'e1' })
    expect(await matcher.match('my export hangs')).toBeNull()
  })
})
