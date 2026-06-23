export interface ReproductionCaps {
  maxSteps: number
  maxRetries: number
  budgetTokens?: number
}

export interface ReproductionConfig {
  /** Founder toggle (issue 71). */
  playwrightEnabled: boolean
  /** Founder-chosen environment; default 'production' (issue 72). */
  environment: string
  caps: ReproductionCaps
}

export interface ReproFeature {
  name: string
  routes?: string[]
  endpoints?: string[]
  /** Explicit founder marker that this feature has irreversible side effects. */
  irreversible?: boolean
}

const IRREVERSIBLE = /(charge|refund|payment|delete|destroy|purge|wipe|send.?mail|sendemail)/i

/** A feature whose reproduction would cause irreversible side effects (issues 69, 70). */
export function isIrreversibleFeature(feature: ReproFeature): boolean {
  if (feature.irreversible === true) return true
  const haystack = [feature.name, ...(feature.routes ?? []), ...(feature.endpoints ?? [])].join(' ')
  return IRREVERSIBLE.test(haystack)
}

export interface ReproGate {
  allowed: boolean
  reason: string | null
}

/**
 * Decide whether dynamic reproduction may run (issues 69–71). Blocked when the
 * founder disabled Playwright, or when the feature has irreversible side effects
 * — the abortability invariant generalized: never *start* what can't be undone.
 * A blocked feature is escalated with the static evidence instead.
 */
export function canReproduce(config: ReproductionConfig, feature: ReproFeature): ReproGate {
  if (!config.playwrightEnabled) {
    return { allowed: false, reason: 'reproduction disabled by founder' }
  }
  if (isIrreversibleFeature(feature)) {
    return { allowed: false, reason: 'feature has irreversible side effects' }
  }
  return { allowed: true, reason: null }
}

/** Enforce the step cap before a reproduction begins (issue 68). */
export function planWithinCaps(plan: { steps: unknown[] }, caps: ReproductionCaps): boolean {
  return plan.steps.length <= caps.maxSteps
}
