import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { HubSpotPoller } from './poller.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeHubSpot(routes: (url: string) => unknown) {
  const seen: string[] = []
  server = createServer((req, res) => {
    seen.push(req.url ?? '')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(routes(req.url ?? '')))
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
  return { baseUrl, seen }
}

describe('HubSpotPoller', () => {
  it('returns incoming visitor messages since the cursor, skipping our replies and older messages', async () => {
    const { baseUrl, seen } = await fakeHubSpot((url) => {
      if (url.includes('/threads/t1/messages')) {
        return {
          results: [
            { id: 'm1', direction: 'INCOMING', text: 'export is broken', createdAt: '2026-07-02T10:00:00Z', senders: [{ actorId: 'V-visitor-1' }] },
            { id: 'm2', direction: 'OUTGOING', text: 'we are on it', createdAt: '2026-07-02T10:05:00Z', senders: [{ actorId: 'A-42' }] }, // our reply
            { id: 'm3', direction: 'INCOMING', text: 'old news', createdAt: '2026-06-01T00:00:00Z', senders: [{ actorId: 'V-visitor-1' }] }, // before cursor
          ],
        }
      }
      if (url.includes('/threads')) return { results: [{ id: 't1', latestMessageTimestamp: '2026-07-02T10:00:00Z' }] }
      return {}
    })

    const messages = await new HubSpotPoller({ accessToken: 'pat', senderActorId: 'A-42', baseUrl }).poll('2026-07-01T00:00:00Z')

    expect(messages).toEqual([
      { messageId: 'm1', conversationId: 't1', content: 'export is broken', requesterId: 'V-visitor-1' },
    ])
    expect(seen[0]).toContain('latestMessageTimestampAfter=2026-07-01T00%3A00%3A00Z')
  })

  it('strips richText when no plain text, and returns nothing when no threads changed', async () => {
    const html = await fakeHubSpot((url) =>
      url.includes('/threads/t9/messages')
        ? { results: [{ id: 'mh', direction: 'INCOMING', richText: '<p>hi <b>there</b></p>', senders: [{ actorId: 'V-9' }] }] }
        : { results: [{ id: 't9' }] },
    )
    expect(await new HubSpotPoller({ accessToken: 'p', senderActorId: 'A-1', baseUrl: html.baseUrl }).poll('2026-07-01T00:00:00Z')).toEqual([
      { messageId: 'mh', conversationId: 't9', content: 'hi there', requesterId: 'V-9' },
    ])

    const empty = await fakeHubSpot(() => ({ results: [] }))
    expect(await new HubSpotPoller({ accessToken: 'p', senderActorId: 'A-1', baseUrl: empty.baseUrl }).poll('2026-07-01T00:00:00Z')).toEqual([])
  })
})
