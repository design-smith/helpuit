import type { Classification } from '@helpuit/contracts'
import type { AccountModel } from '@helpuit/account-investigation'
import type { ChatModel } from './types.js'

const CLASSIFICATIONS: readonly string[] = [
  'user_error',
  'permission_or_config_issue',
  'account_data_issue',
  'docs_gap',
  'known_bug',
  'new_bug',
  'cannot_reproduce',
  'needs_founder',
]

const SYSTEM_PROMPT = [
  "You are a support engineer analyzing a customer's account state.",
  'Given the query results, respond as compact JSON: {"summary": string, "classificationHint"?: string}.',
  'The summary MUST be customer-safe: no PII, no raw ids — explain the state in plain product terms.',
  'Set classificationHint when the account state explains the issue (e.g. account_data_issue, permission_or_config_issue).',
].join(' ')

function parseAccount(text: string): { summary: string; classificationHint?: Classification } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const json = JSON.parse(text.slice(start, end + 1)) as {
        summary?: unknown
        classificationHint?: unknown
      }
      if (typeof json.summary === 'string') {
        const hint =
          typeof json.classificationHint === 'string' &&
          CLASSIFICATIONS.includes(json.classificationHint)
            ? (json.classificationHint as Classification)
            : undefined
        return { summary: json.summary, ...(hint !== undefined ? { classificationHint: hint } : {}) }
      }
    } catch {
      // fall through
    }
  }
  return { summary: text.trim() }
}

/** Adapt a `ChatModel` into the `AccountModel` the account investigator depends on. */
export function createAccountModel(chat: ChatModel): AccountModel {
  return {
    async summarize({ findings }) {
      const { text } = await chat.complete({
        maxTokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Account query results:\n${JSON.stringify(findings)}` },
        ],
      })
      return parseAccount(text)
    },
  }
}
