/**
 * State for the dashboard "Getting started" card: a manual onboarding checklist
 * (each step ticked by hand) plus a one-time dismissal. Persisted client-side
 * (localStorage) — it's a guide, not config, so it lives per-browser. This module
 * is pure (no DOM); the component does the actual localStorage read/write.
 */

export interface GettingStartedStep {
  id: string
  title: string
  /** Console page that completes this step. */
  href: string
}

/** The onboarding steps, in order. Mirrors the setup connectors the operator must wire. */
export const GETTING_STARTED_STEPS: readonly GettingStartedStep[] = [
  { id: 'github', title: 'Connect GitHub', href: '/settings/connections' },
  { id: 'chatwoot', title: 'Connect Chatwoot', href: '/settings/connections' },
  // LLM provider is selected on Connections (the picker); keys live under Secrets.
  { id: 'llm', title: 'Choose an LLM provider', href: '/settings/connections' },
  // Identity is configured inline in the Getting-started card (see GettingStarted.tsx);
  // this href is the persistent editor fallback.
  { id: 'identity', title: 'Verify customer identity', href: '/settings/connections' },
]

export const GETTING_STARTED_STORAGE_KEY = 'helpuit.gettingStarted.v1'

export interface GettingStartedState {
  /** Step id → ticked. */
  done: Record<string, boolean>
  /** The operator pressed "I'm all good now" — hide the card for good. */
  dismissed: boolean
}

/** Parse persisted state, tolerating absent/corrupt storage (never throws). */
export function loadState(raw: string | null): GettingStartedState {
  if (raw === null || raw === '') return { done: {}, dismissed: false }
  try {
    const parsed = JSON.parse(raw) as { done?: unknown; dismissed?: unknown }
    const done: Record<string, boolean> = {}
    if (parsed.done !== null && typeof parsed.done === 'object') {
      for (const [k, v] of Object.entries(parsed.done as Record<string, unknown>)) {
        if (v === true) done[k] = true
      }
    }
    return { done, dismissed: parsed.dismissed === true }
  } catch {
    return { done: {}, dismissed: false }
  }
}

export function serializeState(state: GettingStartedState): string {
  return JSON.stringify(state)
}

/** Flip a single step's ticked state (immutable). */
export function toggleStep(state: GettingStartedState, id: string): GettingStartedState {
  return { ...state, done: { ...state.done, [id]: !state.done[id] } }
}

/** Mark the card dismissed (immutable; preserves checked state). */
export function dismiss(state: GettingStartedState): GettingStartedState {
  return { ...state, dismissed: true }
}

/** How many of the KNOWN steps are ticked (unknown keys are ignored). */
export function completedCount(
  state: GettingStartedState,
  steps: readonly GettingStartedStep[] = GETTING_STARTED_STEPS,
): number {
  return steps.filter((step) => state.done[step.id] === true).length
}
