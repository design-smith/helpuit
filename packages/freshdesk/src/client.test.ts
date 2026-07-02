import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { HttpFreshdeskClient } from './client.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeFreshdesk() {
  const calls: Array<{ url: string; auth?: string; body: Record<string, unknown> }> = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      calls.push({ url: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(body) })
      res.setHeader('content-type', 'application/json')
      res.end('{}')
    })
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/v2`
  return { baseUrl, calls }
}

describe('HttpFreshdeskClient', () => {
  it('posts a public reply to the ticket with Basic auth (apiKey:X)', async () => {
    const { baseUrl, calls } = await fakeFreshdesk()
    await new HttpFreshdeskClient({ baseUrl, apiKey: 'key123' }).sendReply('42', 'hello there')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/api/v2/tickets/42/reply')
    expect(calls[0]!.auth).toBe(`Basic ${Buffer.from('key123:X').toString('base64')}`)
    expect(calls[0]!.body).toEqual({ body: 'hello there' })
  })

  it('posts a private (internal) note', async () => {
    const { baseUrl, calls } = await fakeFreshdesk()
    await new HttpFreshdeskClient({ baseUrl, apiKey: 'k' }).sendPrivateNote('42', 'internal')
    expect(calls[0]!.url).toBe('/api/v2/tickets/42/notes')
    expect(calls[0]!.body).toEqual({ body: 'internal', private: true })
  })
})
