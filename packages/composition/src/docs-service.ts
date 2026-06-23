import { DrizzleDocsRepository, type Db, type AddDocInput, type DocRecord } from '@helpuit/db'
import { InMemoryDocsIndex, type Doc, type DocsIndex } from '@helpuit/guidance'

function toDoc(record: DocRecord): Doc {
  return { id: record.id, text: record.text, title: record.title ?? undefined }
}

/**
 * Owns operator-ingested grounding docs (FCW-04): a persistent store plus the
 * LIVE `DocsIndex` the L1 guidance agent reads. Persisted docs are loaded into
 * the index at boot, and `add` both persists and ingests so a freshly pasted doc
 * grounds answers immediately — no restart. The index is shared into
 * `buildOrchestrator` (and survives config rebuilds) via {@link index}.
 */
export class DocsService {
  private constructor(
    private readonly repo: DrizzleDocsRepository,
    private readonly docsIndex: InMemoryDocsIndex,
  ) {}

  /** Build the service over the live DB and warm the index from persisted docs. */
  static async create(db: Db): Promise<DocsService> {
    const repo = new DrizzleDocsRepository(db)
    const index = new InMemoryDocsIndex()
    const service = new DocsService(repo, index)
    index.ingest((await repo.list()).map(toDoc))
    return service
  }

  /** The live docs index to ground L1 guidance; pass to `buildOrchestrator`. */
  get index(): DocsIndex {
    return this.docsIndex
  }

  /**
   * Ingest docs into the live index WITHOUT persisting them — for content whose
   * source of truth lives elsewhere and is re-derived each boot (e.g. repo-sourced
   * markdown, FCW-05). Persisted operator docs go through {@link add}.
   */
  ingestEphemeral(docs: Doc[]): void {
    this.docsIndex.ingest(docs)
  }

  /** Persist a pasted/uploaded doc AND ingest it live so it grounds immediately. */
  async add(input: AddDocInput): Promise<DocRecord> {
    const record = await this.repo.add(input)
    this.docsIndex.ingest([toDoc(record)])
    return record
  }

  /** All persisted docs, newest first (for the console's docs list). */
  list(): Promise<DocRecord[]> {
    return this.repo.list()
  }

  /**
   * Remove a doc from the store. The live index keeps the in-memory copy until the
   * next reload (its baseline is rebuilt from the store on the next start); the
   * persistent source of truth — what survives a restart — is updated immediately.
   */
  remove(id: string): Promise<boolean> {
    return this.repo.remove(id)
  }
}
