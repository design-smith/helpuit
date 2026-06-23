import type { DocChunk, DocsIndex } from './docs.js'

/** A piece of source code used to ground guidance in how the product actually behaves. */
export interface CodeSnippet {
  path: string
  content: string
}

/** Supplies code relevant to a complaint (resolved via the feature manifest in prod). */
export interface CodeContextProvider {
  retrieve(complaint: string): Promise<CodeSnippet[]>
}

export interface GuidanceInput {
  complaint: string
  context: DocChunk[]
  /** Relevant source code, when a code-context provider is wired (issue 27). */
  code?: CodeSnippet[]
}

export interface GuidanceResult {
  message: string
  /** 0–1 confidence the orchestrator uses to decide resolve-vs-escalate. */
  confidence: number
}

/** The LLM behind guidance. Faked in tests; a real Claude client in production. */
export interface GuidanceModel {
  generate(input: GuidanceInput): Promise<GuidanceResult>
}

export interface GuidanceAnswer extends GuidanceResult {
  /** Doc ids the answer was grounded in (empty when nothing matched). */
  sources: string[]
  /** Source file paths the answer was grounded in (when code grounding is wired). */
  codeSources: string[]
}

/**
 * L1 guidance (issue 16): retrieve relevant docs, hand them to the model as
 * grounding, and return its answer with the sources it was given. The agent
 * never invents grounding — if retrieval is empty, the model is told so.
 *
 * When a {@link CodeContextProvider} is supplied (issue 27), the agent also
 * grounds the answer in the resolved feature's actual source code, so guidance
 * reflects how the product really behaves — not just what the docs claim.
 */
export class GuidanceAgent {
  constructor(
    private readonly index: DocsIndex,
    private readonly model: GuidanceModel,
    private readonly codeContext?: CodeContextProvider,
  ) {}

  async answer(complaint: string): Promise<GuidanceAnswer> {
    const context = this.index.retrieve(complaint)
    const code = this.codeContext !== undefined ? await this.codeContext.retrieve(complaint) : []
    const result = await this.model.generate({ complaint, context, code })
    return {
      ...result,
      sources: context.map((chunk) => chunk.id),
      codeSources: code.map((snippet) => snippet.path),
    }
  }
}
