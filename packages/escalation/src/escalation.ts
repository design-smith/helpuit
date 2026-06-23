import type { Classification } from '@helpuit/contracts'
import { SIGNATURE_MARKER } from '@helpuit/dedup'

export interface IssueDraft {
  title: string
  body: string
  labels: string[]
  severity: 'low' | 'medium' | 'high'
}

export interface IssueRefLite {
  number: number
  url: string
}

/** Files/links issues on the tracker (GitHub MCP in prod). */
export interface IssueTracker {
  create(draft: IssueDraft): Promise<IssueRefLite>
  comment(issueNumber: number, body: string): Promise<void>
}

export interface EscalationInput {
  classification: Classification
  /** PII-free summary — the only customer-derived content allowed into the issue. */
  safeSummary: string
  hypothesis?: string
  suspectedFiles?: string[]
  reproduced?: boolean
  /** When dedup found an OPEN matching issue, link to it instead of filing a new one. */
  openMatchIssue?: number
  /** Bug signature embedded in the body so recurrences dedupe to this issue. */
  signature?: string
}

export type EscalationAction = 'created' | 'linked' | 'drafted'

export interface EscalationResult {
  action: EscalationAction
  issueNumber?: number
  draft: IssueDraft
}

/** Customer-facing escalation message (issue 58). */
export const CUSTOMER_ESCALATION_MESSAGE =
  "I've confirmed this looks like a product issue rather than something you're doing. I've escalated it to engineering and will update you right here when there's a fix."

/** Build an engineering-grade issue from the safe summary + findings (issue 51). Never includes raw PII. */
export function draftIssue(input: EscalationInput): IssueDraft {
  const title = `[${input.classification}] ${input.hypothesis ?? input.safeSummary}`.slice(0, 120)
  const bodyLines = [
    '## Summary',
    input.safeSummary,
    '',
    `**Reproduced:** ${input.reproduced === true ? 'yes' : 'no'}`,
  ]
  if (input.hypothesis !== undefined) {
    bodyLines.push('', '## Hypothesis', input.hypothesis)
  }
  if (input.suspectedFiles !== undefined && input.suspectedFiles.length > 0) {
    bodyLines.push('', '## Suspected files', ...input.suspectedFiles.map((f) => `- ${f}`))
  }
  if (input.signature !== undefined) {
    bodyLines.push('', `${SIGNATURE_MARKER} ${input.signature}`)
  }
  bodyLines.push('', '_Filed by Helpuit._')

  return {
    title,
    body: bodyLines.join('\n'),
    labels: ['helpuit', input.classification, ...(input.reproduced === true ? ['reproduced'] : [])],
    severity: input.reproduced === true ? 'high' : 'medium',
  }
}

/**
 * Escalation agent (issues 55–57). Drafts the issue, then:
 * - open dedup match → comment on the existing issue (link), do not file;
 * - autopublish on → file a new issue;
 * - autopublish off → return the draft for founder approval.
 */
export class EscalationAgent {
  constructor(
    private readonly tracker: IssueTracker,
    private readonly options: { autopublish: boolean },
  ) {}

  async escalate(input: EscalationInput): Promise<EscalationResult> {
    const draft = draftIssue(input)

    if (input.openMatchIssue !== undefined) {
      await this.tracker.comment(input.openMatchIssue, draft.body)
      return { action: 'linked', issueNumber: input.openMatchIssue, draft }
    }

    if (this.options.autopublish) {
      const ref = await this.tracker.create(draft)
      return { action: 'created', issueNumber: ref.number, draft }
    }

    return { action: 'drafted', draft }
  }
}
