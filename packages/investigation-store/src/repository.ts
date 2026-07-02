import {
  investigationId as brandId,
  type Investigation,
  type InvestigationId,
  type InvestigationLevel,
  type InvestigationStatus,
  type Classification,
} from '@helpuit/contracts'

export interface CreateInvestigationInput {
  conversationId: string
  customerId?: string
}

/** Persistence for investigations. The real impl is Drizzle-backed (SQLite→Postgres). */
export interface InvestigationRepository {
  create(input: CreateInvestigationInput): Promise<Investigation>
  get(id: InvestigationId): Promise<Investigation | null>
  /**
   * The Case: reuse the conversation's open investigation, or open a fresh one.
   * Concluded (non-open) investigations are never reused — a new message after
   * resolution starts a new case.
   */
  getOrCreateForConversation(conversationId: string, customerId?: string): Promise<Investigation>
  /** The persisted CaseMemory JSON for this case (null until first saved). */
  loadCase(id: InvestigationId): Promise<string | null>
  saveCase(id: InvestigationId, json: string): Promise<void>
  setLevel(id: InvestigationId, level: InvestigationLevel): Promise<Investigation>
  setStatus(id: InvestigationId, status: InvestigationStatus): Promise<Investigation>
  classify(
    id: InvestigationId,
    classification: Classification,
    confidence: number,
  ): Promise<Investigation>
}

export class InvestigationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Investigation "${id}" not found`)
    this.name = 'InvestigationNotFoundError'
  }
}

export interface InMemoryRepoOptions {
  now?: () => number
}

export class InMemoryInvestigationRepository implements InvestigationRepository {
  private readonly store = new Map<string, Investigation>()
  private readonly cases = new Map<string, string>()
  private readonly now: () => number
  private counter = 0

  constructor(options: InMemoryRepoOptions = {}) {
    this.now = options.now ?? (() => Date.now())
  }

  async create(input: CreateInvestigationInput): Promise<Investigation> {
    const ts = this.now()
    const id = brandId(`inv-${++this.counter}`)
    const investigation: Investigation = {
      id,
      conversationId: input.conversationId,
      customerId: input.customerId ?? null,
      status: 'open',
      level: 'guidance',
      classification: null,
      confidence: null,
      createdAt: ts,
      updatedAt: ts,
    }
    this.store.set(id, investigation)
    return investigation
  }

  async get(id: InvestigationId): Promise<Investigation | null> {
    return this.store.get(id) ?? null
  }

  async getOrCreateForConversation(conversationId: string, customerId?: string): Promise<Investigation> {
    for (const investigation of this.store.values()) {
      if (investigation.conversationId === conversationId && investigation.status === 'open') return investigation
    }
    return this.create({ conversationId, customerId })
  }

  async loadCase(id: InvestigationId): Promise<string | null> {
    return this.cases.get(id) ?? null
  }

  async saveCase(id: InvestigationId, json: string): Promise<void> {
    if (!this.store.has(id)) throw new InvestigationNotFoundError(id)
    this.cases.set(id, json)
  }

  setLevel(id: InvestigationId, level: InvestigationLevel): Promise<Investigation> {
    return this.update(id, { level })
  }

  setStatus(id: InvestigationId, status: InvestigationStatus): Promise<Investigation> {
    return this.update(id, { status })
  }

  classify(
    id: InvestigationId,
    classification: Classification,
    confidence: number,
  ): Promise<Investigation> {
    return this.update(id, { classification, confidence })
  }

  private async update(id: InvestigationId, patch: Partial<Investigation>): Promise<Investigation> {
    const current = this.store.get(id)
    if (current === undefined) throw new InvestigationNotFoundError(id)
    const updated: Investigation = { ...current, ...patch, updatedAt: this.now() }
    this.store.set(id, updated)
    return updated
  }
}
