import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { HttpIntercomClient } from './client.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeIntercom() {
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
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  return { base, calls }
}

describe('HttpIntercomClient', () => {
  it('posts a public reply as an admin comment', async () => {
    const { base, calls } = await fakeIntercom()
    await new HttpIntercomClient({ accessToken: 't', adminId: 'a1', baseUrl: base }).sendReply('123', 'hello')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('/conversations/123/reply')
    expect(calls[0]!.auth).toBe('Bearer t')
    expect(calls[0]!.body).toEqual({ message_type: 'comment', type: 'admin', admin_id: 'a1', body: 'hello' })
  })

  it('posts an internal note', async () => {
    const { base, calls } = await fakeIntercom()
    await new HttpIntercomClient({ accessToken: 't', adminId: 'a1', baseUrl: base }).sendPrivateNote('123', 'internal')
    expect(calls[0]!.body).toEqual({ message_type: 'note', type: 'admin', admin_id: 'a1', body: 'internal' })
  })
})
