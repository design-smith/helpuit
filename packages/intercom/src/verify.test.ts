import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyIntercomSignature } from './verify.js'

const secret = 'client-secret'
const body = JSON.stringify({ topic: 'conversation.user.replied' })
const sign = (b: string, s = secret) => `sha1=${createHmac('sha1', s).update(b).digest('hex')}`

describe('verifyIntercomSignature', () => {
  it('accepts a correct sha1 HMAC of the raw body', () => {
    expect(verifyIntercomSignature(body, secret, sign(body))).toBe(true)
  })

  it('rejects a wrong signature, wrong secret, or tampered body', () => {
    expect(verifyIntercomSignature(body, secret, 'sha1=deadbeef')).toBe(false)
    expect(verifyIntercomSignature(body, secret, sign(body, 'wrong'))).toBe(false)
    expect(verifyIntercomSignature('tampered', secret, sign(body))).toBe(false)
  })

  it('rejects a missing or wrong-algorithm header', () => {
    expect(verifyIntercomSignature(body, secret, undefined)).toBe(false)
    expect(verifyIntercomSignature(body, secret, `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`)).toBe(false)
  })
})
