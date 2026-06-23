export interface AuditEvent {
  type: string
  data?: Record<string, unknown>
}

export interface AuditEntry extends AuditEvent {
  investigationId: string
  at: number
}

export interface AuditLogOptions {
  now?: () => number
}

/**
 * Per-investigation audit log (issue 87): every customer-facing message and
 * every action is recorded so the founder can see exactly what the agent did.
 */
export class AuditLog {
  private readonly entries: AuditEntry[] = []
  private readonly now: () => number

  constructor(options: AuditLogOptions = {}) {
    this.now = options.now ?? (() => Date.now())
  }

  /** Record an entry and return it (so a decorator can forward the exact entry). */
  record(investigationId: string, event: AuditEvent): AuditEntry {
    const entry: AuditEntry = {
      investigationId,
      type: event.type,
      data: event.data,
      at: this.now(),
    }
    this.entries.push(entry)
    return entry
  }

  forInvestigation(investigationId: string): AuditEntry[] {
    return this.entries.filter((entry) => entry.investigationId === investigationId)
  }
}
