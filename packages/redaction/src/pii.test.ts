import { describe, it, expect } from 'vitest'
import { scrubText, scrubDeep } from './pii.js'

describe('scrubText', () => {
  it('redacts email addresses', () => {
    expect(scrubText('contact jane.doe@example.com please')).not.toContain('jane.doe@example.com')
  })

  it('redacts JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    expect(scrubText(`token=${jwt}`)).not.toContain(jwt)
  })

  it('redacts bearer tokens', () => {
    expect(scrubText('Authorization: Bearer abc123.def456')).not.toContain('abc123.def456')
  })

  it('leaves clean support text untouched', () => {
    expect(scrubText('the save button is greyed out')).toBe('the save button is greyed out')
  })
})

describe('scrubDeep', () => {
  it('redacts strings nested in objects and arrays', () => {
    const out = scrubDeep({
      user: { email: 'a@b.com' },
      notes: ['ping me at c@d.com'],
    }) as { user: { email: string }; notes: string[] }
    expect(out.user.email).not.toContain('a@b.com')
    expect(out.notes[0]).not.toContain('c@d.com')
  })

  it('preserves non-string values', () => {
    const out = scrubDeep({ count: 3, ok: true, nothing: null })
    expect(out).toEqual({ count: 3, ok: true, nothing: null })
  })
})
