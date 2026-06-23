import { Redactor } from '@helpuit/crypto'

export interface RailResult {
  text: string
  /** Categories of content that were stripped (for audit). */
  violations: string[]
}

const REMOVED = '[removed]'
const redactor = new Redactor()

const RULES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'code_block', pattern: /```[\s\S]*?```/g },
  {
    name: 'sql',
    pattern:
      /\b(?:SELECT\b|INSERT\s+INTO\b|UPDATE\b|DELETE\s+FROM\b|DROP\s+TABLE\b|ALTER\s+TABLE\b|CREATE\s+TABLE\b)[^\n]*/gi,
  },
  {
    name: 'file_path',
    pattern: /\b[\w./-]+\.(?:ts|tsx|js|jsx|vue|svelte|py|rb|go|java|sql)(?::\d+)?\b/g,
  },
  { name: 'stack_frame', pattern: /\bat\s+\S+\s+\([^)]*\)/g },
]

/**
 * Customer-facing output rail (issue 86): customer messages contain product
 * language only — strip code blocks, SQL, file paths, and stack frames. Internal
 * detail still flows to private notes / GitHub issues; this gate is only for the
 * customer channel. Returns the cleaned text plus which categories were removed.
 *
 * Also strips any provider secret echoed inline — a code-grounded guidance answer
 * could otherwise quote a key from source straight to the customer (PII like the
 * customer's own email is left intact, since the reply legitimately references it).
 */
export function enforceCustomerOutput(input: string): RailResult {
  let text = input
  const violations: string[] = []
  for (const rule of RULES) {
    const replaced = text.replace(rule.pattern, REMOVED)
    if (replaced !== text) {
      violations.push(rule.name)
      text = replaced
    }
  }
  const secrets = redactor.redactSecrets(text)
  if (secrets.count > 0) {
    violations.push('secret')
    text = secrets.text
  }
  return { text, violations }
}
