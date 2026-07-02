import { InMemoryDocsIndex, type Doc, type DocChunk, type DocsIndex } from './docs.js'

/** Structural slice of the embedding model (satisfied by @helpuit/llm's HttpEmbeddingModel). */
export interface EmbeddingPort {
  embed(texts: string[]): Promise<Float32Array[]>
}

/** Structural slice of the vector store (satisfied by @helpuit/db's DrizzleEmbeddingRepository). */
export interface VectorStore {
  replaceForOwner(
    ownerKind: string,
    ownerId: string,
    chunks: Array<{ seq: number; text: string; vector: Float32Array; model: string }>,
  ): Promise<void>
  loadKind(ownerKind: string): Promise<Array<{ ownerId: string; seq: number; text: string; vector: Float32Array }>>
  removeOwner(ownerKind: string, ownerId: string): Promise<void>
}

/** Split on blank lines and greedily pack paragraphs up to ~maxChars per chunk. */
export function chunkText(text: string, maxChars = 1500): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current !== '' && current.length + p.length + 2 > maxChars) {
      chunks.push(current)
      current = p
    } else {
      current = current === '' ? p : `${current}\n\n${p}`
    }
  }
  if (current !== '') chunks.push(current)
  return chunks
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * Semantic retrieval over the same `DocsIndex` interface: cosine over stored chunk
 * vectors, merged with token-overlap fallback for docs that aren't embedded (yet,
 * or whose embedding failed) — coverage never drops below today's behavior.
 * Embedding runs fire-and-forget off the ingest path; `flush()` awaits it (tests,
 * sweeps). ponytail: brute-force scan in memory — single-tenant scale is
 * hundreds–low-thousands of chunks; sqlite-vec behind VectorStore if that changes.
 */
export class SemanticDocsIndex implements DocsIndex {
  private readonly fallback = new InMemoryDocsIndex()
  private pending: Array<Promise<unknown>> = []

  constructor(
    private readonly deps: { embedder: EmbeddingPort; store: VectorStore; model: string },
  ) {}

  ingest(docs: Doc[]): void {
    this.fallback.ingest(docs)
    for (const doc of docs) this.queue(doc)
  }

  upsert(doc: Doc): void {
    this.fallback.upsert(doc)
    this.queue(doc)
  }

  removeById(id: string): void {
    this.fallback.removeById(id)
    this.pending.push(this.deps.store.removeOwner('doc', id).catch(() => {}))
  }

  /** Await all in-flight embedding work (tests + the daily sweep). */
  async flush(): Promise<void> {
    const work = this.pending
    this.pending = []
    await Promise.all(work)
  }

  async retrieve(query: string, k = 3): Promise<DocChunk[]> {
    let queryVector: Float32Array | undefined
    try {
      queryVector = (await this.deps.embedder.embed([query]))[0]
    } catch {
      queryVector = undefined // embedder down → pure token-overlap
    }

    const embedded = new Set<string>()
    const semantic: DocChunk[] = []
    if (queryVector !== undefined) {
      const rows = await this.deps.store.loadKind('doc')
      const best = new Map<string, DocChunk>()
      for (const row of rows) {
        embedded.add(row.ownerId)
        const score = cosine(queryVector, row.vector)
        const prior = best.get(row.ownerId)
        if (score > 0 && (prior === undefined || score > prior.score)) {
          best.set(row.ownerId, { id: row.ownerId, text: row.text, score })
        }
      }
      semantic.push(...[...best.values()].sort((a, b) => b.score - a.score).slice(0, k))
    }

    // Token-overlap covers whatever isn't embedded (failed/pending/embedder-off).
    const fallbackHits = this.fallback.retrieve(query, k).filter((h) => !embedded.has(h.id))
    return [...semantic, ...fallbackHits].slice(0, k)
  }

  private queue(doc: Doc): void {
    this.pending.push(this.embedDoc(doc).catch(() => {})) // failure ⇒ fallback still covers the doc
  }

  private async embedDoc(doc: Doc): Promise<void> {
    const chunks = chunkText(`${doc.title !== undefined ? `${doc.title}\n\n` : ''}${doc.text}`)
    if (chunks.length === 0) return
    const vectors = await this.deps.embedder.embed(chunks)
    await this.deps.store.replaceForOwner(
      'doc',
      doc.id,
      chunks.map((text, seq) => ({ seq, text, vector: vectors[seq] ?? Float32Array.from([]), model: this.deps.model })),
    )
  }
}
