export interface Doc {
  id: string
  text: string
  title?: string
}

export interface DocChunk {
  id: string
  text: string
  title?: string
  score: number
}

export interface DocsIndex {
  ingest(docs: Doc[]): void
  /** Insert or replace a single doc by id (live refresh — no duplicate). */
  upsert(doc: Doc): void
  /** Drop a doc from the index by id. */
  removeById(id: string): void
  retrieve(query: string, k?: number): DocChunk[]
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

/**
 * In-memory docs index with token-overlap ranking (issues 14, 15). A real
 * embeddings-backed index can implement the same `DocsIndex` interface later;
 * this baseline is deterministic and testable.
 */
export class InMemoryDocsIndex implements DocsIndex {
  private readonly docs: Doc[] = []

  ingest(docs: Doc[]): void {
    this.docs.push(...docs)
  }

  upsert(doc: Doc): void {
    const i = this.docs.findIndex((d) => d.id === doc.id)
    if (i >= 0) this.docs[i] = doc
    else this.docs.push(doc)
  }

  removeById(id: string): void {
    const i = this.docs.findIndex((d) => d.id === id)
    if (i >= 0) this.docs.splice(i, 1)
  }

  retrieve(query: string, k = 3): DocChunk[] {
    const queryTokens = new Set(tokenize(query))
    const scored: DocChunk[] = []
    for (const doc of this.docs) {
      const docTokens = new Set(tokenize(`${doc.title ?? ''} ${doc.text}`))
      let score = 0
      for (const token of queryTokens) {
        if (docTokens.has(token)) score += 1
      }
      if (score > 0) scored.push({ id: doc.id, text: doc.text, title: doc.title, score })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k)
  }
}
