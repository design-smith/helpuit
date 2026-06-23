import type { GuidanceModel, GuidanceInput, GuidanceResult } from '@helpuit/guidance'
import type { ChatModel } from './types.js'

const SYSTEM_PROMPT = [
  'You are a product support agent. Answer the customer using ONLY the provided context.',
  'Context may include documentation and the relevant SOURCE CODE of the feature; prefer what the code actually does over what the docs claim.',
  'Respond as compact JSON: {"message": string, "confidence": number between 0 and 1}.',
  'confidence reflects how well the context answers the question; use a low value when the context is empty or irrelevant.',
].join(' ')

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}

function parseGuidance(text: string): GuidanceResult {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const json = JSON.parse(text.slice(start, end + 1)) as { message?: unknown; confidence?: unknown }
      if (typeof json.message === 'string') {
        return { message: json.message, confidence: clamp01(Number(json.confidence)) }
      }
    } catch {
      // fall through to the plain-text fallback
    }
  }
  return { message: text.trim(), confidence: 0.5 }
}

/**
 * Adapt a provider-agnostic `ChatModel` into the `GuidanceModel` the guidance
 * agent depends on — proving the gateway integrates with `@helpuit/guidance`.
 */
export function createGuidanceModel(chat: ChatModel): GuidanceModel {
  return {
    async generate(input: GuidanceInput): Promise<GuidanceResult> {
      const context = input.context.map((chunk) => `- ${chunk.text}`).join('\n')
      const code = (input.code ?? [])
        .map((snippet) => `### ${snippet.path}\n${snippet.content}`)
        .join('\n\n')
      const codeBlock = code !== '' ? `\n\nRelevant source code:\n${code}` : ''
      const { text } = await chat.complete({
        maxTokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Context:\n${context || '(none)'}${codeBlock}\n\nCustomer: ${input.complaint}`,
          },
        ],
      })
      return parseGuidance(text)
    },
  }
}
