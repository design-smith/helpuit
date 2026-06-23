import { AuditLog, type AuditEntry, type AuditEvent, type AuditLogOptions } from './audit.js'

/**
 * A durable destination for audit entries. Kept as an interface so this package
 * never depends on `@helpuit/db` — the DB-backed adapter is wired in composition.
 */
export interface AuditSink {
  record(entry: AuditEntry): void
}

/**
 * An {@link AuditLog} that ALSO forwards every entry to a durable {@link AuditSink},
 * so the operator console can read the per-investigation trail back after a
 * restart. The in-memory base behavior is preserved (synchronous, non-throwing);
 * the sink is best-effort — a sink that throws must not break intake, so adapters
 * forward fire-and-forget with their own error handling.
 */
export class PersistingAuditLog extends AuditLog {
  constructor(
    private readonly sink: AuditSink,
    options: AuditLogOptions = {},
  ) {
    super(options)
  }

  override record(investigationId: string, event: AuditEvent): AuditEntry {
    const entry = super.record(investigationId, event)
    this.sink.record(entry)
    return entry
  }
}
