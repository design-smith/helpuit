import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyZendeskSignature } from './verify.js'

const secret = 'webhook-secret'
const timestamp = '2026-07-02T10:00:00Z'
const body = JSON.stringify({ ticket_id: 1 })
const sign = (ts: string, b: string, s = secret) => createHmac('sha256', s).update(ts + b).digest('base64')

describe('verifyZendeskSignature', () => {
  it('accepts a correct base64 HMAC-SHA256 of timestamp + body', () => {
    expect(verifyZendeskSignature(body, timestamp, secret, sign(timestamp, body))).toBe(true)
  })

  it('rejects a wrong signature, secret, tampered body, or mismatched timestamp', () => {
    expect(verifyZendeskSignature(body, timestamp, secret, 'AAAA')).toBe(false)
    expect(verifyZendeskSignature(body, timestamp, secret, sign(timestamp, body, 'wrong'))).toBe(false)
    expect(verifyZendeskSignature('tampered', timestamp, secret, sign(timestamp, body))).toBe(false)
    expect(verifyZendeskSignature(body, 'other-ts', secret, sign(timestamp, body))).toBe(false)
  })

  it('rejects missing signature or timestamp', () => {
    expect(verifyZendeskSignature(body, timestamp, secret, undefined)).toBe(false)
    expect(verifyZendeskSignature(body, undefined, secret, sign(timestamp, body))).toBe(false)
  })
})
