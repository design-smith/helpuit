import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resilientFetch } from './resilient-fetch.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('resilientFetch', () => {
  it('retries a transient 503 and returns the eventual 200', async () => {
    let hits = 0
    const base = await startServer((_req, res) => {
      hits++
      if (hits < 3) {
        res.statusCode = 503
        res.end('try later')
      } else {
        res.statusCode = 200
        res.end('ok')
      }
    })

    const res = await resilientFetch(base, {}, { retry: { retries: 3, baseMs: 1 } })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(hits).toBe(3)
  })

  it('does not retry a 400 and returns it immediately', async () => {
    let hits = 0
    const base = await startServer((_req, res) => {
      hits++
      res.statusCode = 400
      res.end('bad request')
    })

    const res = await resilientFetch(base, {}, { retry: { retries: 3, baseMs: 1 } })

    expect(res.status).toBe(400)
    expect(hits).toBe(1)
  })
})
