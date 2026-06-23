import type { Feature, FeatureManifest } from '@helpuit/feature-manifest'

export interface ManifestValidation {
  ok: boolean
  /** The normalized manifest, present only when `ok`. */
  manifest?: FeatureManifest
  errors: string[]
}

/** Coerce an unknown value to a string[] (non-string entries dropped). */
function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Validate + normalize an operator-edited feature manifest (FCW-18) before it's
 * persisted. `ref` and each feature's `key`/`name` are required; keys must be
 * unique; the list fields default to `[]`. Returns clear, per-feature errors so a
 * bad edit is rejected loudly rather than corrupting the stored manifest.
 */
export function validateManifest(input: unknown): ManifestValidation {
  const errors: string[] = []
  const obj = (input ?? {}) as Record<string, unknown>

  const ref = typeof obj.ref === 'string' ? obj.ref.trim() : ''
  if (ref === '') errors.push('ref is required (the production branch the manifest is built against).')

  if (!Array.isArray(obj.features)) {
    errors.push('features must be an array.')
    return { ok: false, errors }
  }

  const seen = new Set<string>()
  const features: Feature[] = obj.features.map((raw, i) => {
    const feat = (raw ?? {}) as Record<string, unknown>
    const key = typeof feat.key === 'string' ? feat.key.trim() : ''
    const name = typeof feat.name === 'string' ? feat.name.trim() : ''
    const label = key !== '' ? `"${key}"` : `#${i + 1}`
    if (key === '') errors.push(`feature ${label}: key is required.`)
    else if (seen.has(key)) errors.push(`duplicate feature key "${key}".`)
    else seen.add(key)
    if (name === '') errors.push(`feature ${label}: name is required.`)

    const feature: Feature = {
      key,
      name,
      routes: strArray(feat.routes),
      components: strArray(feat.components),
      endpoints: strArray(feat.endpoints),
      docsLinks: strArray(feat.docsLinks),
    }
    if (feat.keywords !== undefined) feature.keywords = strArray(feat.keywords)
    if (typeof feat.sandboxRole === 'string' && feat.sandboxRole.trim() !== '') {
      feature.sandboxRole = feat.sandboxRole.trim()
    }
    return feature
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, manifest: { ref, features }, errors: [] }
}
