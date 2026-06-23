import { describe, it, expect } from 'vitest'
import { redactHar, type Har } from './har.js'

function sampleHar(): Har {
  return {
    log: {
      version: '1.2',
      entries: [
        {
          request: {
            method: 'POST',
            url: 'https://api.example.com/billing?token=secret123&page=2',
            headers: [
              { name: 'Authorization', value: 'Bearer top-secret' },
              { name: 'Content-Type', value: 'application/json' },
            ],
            cookies: [{ name: 'session', value: 'sess-abc' }],
            queryString: [
              { name: 'token', value: 'secret123' },
              { name: 'page', value: '2' },
            ],
            postData: { mimeType: 'application/json', text: '{"email":"u@x.com"}' },
          },
          response: {
            status: 500,
            headers: [{ name: 'Set-Cookie', value: 'session=sess-abc; HttpOnly' }],
            content: { mimeType: 'application/json', text: '{"user":"admin@x.com"}' },
          },
        },
      ],
    },
  }
}

describe('redactHar', () => {
  it('redacts Authorization but keeps benign headers', () => {
    const headers = redactHar(sampleHar()).log.entries[0]!.request!.headers!
    expect(headers.find((h) => h.name === 'Authorization')!.value).toBe('[REDACTED]')
    expect(headers.find((h) => h.name === 'Content-Type')!.value).toBe('application/json')
  })

  it('redacts request cookies and response Set-Cookie', () => {
    const out = redactHar(sampleHar())
    expect(out.log.entries[0]!.request!.cookies![0]!.value).toBe('[REDACTED]')
    expect(out.log.entries[0]!.response!.headers![0]!.value).toBe('[REDACTED]')
  })

  it('redacts sensitive query params in queryString and url, keeps benign ones', () => {
    const out = redactHar(sampleHar())
    const qs = out.log.entries[0]!.request!.queryString!
    expect(qs.find((q) => q.name === 'token')!.value).toBe('[REDACTED]')
    expect(qs.find((q) => q.name === 'page')!.value).toBe('2')
    expect(out.log.entries[0]!.request!.url).toContain('token=[REDACTED]')
    expect(out.log.entries[0]!.request!.url).toContain('page=2')
  })

  it('scrubs PII from request and response bodies', () => {
    const out = redactHar(sampleHar())
    expect(out.log.entries[0]!.request!.postData!.text).not.toContain('u@x.com')
    expect(out.log.entries[0]!.response!.content!.text).not.toContain('admin@x.com')
  })

  it('does not mutate the input', () => {
    const input = sampleHar()
    redactHar(input)
    expect(input.log.entries[0]!.request!.headers![0]!.value).toBe('Bearer top-secret')
  })
})
