import { chunkText, type EmbeddingPort, type VectorStore } from '@helpuit/guidance'
import { parseCaseMemory } from '@helpuit/orchestrator'

export interface IssueSyncDeps {
  listIssues(): Promise<Array<{ number: number; title: string; body: string }>>
  embedder: EmbeddingPort
  store: VectorStore
  model: string
}

/**
 * Embed every open issue into the 'issue' namespace; issues no longer open drop
 * out of the match pool. Runs at boot and on the daily sweep.
 * ponytail: re-embeds all open issues each sweep — delta-hash if it ever gets slow.
 */
export async function syncIssueEmbeddings(deps: IssueSyncDeps): Promise<{ embedded: number; removed: number }> {
  const open = await deps.listIssues()
  const openIds = new Set(open.map((issue) => String(issue.number)))
  for (const issue of open) {
    const chunks = chunkText(`${issue.title}\n\n${issue.body}`)
    if (chunks.length === 0) continue
    const vectors = await deps.embedder.embed(chunks)
    await deps.store.replaceForOwner(
      'issue',
      String(issue.number),
      chunks.map((text, seq) => ({ seq, text, vector: vectors[seq] ?? Float32Array.from([]), model: deps.model })),
    )
  }
  const stale = new Set(
    (await deps.store.loadKind('issue')).map((row) => row.ownerId).filter((id) => !openIds.has(id)),
  )
  for (const id of stale) await deps.store.removeOwner('issue', id)
  return { embedded: openIds.size, removed: stale.size }
}

export interface CaseEmbedDeps {
  embedder: EmbeddingPort
  store: VectorStore
  model: string
}

interface CaseStoreSlice {
  saveCase(id: string, json: string): Promise<void>
  setStatus(id: string, status: string): Promise<unknown>
}

/**
 * Decorate an investigation repository so case memory joins the 'case' match pool
 * on save and leaves it the moment the case concludes. Embedding is fire-and-forget
 * off the save path (a down embedder never blocks a reply); `flushEmbeds()` awaits it.
 * ponytail: delegates untouched methods via the prototype (Object.create) instead of
 * re-listing all nine — the wrapper is the only handle wiring hands out.
 */
export function withCaseEmbedding<R extends CaseStoreSlice>(
  repo: R,
  deps: CaseEmbedDeps,
): R & { flushEmbeds(): Promise<void> } {
  let pending: Array<Promise<unknown>> = []

  const embedCase = async (id: string, json: string): Promise<void> => {
    const memory = parseCaseMemory(json)
    const text = [memory.complaint, memory.notes].filter((part) => part !== undefined && part !== '').join('\n\n')
    if (text === '') return
    const chunks = chunkText(text)
    const vectors = await deps.embedder.embed(chunks)
    await deps.store.replaceForOwner(
      'case',
      id,
      chunks.map((chunk, seq) => ({ seq, text: chunk, vector: vectors[seq] ?? Float32Array.from([]), model: deps.model })),
    )
  }

  const wrapped = Object.create(repo) as R & { flushEmbeds(): Promise<void> }
  wrapped.saveCase = async (id: string, json: string): Promise<void> => {
    await repo.saveCase(id, json)
    pending.push(embedCase(id, json).catch(() => {}))
  }
  wrapped.setStatus = (async (id: string, status: string) => {
    const result = await repo.setStatus(id, status)
    if (status !== 'open') pending.push(deps.store.removeOwner('case', id).catch(() => {}))
    return result
  }) as R['setStatus']
  wrapped.flushEmbeds = async (): Promise<void> => {
    const work = pending
    pending = []
    await Promise.all(work)
  }
  return wrapped
}
