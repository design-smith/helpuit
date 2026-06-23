import { describe, it, expect } from 'vitest'
import { InMemoryDocsIndex } from './docs.js'
import {
  GuidanceAgent,
  type CodeContextProvider,
  type GuidanceInput,
  type GuidanceModel,
} from './agent.js'

/** Fake model that records the input it received and echoes a canned answer. */
function recordingModel(): GuidanceModel & { lastInput: GuidanceInput | null } {
  const state = {
    lastInput: null as GuidanceInput | null,
    async generate(input: GuidanceInput) {
      state.lastInput = input
      return { message: `answer using ${input.context.length} sources`, confidence: 0.9 }
    },
  }
  return state
}

describe('GuidanceAgent', () => {
  it('grounds the model with retrieved docs and returns its answer + sources', async () => {
    const index = new InMemoryDocsIndex()
    index.ingest([{ id: 'billing', text: 'click Save on the billing page' }])
    const model = recordingModel()
    const agent = new GuidanceAgent(index, model)

    const answer = await agent.answer('save on billing is broken')

    expect(model.lastInput?.context.map((c) => c.id)).toEqual(['billing'])
    expect(answer.message).toBe('answer using 1 sources')
    expect(answer.confidence).toBe(0.9)
    expect(answer.sources).toEqual(['billing'])
  })

  it('still calls the model with empty context when nothing matches (no invented grounding)', async () => {
    const index = new InMemoryDocsIndex()
    index.ingest([{ id: 'billing', text: 'billing page' }])
    const model = recordingModel()
    const agent = new GuidanceAgent(index, model)

    const answer = await agent.answer('xyzzy plugh')

    expect(model.lastInput?.context).toEqual([])
    expect(answer.sources).toEqual([])
    expect(answer.codeSources).toEqual([])
  })

  it('grounds the model in the resolved feature code when a code-context provider is wired', async () => {
    const index = new InMemoryDocsIndex()
    index.ingest([{ id: 'billing', text: 'click Save on the billing page' }])
    const model = recordingModel()
    const codeContext: CodeContextProvider = {
      async retrieve() {
        return [{ path: 'app/routes/billing.tsx', content: 'function save() { throw new Error("boom") }' }]
      },
    }
    const agent = new GuidanceAgent(index, model, codeContext)

    const answer = await agent.answer('save on billing is broken')

    expect(model.lastInput?.code?.map((c) => c.path)).toEqual(['app/routes/billing.tsx'])
    expect(answer.codeSources).toEqual(['app/routes/billing.tsx'])
  })
})
