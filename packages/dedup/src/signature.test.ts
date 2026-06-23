import { describe, it, expect } from 'vitest'
import { computeSignature } from './signature.js'

describe('computeSignature', () => {
  it('is stable for equivalent inputs regardless of case/whitespace', () => {
    const a = computeSignature({
      feature: 'Billing',
      route: '/settings/billing',
      endpoint: 'POST /api/billing/update',
      errorClass: 'HTTP 500',
    })
    const b = computeSignature({
      feature: 'billing ',
      route: '/settings/billing',
      endpoint: 'post /api/billing/update',
      errorClass: 'http 500',
    })
    expect(a).toBe(b)
  })

  it('differs when the failing endpoint differs', () => {
    const a = computeSignature({ feature: 'billing', endpoint: 'POST /api/billing/update' })
    const b = computeSignature({ feature: 'billing', endpoint: 'POST /api/billing/delete' })
    expect(a).not.toBe(b)
  })
})
