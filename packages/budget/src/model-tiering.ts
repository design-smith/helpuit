/**
 * Model tiering recommendation (issue 84). Given the founder's chosen primary
 * model, recommend a quality/cost-balanced split across the pipeline stages.
 * This is surfaced as a *recommendation tooltip*, not a silent default — the
 * founder still decides.
 */
export interface ModelTiering {
  /** High-volume, latency-sensitive: L1 guidance + orchestrator routing. */
  guidance: string
  /** Heavier reasoning: account investigation, static code investigation. */
  reasoning: string
  /** Only when a repro must "see" the screen. */
  vision: string
  note: string
}

const KNOWN: Record<string, ModelTiering> = {
  'claude-opus-4-8': {
    guidance: 'claude-haiku-4-5',
    reasoning: 'claude-opus-4-8',
    vision: 'claude-opus-4-8',
    note: 'Haiku handles the high-volume guidance path; Opus is reserved for reasoning and vision where it earns its cost.',
  },
  'claude-sonnet-4-6': {
    guidance: 'claude-haiku-4-5',
    reasoning: 'claude-sonnet-4-6',
    vision: 'claude-sonnet-4-6',
    note: 'Haiku for guidance, Sonnet for reasoning and vision — a balanced mid-tier setup.',
  },
}

export function recommendTiering(primaryModel: string): ModelTiering {
  const known = KNOWN[primaryModel]
  if (known !== undefined) return known
  return {
    guidance: primaryModel,
    reasoning: primaryModel,
    vision: primaryModel,
    note: `No tiering recommendation for "${primaryModel}" — using it across all stages. Configure a cheaper guidance model to reduce cost.`,
  }
}
