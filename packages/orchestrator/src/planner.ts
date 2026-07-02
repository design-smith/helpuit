import { parsePlannerOutput, type PlannerOutput } from './directives.js'

/**
 * The structural slice of `@helpuit/llm`'s ChatModel this package needs — the
 * real (metered) models satisfy it without an adapter, and tests script it.
 */
export interface ChatPort {
  complete(options: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    maxTokens?: number
  }): Promise<{ text: string }>
}

export interface PlannerInput {
  message: string
  /** Product-language findings gathered so far this case. */
  findings: Array<{ summary: string }>
  /** Kernel denials from the previous round — the planner must plan around them. */
  denials: string[]
  identity: 'verified' | 'anonymous'
  pendingOffer?: { offer: 'attach_known_issue' | 'file_ticket'; issueNumber?: number }
  /** The planner's own persisted case notes from earlier turns. */
  notes?: string
}

const SYSTEM = [
  'You are the routing brain of a customer-support system. You never talk to the customer.',
  'Decide the next directives: consult_docs{query}, consult_account{brief}, consult_code{brief},',
  'ask_clarifying{question}, offer_consent{offer, issueNumber?}, attach_known_issue{issueNumber},',
  'file_ticket, compose_reply{intent}.',
  'Consult agents only when needed; emit compose_reply when the findings can answer the customer.',
  'Respond with ONLY compact JSON: {"directives":[...],"caseNotes":string,"hypotheses":[string]}.',
].join('\n')

/** LLM planning bridge (reasoning tier): one validation retry, then null — the engine falls back. */
export class Planner {
  constructor(private readonly chat: ChatPort) {}

  async plan(input: PlannerInput): Promise<PlannerOutput | null> {
    const user = [
      `Customer message: ${input.message}`,
      `Identity: ${input.identity}`,
      input.pendingOffer !== undefined ? `Pending consent offer: ${JSON.stringify(input.pendingOffer)}` : '',
      input.findings.length > 0 ? `Findings so far:\n${input.findings.map((f) => `- ${f.summary}`).join('\n')}` : 'Findings so far: none',
      input.notes !== undefined && input.notes !== '' ? `Case notes: ${input.notes}` : '',
      input.denials.length > 0 ? `Denied last round (plan around these):\n${input.denials.map((d) => `- ${d}`).join('\n')}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n')

    const first = await this.chat.complete({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      maxTokens: 500,
    })
    const parsed = parsePlannerOutput(first.text)
    if (parsed.ok) return parsed.plan

    const retry = await this.chat.complete({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${user}\n\nYour last output was invalid: ${parsed.issues}. Respond with ONLY the JSON object.` },
      ],
      maxTokens: 500,
    })
    const second = parsePlannerOutput(retry.text)
    return second.ok ? second.plan : null
  }
}
