import { describe, it, expect } from 'vitest'
import { classifyMatch, knownIssueCheck, type IssueRef, type IssueSearch } from './match.js'
import { computeSignature } from './signature.js'

const sig = computeSignature({ feature: 'billing', endpoint: 'POST /api/billing/update' })

function issue(number: number, state: 'open' | 'closed', signature?: string): IssueRef {
  return { number, url: `https://github.com/x/y/issues/${number}`, state, signature }
}

describe('classifyMatch', () => {
  it('prefers an open matching issue (link, do not file)', () => {
    const verdict = classifyMatch(sig, [issue(1, 'closed', sig), issue(2, 'open', sig)])
    expect(verdict.verdict).toBe('open')
    expect(verdict.issue?.number).toBe(2)
  })

  it('reports a closed match as a recurrence (file new)', () => {
    const verdict = classifyMatch(sig, [issue(1, 'closed', sig)])
    expect(verdict.verdict).toBe('closed')
    expect(verdict.issue?.number).toBe(1)
  })

  it('reports none when no issue signature matches', () => {
    const verdict = classifyMatch(sig, [issue(1, 'open', 'other-signature')])
    expect(verdict).toEqual({ verdict: 'none', issue: null })
  })
})

describe('knownIssueCheck', () => {
  it('computes the signature, searches, and classifies', async () => {
    const search: IssueSearch = {
      async search(signature) {
        return signature === sig ? [issue(7, 'open', sig)] : []
      },
    }
    const verdict = await knownIssueCheck(
      { feature: 'billing', endpoint: 'POST /api/billing/update' },
      search,
    )
    expect(verdict.verdict).toBe('open')
    expect(verdict.issue?.number).toBe(7)
  })
})
