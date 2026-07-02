import type { CodeVerdict, StaticAnalysisModel, StaticFindings } from '@helpuit/static-investigation'
import type { ChatModel } from './types.js'

const SYSTEM_PROMPT = [
  'You are a senior engineer doing static code analysis to find a defect.',
  'Given the complaint and the feature code, respond as compact JSON:',
  '{"hypothesis": string, "suspectedFiles": string[], "confidence": number between 0 and 1,',
  '"explanation": string, "verdict": "user_error_or_prerequisite"|"actual_bug"|"explains_behavior"}.',
  'confidence reflects how strongly the code supports the hypothesis; use a low value if the code does not explain it.',
  'explanation is CUSTOMER-SAFE product language: what the product does and what the customer can do — never file names, code, or internals.',
  'verdict: user_error_or_prerequisite when the customer is missing a step; actual_bug when the code is wrong; explains_behavior otherwise.',
].join(' ')

const VERDICTS: ReadonlyArray<CodeVerdict> = ['user_error_or_prerequisite', 'actual_bug', 'explains_behavior']

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function parseStatic(text: string, fallbackFiles: string[]): StaticFindings {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const json = JSON.parse(text.slice(start, end + 1)) as {
        hypothesis?: unknown
        suspectedFiles?: unknown
        confidence?: unknown
        explanation?: unknown
        verdict?: unknown
      }
      if (typeof json.hypothesis === 'string') {
        const files = Array.isArray(json.suspectedFiles)
          ? json.suspectedFiles.filter((f): f is string => typeof f === 'string')
          : fallbackFiles
        return {
          hypothesis: json.hypothesis,
          suspectedFiles: files,
          confidence: clamp01(Number(json.confidence)),
          // Product layer, defensively defaulted: a bogus verdict never invents a bug.
          explanation: typeof json.explanation === 'string' && json.explanation !== '' ? json.explanation : json.hypothesis,
          verdict: VERDICTS.includes(json.verdict as CodeVerdict) ? (json.verdict as CodeVerdict) : 'explains_behavior',
        }
      }
    } catch {
      // fall through
    }
  }
  return {
    hypothesis: text.trim(),
    suspectedFiles: fallbackFiles,
    confidence: 0.2,
    explanation: text.trim(),
    verdict: 'explains_behavior',
  }
}

/** Adapt a `ChatModel` into the `StaticAnalysisModel` the static investigator depends on. */
export function createStaticAnalysisModel(chat: ChatModel): StaticAnalysisModel {
  return {
    async analyze({ complaint, feature, code }) {
      const codeBlob = Object.entries(code)
        .map(([path, source]) => `// ${path}\n${source}`)
        .join('\n\n')
      const { text } = await chat.complete({
        maxTokens: 800,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Feature: ${feature ?? 'unknown'}\nComplaint: ${complaint}\n\nCode:\n${codeBlob || '(none retrieved)'}`,
          },
        ],
      })
      return parseStatic(text, Object.keys(code))
    },
  }
}
