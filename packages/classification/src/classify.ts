import type { Classification } from '@helpuit/contracts'

export interface ClassificationEvidence {
  /** Money/security/data-loss/legal — must never be handled autonomously. */
  sensitiveTopic?: boolean
  /** A classification suggested by account-state investigation (L2). */
  accountHint?: Classification
  /** Confidence from static code investigation (L3a). */
  staticConfidence?: number
  /** Outcome of dynamic reproduction (L3b), once that wave lands. */
  reproduced?: boolean
}

export interface ClassificationResult {
  classification: Classification
  confidence: number
  reason: string
}

export interface ClassifyOptions {
  bugThreshold?: number
}

/**
 * Map accumulated evidence to one of the explicit outcomes (issue 43). Ordered
 * by precedence so the safest/strongest signal wins: sensitive topics always go
 * to the founder; a confirmed reproduction is a bug; account state explains
 * config/data issues; a confident static finding is a suspected bug; weak
 * evidence is handed to the founder rather than guessed.
 */
export function classifyEvidence(
  evidence: ClassificationEvidence,
  opts: ClassifyOptions = {},
): ClassificationResult {
  const bugThreshold = opts.bugThreshold ?? 0.6

  if (evidence.sensitiveTopic === true) {
    return { classification: 'needs_founder', confidence: 1, reason: 'sensitive topic (money/security/legal)' }
  }
  if (evidence.reproduced === true) {
    return { classification: 'new_bug', confidence: 0.95, reason: 'reproduced in sandbox' }
  }
  if (evidence.accountHint !== undefined) {
    return { classification: evidence.accountHint, confidence: 0.8, reason: 'account state explains the issue' }
  }
  if (evidence.staticConfidence !== undefined && evidence.staticConfidence >= bugThreshold) {
    return {
      classification: 'new_bug',
      confidence: evidence.staticConfidence,
      reason: 'static analysis identified a likely defect',
    }
  }
  if (evidence.staticConfidence !== undefined) {
    return {
      classification: 'needs_founder',
      confidence: 1 - evidence.staticConfidence,
      reason: 'static analysis inconclusive',
    }
  }
  return { classification: 'needs_founder', confidence: 0.3, reason: 'no determining evidence' }
}
