import { describe, it, expect } from 'vitest'
import { Redactor } from './redactor.js'

describe('Redactor', () => {
  const redactor = new Redactor()

  it('redacts email addresses', () => {
    const { text, count } = redactor.redact('Contact me at jane.doe@example.com please')
    expect(text).not.toContain('jane.doe@example.com')
    expect(text).toContain('[REDACTED:email]')
    expect(count).toBe(1)
  })

  it('redacts provider secret tokens (OpenAI / GitHub / AWS / Bearer)', () => {
    const input =
      'keys: sk-abcdEFGH1234abcdEFGH1234abcdEFGH and ghp_0123456789abcdefABCDEF0123456789abcd ' +
      'and AKIAIOSFODNN7EXAMPLE and Authorization: Bearer ey.some.jwt-looking-token'
    const { text } = redactor.redact(input)
    expect(text).not.toMatch(/sk-abcd/)
    expect(text).not.toMatch(/ghp_/)
    expect(text).not.toMatch(/AKIA/)
    expect(text).not.toMatch(/Bearer ey/)
    expect(text).toContain('[REDACTED:secret]')
  })

  it('redacts credit card numbers and leaves ordinary text intact', () => {
    const { text } = redactor.redact('card 4111 1111 1111 1111 ordering widgets')
    expect(text).not.toContain('4111')
    expect(text).toContain('ordering widgets')
    expect(text).toContain('[REDACTED:card]')
  })

  it('redacts phone numbers (NANP and E.164 forms)', () => {
    const { text } = redactor.redact('call me at 555-123-4567 or (555) 987-6543 or +15551230000')
    expect(text).not.toContain('555-123-4567')
    expect(text).not.toContain('987-6543')
    expect(text).not.toContain('+15551230000')
    expect(text).toContain('[REDACTED:phone]')
  })

  it('reports zero redactions for clean text', () => {
    const { text, count } = redactor.redact('The Save button on the billing page failed to respond.')
    expect(count).toBe(0)
    expect(text).toBe('The Save button on the billing page failed to respond.')
  })

  it('redactSecrets removes provider secrets but leaves PII (for the customer output rail)', () => {
    const { text, count } = redactor.redactSecrets(
      'email jane@example.com and key sk-abcdEFGH1234abcdEFGH1234abcdEFGH',
    )
    expect(text).not.toMatch(/sk-abcd/)
    expect(text).toContain('[REDACTED:secret]')
    expect(text).toContain('jane@example.com') // PII left intact — only secrets stripped
    expect(count).toBe(1)
  })
})
