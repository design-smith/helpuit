import type { Feature, FeatureManifest } from './types.js'

export interface FeatureMatch {
  feature: Feature
  score: number
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

/**
 * Resolve a complaint to candidate features (issue 23), ranked by score.
 *
 * Baseline heuristic: token overlap between the complaint and each feature's
 * name/routes/components/endpoints/keywords, with a strong boost when the
 * complaint literally mentions one of the feature's route paths. An LLM layer
 * can later re-rank these; the heuristic is deterministic and testable.
 */
export function resolveFeature(manifest: FeatureManifest, complaint: string): FeatureMatch[] {
  const complaintLower = complaint.toLowerCase()
  const complaintTokens = new Set(tokenize(complaint))

  const matches: FeatureMatch[] = []
  for (const feature of manifest.features) {
    const haystack = [
      feature.name,
      ...feature.routes,
      ...feature.components,
      ...feature.endpoints,
      ...(feature.keywords ?? []),
    ].join(' ')
    const featureTokens = new Set(tokenize(haystack))

    let score = 0
    for (const token of complaintTokens) {
      if (featureTokens.has(token)) score += 1
    }
    for (const route of feature.routes) {
      if (route.length > 1 && complaintLower.includes(route.toLowerCase())) score += 3
    }

    if (score > 0) matches.push({ feature, score })
  }

  return matches.sort((a, b) => b.score - a.score)
}
