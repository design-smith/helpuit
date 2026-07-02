import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { HttpHubSpotClient } from './client.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeHubSpot() {
  const posts: Array<{ url: string; auth?: string; body: Record<string, unknown> }> = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (req.method === 'GET') {
        // Latest messages of the thread — carries the channel to reply through.
        res.end(JSON.stringify({ results: [{ id: 'm1', channelId: '1000', channelAccountId: '555', direction: 'INCOMING' }] }))
      } else {
        posts.push({ url: req.url ?? '', auth: req.headers.authorization, body: JSON.parse(body) })
        res.end('{}')
      }
    })
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  return { baseUrl, posts }
}

describe('HttpHubSpotClient', () => {
  it('sends a public reply through the thread channel, attributed to the configured actor', async () => {
    const { baseUrl, posts } = await fakeHubSpot()
    await new HttpHubSpotClient({ accessToken: 'pat', senderActorId: 'A-42', baseUrl }).sendReply('t1', 'hello there')

    expect(posts).toHaveLength(1)
    expect(posts[0]!.url).toBe('/conversations/v3/conversations/threads/t1/messages')
    expect(posts[0]!.auth).toBe('Bearer pat')
    expect(posts[0]!.body).toMatchObject({
      type: 'MESSAGE',
      text: 'hello there',
      senderActorId: 'A-42',
      channelId: '1000',
      channelAccountId: '555',
    })
  })

  it('sends an internal note as a COMMENT (no channel needed)', async () => {
    const { baseUrl, posts } = await fakeHubSpot()
    await new HttpHubSpotClient({ accessToken: 'pat', senderActorId: 'A-42', baseUrl }).sendPrivateNote('t1', 'internal')
    expect(posts[0]!.body).toMatchObject({ type: 'COMMENT', text: 'internal', senderActorId: 'A-42' })
  })
})
