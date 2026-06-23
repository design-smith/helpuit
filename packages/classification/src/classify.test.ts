import { describe, it, expect } from 'vitest'
import { classifyEvidence } from './classify.js'

describe('classifyEvidence', () => {
  it('classifies a high-confidence static finding as a (suspected) new bug', () => {
    const result = classifyEvidence({ staticConfidence: 0.85 })
    expect(result.classification).toBe('new_bug')
    expect(result.confidence).toBe(0.85)
  })

  it('uses the account hint when account state explains the issue', () => {
    expect(classifyEvidence({ accountHint: 'permission_or_config_issue' }).classification).toBe(
      'permission_or_config_issue',
    )
  })

  it('routes sensitive topics to the founder, overriding other signals', () => {
    const result = classifyEvidence({ sensitiveTopic: true, staticConfidence: 0.99 })
    expect(result.classification).toBe('needs_founder')
  })

  it('hands inconclusive low-confidence static findings to the founder', () => {
    expect(classifyEvidence({ staticConfidence: 0.2 }).classification).toBe('needs_founder')
  })

  it('treats a reproduction as a bug', () => {
    expect(classifyEvidence({ reproduced: true }).classification).toBe('new_bug')
  })
})
