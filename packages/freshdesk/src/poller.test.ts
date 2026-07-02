import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { FreshdeskPoller } from './poller.js'

let server: Server | undefined
afterEach(() => server?.close())

async function fakeFreshdesk(routes: (url: string) => unknown) {
  const seen: string[] = []
  server = createServer((req, res) => {
    seen.push(req.url ?? '')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(routes(req.url ?? '')))
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  const baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/v2`
  return { baseUrl, seen }
}

describe('FreshdeskPoller', () => {
  it('returns each updated ticket opening + incoming replies, skipping outgoing/private (loop-safety)', async () => {
    const { baseUrl, seen } = await fakeFreshdesk((url) => {
      if (url.startsWith('/api/v2/tickets?')) return [{ id: 1, updated_at: '2026-07-01T10:00:00Z' }]
      if (url.startsWith('/api/v2/tickets/1')) {
        return {
          id: 1,
          description_text: 'the export button does nothing',
          requester_id: 55,
          conversations: [
            { id: 9, incoming: true, private: false, body_text: 'still broken' },
            { id: 10, incoming: false, body_text: 'we are on it' }, // agent reply → skip
            { id: 11, incoming: true, private: true, body_text: 'internal' }, // private note → skip
          ],
        }
      }
      return {}
    })

    const messages = await new FreshdeskPoller({ baseUrl, apiKey: 'k' }).poll('2026-07-01T00:00:00Z')

    expect(messages).toEqual([
      { messageId: '1:desc', conversationId: '1', content: 'the export button does nothing', requesterId: '55' },
      { messageId: '1:c9', conversationId: '1', content: 'still broken', requesterId: '55' },
    ])
    expect(seen[0]).toContain('updated_since=2026-07-01T00%3A00%3A00Z')
    expect(seen[1]).toContain('include=conversations')
  })

  it('strips HTML from bodies and returns nothing when no tickets changed', async () => {
    const html = await fakeFreshdesk((url) =>
      url.startsWith('/api/v2/tickets?')
        ? [{ id: 2 }]
        : { id: 2, description_text: '', requester_id: 7, conversations: [{ id: 3, incoming: true, body: '<p>hi <b>there</b></p>' }] },
    )
    const withHtml = await new FreshdeskPoller({ baseUrl: html.baseUrl, apiKey: 'k' }).poll('2026-07-01T00:00:00Z')
    expect(withHtml).toEqual([{ messageId: '2:c3', conversationId: '2', content: 'hi there', requesterId: '7' }])

    const empty = await fakeFreshdesk(() => [])
    expect(await new FreshdeskPoller({ baseUrl: empty.baseUrl, apiKey: 'k' }).poll('2026-07-01T00:00:00Z')).toEqual([])
  })
})
