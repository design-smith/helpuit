export interface GuidanceAssessmentInput {
  confidence: number
  hasSources: boolean
}

export interface AssessmentOptions {
  threshold: number
}

export interface AssessmentDecision {
  decision: 'resolved' | 'escalate'
  reason: string
}

/**
 * L1 self-assessment (issues 26, 27). Guidance is "resolved" only when it is
 * both grounded (has sources) and confident enough; otherwise the orchestrator
 * escalates. Ungrounded answers always escalate — no confident hallucinations.
 */
export function assessGuidance(
  input: GuidanceAssessmentInput,
  opts: AssessmentOptions,
): AssessmentDecision {
  if (!input.hasSources) {
    return { decision: 'escalate', reason: 'no grounding sources' }
  }
  if (input.confidence < opts.threshold) {
    return {
      decision: 'escalate',
      reason: `confidence ${input.confidence} below threshold ${opts.threshold}`,
    }
  }
  return { decision: 'resolved', reason: 'confident and grounded' }
}

const PUSHBACK =
  /\b(still|did\s?n'?t\s+work|does\s?n'?t\s+work|not\s+working|no\s+luck|same\s+(issue|problem|error)|tried\s+that|already\s+did)\b/i

/** Detect customer pushback ("still broken", "didn't work") — a strong escalation signal (issue 28). */
export function detectPushback(message: string): boolean {
  return PUSHBACK.test(message)
}
