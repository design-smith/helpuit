import { inArray, lt } from 'drizzle-orm'
import type { Db } from './client.js'
import {
  investigations,
  tickets,
  githubLinks,
  auditEntries,
  spendEntries,
  evidenceArtifacts,
  userContextSnapshots,
  reproductionAttempts,
  processedWebhookEvents,
  issueDrafts,
} from './schema.js'

/** Rows deleted by a retention sweep, by table. */
export interface RetentionResult {
  investigations: number
  tickets: number
  githubLinks: number
  auditEntries: number
  spendEntries: number
  evidenceArtifacts: number
  userContextSnapshots: number
  reproductionAttempts: number
  issueDrafts: number
  processedEvents: number
}

/** SQLite caps bound parameters (~999); delete expired ids in safe batches. */
const CHUNK = 500
function chunk<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

/**
 * Enforces data retention: deletes investigations older than the configured
 * window along with every child row that references them (audit, evidence,
 * snapshots, repro attempts, spend, tickets, GitHub links), plus stale webhook
 * idempotency records. This is how Helpuit honors "don't keep customer data
 * forever" — sensitive evidence is encrypted at rest AND aged out.
 */
export class RetentionService {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async purgeOlderThan(windowMs: number, at: number = this.now()): Promise<RetentionResult> {
    const cutoff = at - windowMs

    const result: RetentionResult = {
      investigations: 0,
      tickets: 0,
      githubLinks: 0,
      auditEntries: 0,
      spendEntries: 0,
      evidenceArtifacts: 0,
      userContextSnapshots: 0,
      reproductionAttempts: 0,
      issueDrafts: 0,
      processedEvents: 0,
    }

    const expired = await this.db
      .select({ id: investigations.id })
      .from(investigations)
      .where(lt(investigations.createdAt, cutoff))
    const ids = expired.map((row) => row.id)

    for (const batch of chunk(ids)) {
      result.tickets += (
        await this.db.delete(tickets).where(inArray(tickets.investigationId, batch)).returning({ id: tickets.id })
      ).length
      result.githubLinks += (
        await this.db.delete(githubLinks).where(inArray(githubLinks.investigationId, batch)).returning({ id: githubLinks.id })
      ).length
      result.auditEntries += (
        await this.db.delete(auditEntries).where(inArray(auditEntries.investigationId, batch)).returning({ id: auditEntries.id })
      ).length
      result.spendEntries += (
        await this.db.delete(spendEntries).where(inArray(spendEntries.investigationId, batch)).returning({ id: spendEntries.id })
      ).length
      result.evidenceArtifacts += (
        await this.db.delete(evidenceArtifacts).where(inArray(evidenceArtifacts.investigationId, batch)).returning({ id: evidenceArtifacts.id })
      ).length
      result.userContextSnapshots += (
        await this.db.delete(userContextSnapshots).where(inArray(userContextSnapshots.investigationId, batch)).returning({ id: userContextSnapshots.id })
      ).length
      result.reproductionAttempts += (
        await this.db.delete(reproductionAttempts).where(inArray(reproductionAttempts.investigationId, batch)).returning({ id: reproductionAttempts.id })
      ).length
      result.issueDrafts += (
        await this.db.delete(issueDrafts).where(inArray(issueDrafts.investigationId, batch)).returning({ id: issueDrafts.id })
      ).length
      result.investigations += (
        await this.db.delete(investigations).where(inArray(investigations.id, batch)).returning({ id: investigations.id })
      ).length
    }

    result.processedEvents = (
      await this.db
        .delete(processedWebhookEvents)
        .where(lt(processedWebhookEvents.processedAt, cutoff))
        .returning({ id: processedWebhookEvents.id })
    ).length

    return result
  }
}
