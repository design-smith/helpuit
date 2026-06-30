import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { HttpChatwootClient } from './client.js'

let server: Server | undefined
afterEach(() => server?.close())

interface Captured {
  url?: string
  method?: string
  token?: string | string[]
  body: { content: string; message_type: string; private: boolean }
}

async function start(status: number, onRequest: (c: Captured) => void): Promise<string> {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      onRequest({
        url: req.url,
        method: req.method,
        token: req.headers['api_access_token'],
        body: JSON.parse(body),
      })
      res.statusCode = status
      res.end('{}')
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('HttpChatwootClient', () => {
  it('posts a reply to the conversation messages endpoint with the api token', async () => {
    let captured: Captured | undefined
    const baseUrl = await start(200, (c) => (captured = c))
    const client = new HttpChatwootClient({ baseUrl, accountId: 3, apiAccessToken: 'tok' })

    await client.sendReply(7, 'hello there')

    expect(captured?.url).toBe('/api/v1/accounts/3/conversations/7/messages')
    expect(captured?.method).toBe('POST')
    expect(captured?.token).toBe('tok')
    expect(captured?.body).toEqual({ content: 'hello there', message_type: 'outgoing', private: false })
  })

  it('marks private notes with private: true', async () => {
    let captured: Captured | undefined
    const baseUrl = await start(200, (c) => (captured = c))
    const client = new HttpChatwootClient({ baseUrl, accountId: 1, apiAccessToken: 't' })
    await client.sendPrivateNote(5, 'internal')
    expect(captured?.body.private).toBe(true)
  })

  it('throws on a non-2xx response', async () => {
    const baseUrl = await start(400, () => {}) // 400 is non-retryable → fails fast
    const client = new HttpChatwootClient({ baseUrl, accountId: 1, apiAccessToken: 't' })
    await expect(client.sendReply(1, 'x')).rejects.toThrow(/Chatwoot message failed/)
  })

  it('fetches + normalizes the conversation transcript (GET messages)', async () => {
    let seen: { method?: string; url?: string; token?: string | string[] } | undefined
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      seen = { method: req.method, url: req.url, token: req.headers['api_access_token'] }
      res.statusCode = 200
      res.end(
        JSON.stringify({
          payload: [
            { content: 'the export button is broken', message_type: 0, private: false, created_at: 1000 },
            { content: 'looking into it now', message_type: 1, private: false, created_at: 1001 },
            { content: 'internal: repro confirmed', message_type: 1, private: true, created_at: 1002 },
            { content: '', message_type: 2, private: false, created_at: 1003 }, // empty/activity → dropped
          ],
        }),
      )
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server!.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const client = new HttpChatwootClient({ baseUrl: `http://127.0.0.1:${port}`, accountId: 3, apiAccessToken: 'tok' })

    const msgs = await client.getMessages(7)

    expect(seen).toMatchObject({ method: 'GET', url: '/api/v1/accounts/3/conversations/7/messages', token: 'tok' })
    expect(msgs).toEqual([
      { author: 'customer', text: 'the export button is broken', at: 1_000_000 },
      { author: 'agent', text: 'looking into it now', at: 1_001_000 },
      { author: 'system', text: 'internal: repro confirmed', at: 1_002_000 },
    ])
  })

  it('retries a transient 502 and eventually posts the reply', async () => {
    let hits = 0
    const captured: string[] = []
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      hits++
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        if (hits < 2) {
          res.statusCode = 502
          res.end('bad gateway')
          return
        }
        captured.push((JSON.parse(body) as { content: string }).content)
        res.statusCode = 200
        res.end('{}')
      })
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server!.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const baseUrl = `http://127.0.0.1:${port}`

    const client = new HttpChatwootClient({ baseUrl, accountId: 1, apiAccessToken: 'tok' })
    await client.sendReply(7, 'Here is your answer')

    expect(hits).toBe(2) // one failure + one success, transparently retried
    expect(captured).toEqual(['Here is your answer'])
  })
})
