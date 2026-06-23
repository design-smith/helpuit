/** Parse a comma-separated column list into trimmed, de-duped, non-empty entries. */
export function parseColumnList(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(',')) {
    const col = raw.trim()
    if (col !== '' && !seen.has(col)) {
      seen.add(col)
      out.push(col)
    }
  }
  return out
}
