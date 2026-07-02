import { describe, it, expect } from 'vitest'
import { Directive, PlannerOutput, parsePlannerOutput } from './directives.js'

describe('Directive schema', () => {
  const valid: Array<[string, unknown]> = [
    ['consult_docs', { kind: 'consult_docs', query: 'how do refunds work' }],
    ['consult_account', { kind: 'consult_account', brief: 'check subscription state' }],
    ['consult_code', { kind: 'consult_code', brief: 'why would export fail for admins' }],
    ['ask_clarifying', { kind: 'ask_clarifying', question: 'Which page were you on?' }],
    ['offer_consent (attach)', { kind: 'offer_consent', offer: 'attach_known_issue', issueNumber: 42 }],
    ['offer_consent (file)', { kind: 'offer_consent', offer: 'file_ticket' }],
    ['attach_known_issue', { kind: 'attach_known_issue', issueNumber: 42 }],
    ['file_ticket', { kind: 'file_ticket' }],
    ['compose_reply', { kind: 'compose_reply', intent: 'answer' }],
  ]
  it.each(valid)('accepts %s', (_name, value) => {
    expect(Directive.safeParse(value).success).toBe(true)
  })

  const invalid: Array<[string, unknown]> = [
    ['unknown kind', { kind: 'drop_tables' }],
    ['consult_docs without query', { kind: 'consult_docs' }],
    ['empty query', { kind: 'consult_docs', query: '' }],
    ['attach without issue number', { kind: 'attach_known_issue' }],
    ['fractional issue number', { kind: 'attach_known_issue', issueNumber: 1.5 }],
    ['bogus consent offer', { kind: 'offer_consent', offer: 'wire_money' }],
    ['bogus compose intent', { kind: 'compose_reply', intent: 'leak_internals' }],
    ['not an object', 'consult_docs'],
  ]
  it.each(invalid)('rejects %s', (_name, value) => {
    expect(Directive.safeParse(value).success).toBe(false)
  })
})

describe('PlannerOutput schema', () => {
  it('accepts 1-4 directives and defaults the bookkeeping fields', () => {
    const out = PlannerOutput.parse({ directives: [{ kind: 'file_ticket' }] })
    expect(out.directives).toHaveLength(1)
    expect(out.caseNotes).toBe('')
    expect(out.hypotheses).toEqual([])
  })

  it('rejects an empty plan and a 5-directive plan (the per-emission cap)', () => {
    expect(PlannerOutput.safeParse({ directives: [] }).success).toBe(false)
    const five = Array.from({ length: 5 }, () => ({ kind: 'file_ticket' }))
    expect(PlannerOutput.safeParse({ directives: five }).success).toBe(false)
  })
})

describe('parsePlannerOutput', () => {
  it('extracts the JSON object from surrounding LLM prose', () => {
    const raw = 'Here is my plan:\n{"directives":[{"kind":"consult_docs","query":"refund policy"}]}\nDone.'
    const parsed = parsePlannerOutput(raw)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.plan.directives[0]).toEqual({ kind: 'consult_docs', query: 'refund policy' })
  })

  it('reports unparseable text and schema violations as issues (for the retry prompt)', () => {
    const notJson = parsePlannerOutput('I cannot help with that.')
    expect(notJson.ok).toBe(false)
    if (!notJson.ok) expect(notJson.issues).toMatch(/JSON/i)

    const badShape = parsePlannerOutput('{"directives":[{"kind":"drop_tables"}]}')
    expect(badShape.ok).toBe(false)
    if (!badShape.ok) expect(badShape.issues.length).toBeGreaterThan(0)
  })
})
