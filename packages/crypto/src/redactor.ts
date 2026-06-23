export interface RedactionResult {
  /** Input with every match replaced by a `[REDACTED:<kind>]` marker. */
  text: string
  /** Total number of redactions applied. */
  count: number
}

interface Rule {
  tag: string
  pattern: RegExp
}

/** Provider secrets / credentials — must never leave the system (GitHub, customer chat). */
const SECRET_RULES: Rule[] = [
  { tag: 'secret', pattern: /-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g },
  { tag: 'secret', pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { tag: 'secret', pattern: /Bearer\s+[A-Za-z0-9._-]+/g },
  { tag: 'secret', pattern: /sk-[A-Za-z0-9]{20,}/g },
  { tag: 'secret', pattern: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { tag: 'secret', pattern: /github_pat_[A-Za-z0-9_]{30,}/g },
  { tag: 'secret', pattern: /AKIA[0-9A-Z]{16}/g },
]

/** Personally-identifiable info — redacted before customer-derived text reaches GitHub. */
const PII_RULES: Rule[] = [
  { tag: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // E.164 ("+15551230000") and NANP ("555-123-4567", "(555) 987-6543") phone forms.
  // Deliberately requires a leading "+" or 3-3-4 separators so bare ids/order numbers aren't caught.
  { tag: 'phone', pattern: /\+\d{10,15}\b/g },
  { tag: 'phone', pattern: /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  // 13–16 digit card-like runs (distinct from the 7–12 digit phone forms above).
  { tag: 'card', pattern: /\b\d(?:[ -]?\d){12,15}\b/g },
]

function applyRules(input: string, rules: Rule[]): RedactionResult {
  let text = input
  let count = 0
  for (const rule of rules) {
    text = text.replace(rule.pattern, () => {
      count++
      return `[REDACTED:${rule.tag}]`
    })
  }
  return { text, count }
}

/**
 * Scrubs PII and provider secrets from free text before it leaves the system
 * (e.g. into a GitHub issue). Conservative by design — it would rather over- than
 * under-redact, since the alternative is leaking a customer's data or a key.
 */
export class Redactor {
  /** Redact both secrets and PII (the export gate to GitHub). */
  redact(input: string): RedactionResult {
    const secrets = applyRules(input, SECRET_RULES)
    const pii = applyRules(secrets.text, PII_RULES)
    return { text: pii.text, count: secrets.count + pii.count }
  }

  /**
   * Redact ONLY secrets, leaving PII intact — for the customer-facing output rail,
   * where a code-grounded answer might accidentally echo a key from source, but the
   * customer's own contact details in a reply are benign.
   */
  redactSecrets(input: string): RedactionResult {
    return applyRules(input, SECRET_RULES)
  }
}
