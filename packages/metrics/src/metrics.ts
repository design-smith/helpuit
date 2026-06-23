import type { Investigation } from '@helpuit/contracts'
import type { AuditEntry } from '@helpuit/audit'

export interface MetricsInput {
  investigations: ReadonlyArray<Pick<Investigation, 'classification' | 'level'>>
  audits: ReadonlyArray<Pick<AuditEntry, 'type'>>
}

export interface MetricsSummary {
  totalInvestigations: number
  byClassification: Record<string, number>
  byLevel: Record<string, number>
  knownIssueShortCircuits: number
}

function tally(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1
}

/**
 * Founder-facing metrics (issue 88) computed from investigations + the audit log.
 * Deliberately a pure function over already-collected data so it can be fed by
 * any store and tested in isolation. (Reproduction-success-rate joins once the
 * reproduction waves land and emit their outcomes.)
 */
export function computeMetrics(input: MetricsInput): MetricsSummary {
  const byClassification: Record<string, number> = {}
  const byLevel: Record<string, number> = {}

  for (const investigation of input.investigations) {
    tally(byClassification, investigation.classification ?? 'unclassified')
    tally(byLevel, investigation.level)
  }

  const knownIssueShortCircuits = input.audits.filter((a) => a.type === 'known_issue').length

  return {
    totalInvestigations: input.investigations.length,
    byClassification,
    byLevel,
    knownIssueShortCircuits,
  }
}
