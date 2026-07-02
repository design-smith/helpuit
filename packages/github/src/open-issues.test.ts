import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { listOpenIssues } from './open-issues.js'

let server: Server | undefined
afterEach(() => server?.close())

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('listOpenIssues', () => {
  it('lists open issues with number, title and body, skipping pull requests', async () => {
    let seen: string | undefined
    const base = await start((req, res) => {
      seen = req.url
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify([
          { number: 7, title: 'Export stalls on large CSVs', body: 'Repro: export 100k rows.' },
          { number: 9, title: 'A PR, not an issue', body: 'x', pull_request: { url: 'pr' } },
          { number: 11, title: 'Login loop', body: null },
        ]),
      )
    })

    const issues = await listOpenIssues({ owner: 'acme', repo: 'product', token: 't', apiBaseUrl: base })

    expect(seen).toBe('/repos/acme/product/issues?state=open&per_page=100')
    expect(issues).toEqual([
      { number: 7, title: 'Export stalls on large CSVs', body: 'Repro: export 100k rows.' },
      { number: 11, title: 'Login loop', body: '' },
    ])
  })
})
