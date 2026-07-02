import { cosine, type EmbeddingPort, type VectorStore } from '@helpuit/guidance'
import type { ChatPort } from '@helpuit/orchestrator'

export interface KnownIssueMatch {
  issueNumber: number
  title: string
}

export interface KnownIssueMatcherDeps {
  embedder: EmbeddingPort
  store: VectorStore
  chat: ChatPort
  model: string
  /** Cosine floor below which candidates never reach the confirm model. */
  threshold?: number
}

const CONFIRM_PROMPT =
  'You check whether a customer message describes the same underlying problem as a known issue. ' +
  'Respond with JSON only: {"match": true} or {"match": false}.'

/**
 * Semantic known-issue check: nearest open issue by cosine, then a cheap model
 * confirm so a lexical near-miss never short-circuits a real investigation.
 * Any failure (embedder down, garbage confirm) means "no match" — the normal
 * planning flow is never blocked. ponytail: matches the 'issue' namespace only;
 * open-case matches have no issue to attach to — extend when "others reported
 * this too" phrasing is wanted.
 */
export class KnownIssueMatcher {
  constructor(private readonly deps: KnownIssueMatcherDeps) {}

  async match(text: string): Promise<KnownIssueMatch | null> {
    let vector: Float32Array | undefined
    try {
      vector = (await this.deps.embedder.embed([text]))[0]
    } catch {
      return null
    }
    if (vector === undefined) return null

    const rows = await this.deps.store.loadKind('issue')
    let best: { ownerId: string; text: string; score: number } | undefined
    for (const row of rows) {
      const score = cosine(vector, row.vector)
      if (best === undefined || score > best.score) best = { ownerId: row.ownerId, text: row.text, score }
    }
    if (best === undefined || best.score < (this.deps.threshold ?? 0.75)) return null

    try {
      const { text: raw } = await this.deps.chat.complete({
        messages: [
          { role: 'system', content: CONFIRM_PROMPT },
          { role: 'user', content: `Customer message:\n${text}\n\nKnown issue #${best.ownerId}:\n${best.text}` },
        ],
        maxTokens: 50,
      })
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start === -1 || end <= start) return null
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { match?: unknown }
      if (parsed.match !== true) return null
    } catch {
      return null
    }

    const issueNumber = Number(best.ownerId)
    if (!Number.isInteger(issueNumber)) return null
    return { issueNumber, title: best.text.split('\n')[0] ?? '' }
  }
}
