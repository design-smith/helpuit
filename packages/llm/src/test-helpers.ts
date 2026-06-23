import { createServer, type IncomingMessage } from 'node:http'

export interface CapturedRequest {
  url?: string
  method?: string
  headers: IncomingMessage['headers']
  body: unknown
}

export interface TestServer {
  baseUrl: string
  requests: CapturedRequest[]
  close: () => Promise<void>
}

/**
 * Start a REAL local HTTP server that records requests and returns whatever
 * `respond` produces. Used to exercise adapters over a genuine request/response
 * cycle — no function mocking.
 */
export async function startTestServer(
  respond: (req: CapturedRequest) => unknown,
): Promise<TestServer> {
  const requests: CapturedRequest[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const captured: CapturedRequest = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: body === '' ? undefined : JSON.parse(body),
      }
      requests.push(captured)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(respond(captured)))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
