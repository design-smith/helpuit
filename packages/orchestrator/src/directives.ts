import { z } from 'zod'

/**
 * The planner⇄kernel contract: everything the Planner may instruct, as data.
 * The Planner proposes directives; the Policy Kernel validates each one before
 * anything executes — silos are enforced here, not by prompt discipline.
 */
export const Directive = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('consult_docs'), query: z.string().min(1) }),
  z.object({ kind: z.literal('consult_account'), brief: z.string().min(1) }),
  z.object({ kind: z.literal('consult_code'), brief: z.string().min(1) }),
  z.object({ kind: z.literal('ask_clarifying'), question: z.string().min(1).max(500) }),
  z.object({
    kind: z.literal('offer_consent'),
    offer: z.enum(['attach_known_issue', 'file_ticket']),
    issueNumber: z.number().int().optional(),
  }),
  z.object({ kind: z.literal('attach_known_issue'), issueNumber: z.number().int() }),
  z.object({ kind: z.literal('file_ticket') }),
  z.object({
    kind: z.literal('compose_reply'),
    intent: z.enum(['answer', 'acknowledge', 'ask_clarifying', 'offer_consent', 'known_issue', 'escalation_notice', 'budget_stop']),
  }),
])
export type Directive = z.infer<typeof Directive>

/** One planning round: at most 4 directives, plus audited-only bookkeeping. */
export const PlannerOutput = z.object({
  directives: z.array(Directive).min(1).max(4),
  caseNotes: z.string().default(''),
  hypotheses: z.array(z.string()).default([]),
})
export type PlannerOutput = z.infer<typeof PlannerOutput>

/**
 * The case's working memory, persisted as JSON on the conversation's open
 * investigation (`case_json`) and reloaded every turn.
 */
export interface CaseMemory {
  findings: Array<{ summary: string }>
  extracts: Array<{ title?: string; text: string }>
  hypotheses: string[]
  notes: string
  /** The case's original complaint (first message) — what escalation drafts are about. */
  complaint?: string
  /** The Code Analyst's technical layer — internal only (escalation drafts, console); never composable. */
  technical?: {
    hypothesis: string
    suspectedFiles: string[]
    confidence: number
    verdict: 'user_error_or_prerequisite' | 'actual_bug' | 'explains_behavior'
    feature?: string
  }
  pendingOffer?: { offer: 'attach_known_issue' | 'file_ticket'; issueNumber?: number }
  /** Set when an acknowledgment was sent this turn; cleared by the substantive reply (retry-dedup). */
  lastAckAt?: number
  /** The known-issue matcher runs once per case — set after the first check, match or not. */
  knownIssueChecked?: boolean
}

/** Parse persisted case memory, tolerating null/corrupt JSON (never throws). */
export function parseCaseMemory(json: string | null): CaseMemory {
  const empty: CaseMemory = { findings: [], extracts: [], hypotheses: [], notes: '' }
  if (json === null || json === '') return empty
  try {
    const raw = JSON.parse(json) as Partial<CaseMemory>
    return {
      findings: Array.isArray(raw.findings) ? raw.findings : [],
      extracts: Array.isArray(raw.extracts) ? raw.extracts : [],
      hypotheses: Array.isArray(raw.hypotheses) ? raw.hypotheses : [],
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      complaint: typeof raw.complaint === 'string' ? raw.complaint : undefined,
      technical: raw.technical,
      pendingOffer: raw.pendingOffer,
      lastAckAt: typeof raw.lastAckAt === 'number' ? raw.lastAckAt : undefined,
      knownIssueChecked: raw.knownIssueChecked === true ? true : undefined,
    }
  } catch {
    return empty
  }
}

/**
 * Parse a raw planner completion into a validated plan — the house LLM-IO
 * pattern (slice first `{` to last `}`, then schema-validate). Failures return
 * the issues as text so the retry prompt can quote them back to the model.
 */
export function parsePlannerOutput(raw: string): { ok: true; plan: PlannerOutput } | { ok: false; issues: string } {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return { ok: false, issues: 'no JSON object found in the response' }
  let json: unknown
  try {
    json = JSON.parse(raw.slice(start, end + 1))
  } catch (error) {
    return { ok: false, issues: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  const parsed = PlannerOutput.safeParse(json)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  }
  return { ok: true, plan: parsed.data }
}
