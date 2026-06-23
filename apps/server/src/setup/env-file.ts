/**
 * Minimal, dependency-free `.env` handling for the bootstrap wizard. Not a full
 * dotenv implementation — just enough to read what's already there, write a fresh
 * file, and inject the keys the wizard sets while leaving everything else (order,
 * comments, foreign keys) exactly as the operator left it.
 */

export type EnvMap = Record<string, string>

/** A line that assigns a value: `KEY=value` (optionally `export KEY=value`). */
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

/** Strip one layer of matching surrounding single/double quotes from a raw value. */
function unquote(raw: string): string {
  const v = raw.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1)
  }
  return v
}

/** Parse `.env` text into a key→value map, ignoring comments and blank lines. */
export function parseEnvFile(text: string): EnvMap {
  const out: EnvMap = {}
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(line)) continue // blank or comment
    const m = ASSIGNMENT.exec(line)
    if (m && m[1] !== undefined) out[m[1]] = unquote(m[2] ?? '')
  }
  return out
}

/** Quote a value only when it would otherwise be ambiguous (spaces, `#`, empty-but-leading-space). */
function quoteIfNeeded(value: string): string {
  return /[\s#"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

/** Serialize a key→value map to `.env` text (used when writing a brand-new file). */
export function serializeEnv(env: EnvMap): string {
  const body = Object.entries(env)
    .map(([k, v]) => `${k}=${quoteIfNeeded(v)}`)
    .join('\n')
  return body === '' ? '' : `${body}\n`
}

/** Merge `staged` over `existing` (staged wins; foreign keys preserved). */
export function mergeEnv(existing: EnvMap, staged: EnvMap): EnvMap {
  return { ...existing, ...staged }
}

/**
 * Apply `updates` to existing `.env` text: rewrite each updated key in place
 * (preserving its position and surrounding comments), and append any keys not
 * already present. Lines that aren't updated — including comments, blanks, and
 * foreign keys — are left byte-for-byte intact.
 */
export function applyEnvUpdates(existingText: string, updates: EnvMap): string {
  const remaining = new Set(Object.keys(updates))
  const lines = existingText.split(/\r?\n/).map((line) => {
    const m = ASSIGNMENT.exec(line)
    const key = m?.[1]
    if (key !== undefined && Object.prototype.hasOwnProperty.call(updates, key)) {
      const value = updates[key]
      if (value !== undefined) {
        remaining.delete(key)
        return `${key}=${quoteIfNeeded(value)}`
      }
    }
    return line
  })
  // Drop trailing empty lines so the append lands cleanly, then re-add a final newline.
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  for (const key of remaining) {
    const value = updates[key]
    if (value !== undefined) lines.push(`${key}=${quoteIfNeeded(value)}`)
  }
  return lines.join('\n') + '\n'
}
