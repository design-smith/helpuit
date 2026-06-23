/** Relative time like "3m ago" / "2h ago" from an epoch-ms timestamp. */
export function timeAgo(at: number): string {
  const diff = Date.now() - at
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

/** Absolute timestamp for tooltips. */
export function absTime(at: number): string {
  return new Date(at).toLocaleString()
}

/** Compact token count (12_400 → "12.4k"). */
export function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

/** A short id for display (first 8 chars). */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

const STATUS_TONE: Record<string, string> = {
  open: 'sky',
  escalated: 'amber',
  resolved: 'emerald',
  resolved_pending_customer_update: 'emerald',
  needs_founder: 'red',
  pending: 'amber',
  published: 'emerald',
  rejected: 'slate',
  failed: 'red',
  active: 'sky',
  done: 'emerald',
}

/** Map a status/classification string to a badge tone. */
export function toneFor(value: string | null | undefined): string {
  if (!value) return 'slate'
  return STATUS_TONE[value] ?? 'slate'
}
