import { computeSignature, type SignatureInput } from './signature.js'

/** Marker Helpuit embeds in issue bodies so recurrences dedupe to one issue. */
export const SIGNATURE_MARKER = 'helpuit-signature:'

export interface IssueRef {
  number: number
  url: string
  state: 'open' | 'closed'
  /** The signature Helpuit recorded on the issue when it was filed. */
  signature?: string
}

/** Searches the issue tracker for issues matching a signature (GitHub MCP in prod). */
export interface IssueSearch {
  search(signature: string): Promise<IssueRef[]>
}

export type MatchVerdict =
  | { verdict: 'open'; issue: IssueRef }
  | { verdict: 'closed'; issue: IssueRef }
  | { verdict: 'none'; issue: null }

/**
 * Classify a signature against candidate issues (issue 39):
 * - an **open** match → link the new ticket, skip filing;
 * - only a **closed** match → a recurrence after a fix (likely regression) → file new;
 * - **none** → file new.
 */
export function classifyMatch(signature: string, issues: IssueRef[]): MatchVerdict {
  const matching = issues.filter((issue) => issue.signature === signature)
  const open = matching.find((issue) => issue.state === 'open')
  if (open !== undefined) return { verdict: 'open', issue: open }
  const closed = matching.find((issue) => issue.state === 'closed')
  if (closed !== undefined) return { verdict: 'closed', issue: closed }
  return { verdict: 'none', issue: null }
}

/** Front-of-funnel known-issue check (issue 40): signature → search → classify. */
export async function knownIssueCheck(
  input: SignatureInput,
  search: IssueSearch,
): Promise<MatchVerdict> {
  const signature = computeSignature(input)
  const issues = await search.search(signature)
  return classifyMatch(signature, issues)
}
