import type { ComposerBriefing } from './kernel.js'
import type { ChatPort } from './planner.js'

const SYSTEM = [
  'You are a warm, concise customer-support representative for this product.',
  'Write a reply to the customer using ONLY the briefing points and documentation extracts provided.',
  'Never mention how the answer was found, internal processes, or anything not in the briefing.',
  'If the briefing asks a clarifying question or offers to log the problem, phrase it naturally.',
  'Reply with the message text only — no JSON, no headings.',
].join('\n')

/** When the model itself fails, the customer still gets a graceful, safe line. */
const FALLBACK_REPLY =
  "Thanks for reaching out — I want to make sure I get this right, so I've flagged it for a closer look. We'll follow up here shortly."

/**
 * The only customer voice. Its input type ({@link ComposerBriefing}) cannot
 * express agent names, code, hypotheses, or ticket mechanics — the silo is the
 * type, not the prompt. Runs on the cheap guidance tier.
 */
export class Composer {
  constructor(private readonly chat: ChatPort) {}

  async compose(briefing: ComposerBriefing, opts: { customerMessage: string }): Promise<string> {
    const user = [
      `Customer message: ${opts.customerMessage}`,
      `Reply intent: ${briefing.intent}`,
      briefing.points.length > 0 ? `Points to convey:\n${briefing.points.map((p) => `- ${p}`).join('\n')}` : '',
      briefing.docExtracts.length > 0
        ? `Documentation extracts:\n${briefing.docExtracts.map((d) => `${d.title !== undefined ? `${d.title}: ` : ''}${d.text}`).join('\n---\n')}`
        : '',
      briefing.question !== undefined ? `Ask the customer: ${briefing.question}` : '',
      briefing.offer !== undefined
        ? `Offer (get their consent): ${briefing.offer === 'file_ticket' ? 'log this with the team on their behalf' : 'link them to the existing report so they are notified when it is fixed'}`
        : '',
    ]
      .filter((line) => line !== '')
      .join('\n')

    try {
      const result = await this.chat.complete({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        maxTokens: 400,
      })
      return result.text.trim() === '' ? FALLBACK_REPLY : result.text.trim()
    } catch {
      return FALLBACK_REPLY
    }
  }
}
