/**
 * Structural config sections that can be applied LIVE by rebuilding the
 * orchestrator. Everything else (secrets, provider keys, DB url, ports) is
 * RESTART-class — saved but applied on the next boot.
 */
export const LIVE_SECTIONS = ['policy', 'budget', 'alerts', 'models', 'integrations'] as const
export type LiveSection = (typeof LIVE_SECTIONS)[number]

export type ApplyClass = 'live' | 'restart' | 'unknown'

/** Classify a structural config section as live-appliable, restart-required, or unknown. */
export function classifySection(section: string): ApplyClass {
  if ((LIVE_SECTIONS as readonly string[]).includes(section)) return 'live'
  // chatwoot/github/identity/queryRoutes/reproduction carry network identities or
  // secrets bound at build → restart. Anything unrecognized is rejected as unknown.
  if (['chatwoot', 'github', 'identity', 'queryRoutes', 'accountData', 'reproduction', 'retention'].includes(section)) {
    return 'restart'
  }
  return 'unknown'
}

/** Secrets are always restart-class (the bound clients capture them at build). */
export function classifySecret(): ApplyClass {
  return 'restart'
}
