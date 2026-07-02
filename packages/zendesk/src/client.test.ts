import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { HttpZendeskClient } from './client.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeZendesk() {
  const calls: Array<{ url: string; method?: string; auth?: string; body: Record<string, unknown> }> = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      calls.push({ url: req.url ?? '', method: req.method, auth: req.headers.authorization, body: JSON.parse(body) })
      res.setHeader('content-type', 'application/json')
      res.end('{}')
    })
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/v2`
  return { baseUrl, calls }
}

describe('HttpZendeskClient', () => {
  it('posts a public reply as a ticket comment with API-token Basic auth', async () => {
    const { baseUrl, calls } = await fakeZendesk()
    await new HttpZendeskClient({ baseUrl, email: 'me@x.com', apiToken: 'tok' }).sendReply('123', 'hello there')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('PUT')
    expect(calls[0]!.url).toBe('/api/v2/tickets/123.json')
    expect(calls[0]!.auth).toBe(`Basic ${Buffer.from('me@x.com/token:tok').toString('base64')}`)
    expect(calls[0]!.body).toEqual({ ticket: { comment: { body: 'hello there', public: true } } })
  })

  it('posts an internal note (public: false)', async () => {
    const { baseUrl, calls } = await fakeZendesk()
    await new HttpZendeskClient({ baseUrl, email: 'me@x.com', apiToken: 'tok' }).sendPrivateNote('123', 'internal')
    expect(calls[0]!.body).toEqual({ ticket: { comment: { body: 'internal', public: false } } })
  })
})
