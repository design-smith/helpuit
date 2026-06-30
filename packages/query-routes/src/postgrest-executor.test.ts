import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { PostgrestExecutor } from './postgrest-executor.js'
import { QueryRouteCatalog, QueryRouteClient } from './query-routes.js'
import type { VerifiedIdentity } from '@helpuit/identity'

let server: Server | undefined
afterEach(() => server?.close())

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

describe('PostgrestExecutor', () => {
  it('reads the table via Supabase REST: select + eq filter on the verified user, with the service key', async () => {
    let captured: { url?: string; apikey?: string | string[]; auth?: string | string[] } = {}
    const base = await start((req, res) => {
      captured = { url: req.url, apikey: req.headers['apikey'], auth: req.headers.authorization }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ plan: 'pro', status: 'active' }]))
    })

    const executor = new PostgrestExecutor({
      restUrl: `${base}/rest/v1`,
      serviceKey: 'svc-key',
      routes: [{ name: 'account', table: 'profiles', userColumn: 'id' }],
    })

    const rows = await executor.execute('account', ['plan', 'status'], 'user-1')

    expect(rows).toEqual([{ plan: 'pro', status: 'active' }])
    const url = decodeURIComponent(captured.url ?? '')
    expect(url).toContain('/rest/v1/profiles')
    expect(url).toContain('select=plan,status')
    expect(url).toContain('id=eq.user-1') // scoped to the verified user's row
    expect(captured.apikey).toBe('svc-key')
    expect(captured.auth).toBe('Bearer svc-key')
  })

  it('binds the user from the verified identity via the client, and blocks a non-allowlisted column', async () => {
    let receivedUrl: string | undefined
    const base = await start((req, res) => {
      receivedUrl = req.url
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ plan: 'pro' }]))
    })
    const executor = new PostgrestExecutor({
      restUrl: `${base}/rest/v1`,
      serviceKey: 'k',
      routes: [{ name: 'account', table: 'profiles', userColumn: 'id' }],
    })
    const catalog = new QueryRouteCatalog([{ name: 'account', allowedColumns: ['plan', 'status'], param: 'id' }])
    const client = new QueryRouteClient(catalog, executor)
    const identity: VerifiedIdentity = { userId: 'real-user' }

    await client.query({ route: 'account', columns: ['plan'] }, identity)
    expect(decodeURIComponent(receivedUrl ?? '')).toContain('id=eq.real-user')

    await expect(client.query({ route: 'account', columns: ['ssn'] }, identity)).rejects.toThrow(/not allowed/i)
  })
})
