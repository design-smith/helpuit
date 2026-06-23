import { describe, it, expect } from 'vitest'
import { enforceCustomerOutput } from './rail.js'

describe('enforceCustomerOutput', () => {
  it('strips fenced code blocks from customer-facing text', () => {
    const result = enforceCustomerOutput('Try this:\n```ts\nconst x = 1\n```\nDoes that help?')
    expect(result.text).not.toContain('const x')
    expect(result.violations).toContain('code_block')
  })

  it('strips file paths', () => {
    const result = enforceCustomerOutput('The bug is in src/billing/Form.tsx:42, we are on it.')
    expect(result.text).not.toContain('Form.tsx')
    expect(result.violations).toContain('file_path')
  })

  it('strips SQL statements', () => {
    const result = enforceCustomerOutput('We ran SELECT * FROM users WHERE id = 1 to confirm.')
    expect(result.text).not.toContain('SELECT')
    expect(result.violations).toContain('sql')
  })

  it('strips a provider secret echoed inline (defense against code-grounded answers)', () => {
    const result = enforceCustomerOutput(
      'Your integration uses the key sk-abcdEFGH1234abcdEFGH1234abcdEFGH — keep it safe.',
    )
    expect(result.text).not.toContain('sk-abcd')
    expect(result.violations).toContain('secret')
  })

  it('leaves the customer’s own contact details in a reply intact (not a secret)', () => {
    const result = enforceCustomerOutput("I've sent the invite to teammate@acme.com.")
    expect(result.text).toContain('teammate@acme.com')
    expect(result.violations).toEqual([])
  })

  it('leaves clean product language untouched', () => {
    const clean = 'Click Save after adding the team member — the invite is sent then.'
    const result = enforceCustomerOutput(clean)
    expect(result.text).toBe(clean)
    expect(result.violations).toEqual([])
  })
})
