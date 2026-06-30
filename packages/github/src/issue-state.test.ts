import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { getIssueState } from './issue-state.js'

let server: Server | undefined
afterEach(() => server?.close())

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('getIssueState', () => {
  it('reads the current open/closed state for an issue', async () => {
    let seen: string | undefined
    const base = await start((req, res) => {
      seen = req.url
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ number: 42, state: 'closed' }))
    })

    const state = await getIssueState({ owner: 'acme', repo: 'product', token: 't', apiBaseUrl: base }, 42)

    expect(seen).toBe('/repos/acme/product/issues/42')
    expect(state).toBe('closed')
  })

  it('treats any non-closed state as open', async () => {
    const base = await start((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ state: 'open' }))
    })
    expect(await getIssueState({ owner: 'o', repo: 'r', token: 't', apiBaseUrl: base }, 1)).toBe('open')
  })
})
