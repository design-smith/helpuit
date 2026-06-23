import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { HttpRouteExecutor } from './http-executor.js'
import { QueryRouteCatalog, QueryRouteClient } from './query-routes.js'

let server: Server | undefined
afterEach(() => server?.close())

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('HttpRouteExecutor', () => {
  it('calls the configured route over real HTTP with bearer auth + bound param, returning rows', async () => {
    let captured: { url?: string; auth?: string | string[] } = {}
    const base = await start((req, res) => {
      captured = { url: req.url, auth: req.headers.authorization }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ plan: 'basic' }]))
    })

    const executor = new HttpRouteExecutor({
      baseUrl: base,
      token: 'qr-token',
      routes: [{ name: 'getPlan', method: 'GET', path: '/users/:userId/plan', param: 'userId' }],
    })

    const rows = await executor.execute('getPlan', ['plan'], 'user-1')
    expect(rows).toEqual([{ plan: 'basic' }])
    expect(captured.url).toContain('/users/user-1/plan')
    expect(captured.url).toContain('columns=plan')
    expect(captured.auth).toBe('Bearer qr-token')
  })

  it('binds the param from the verified identity via the client, never caller input', async () => {
    let receivedUrl: string | undefined
    const base = await start((req, res) => {
      receivedUrl = req.url
      res.setHeader('content-type', 'application/json')
      res.end('[]')
    })
    const catalog = new QueryRouteCatalog([{ name: 'getPlan', allowedColumns: ['plan'], param: 'userId' }])
    const executor = new HttpRouteExecutor({
      baseUrl: base,
      token: 't',
      routes: [{ name: 'getPlan', method: 'GET', path: '/users/:userId/plan', param: 'userId' }],
    })
    const client = new QueryRouteClient(catalog, executor)

    await client.query({ route: 'getPlan', columns: ['plan'] }, { userId: 'real-user' })
    expect(receivedUrl).toContain('/users/real-user/plan')
  })
})
