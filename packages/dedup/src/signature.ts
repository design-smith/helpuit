/** Inputs that identify a bug well enough to dedupe across customers (issue 37). */
export interface SignatureInput {
  feature?: string
  route?: string
  endpoint?: string
  errorClass?: string
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Compute a stable bug signature. Equivalent contexts (differing only by case
 * or whitespace) produce the same signature so the same bug from different
 * customers collapses to one issue.
 */
export function computeSignature(input: SignatureInput): string {
  return [
    normalize(input.feature),
    normalize(input.route),
    normalize(input.endpoint),
    normalize(input.errorClass),
  ].join('|')
}
