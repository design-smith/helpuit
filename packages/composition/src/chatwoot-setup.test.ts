import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { autoSetupChatwoot } from './chatwoot-setup.js'

const servers: Server[] = []
afterEach(() => {
  for (const s of servers) s.close()
  servers.length = 0
})

interface Bot {
  id: number
  name: string
  outgoing_url: string
}
interface Hook {
  id: number
  url: string
}

/** A real, STATEFUL Chatwoot-shaped server: agent_bots + webhooks persist across calls. */
async function chatwootStub(token = 'tok'): Promise<{ base: string; bots: Bot[]; webhooks: Hook[] }> {
  const bots: Bot[] = []
  const webhooks: Hook[] = []
  let botSeq = 0
  let hookSeq = 0

  const handler = (req: IncomingMessage, res: ServerResponse, body: string): void => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.api_access_token !== token) {
      res.statusCode = 401
      res.end('{}')
      return
    }
    const url = req.url ?? ''
    if (/\/agent_bots$/.test(url)) {
      if (req.method === 'GET') return void res.end(JSON.stringify(bots))
      const b = JSON.parse(body) as { name: string; outgoing_url: string }
      const rec: Bot = { id: ++botSeq, name: b.name, outgoing_url: b.outgoing_url }
      bots.push(rec)
      return void res.end(JSON.stringify(rec))
    }
    if (/\/webhooks$/.test(url)) {
      if (req.method === 'GET') return void res.end(JSON.stringify({ payload: webhooks }))
      const w = (JSON.parse(body) as { webhook?: { url: string } }).webhook
      const rec: Hook = { id: ++hookSeq, url: w?.url ?? '' }
      webhooks.push(rec)
      return void res.end(JSON.stringify({ payload: rec }))
    }
    res.statusCode = 404
    res.end('{}')
  }

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => handler(req, res, body))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const base = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
  return { base, bots, webhooks }
}

describe('autoSetupChatwoot', () => {
  it('creates an Agent Bot + webhook pointed at the public URL on a fresh account', async () => {
    const cw = await chatwootStub()

    const result = await autoSetupChatwoot({
      baseUrl: cw.base,
      token: 'tok',
      accountId: 3,
      publicUrl: 'https://helpuit.example.com',
    })

    expect(result.ok).toBe(true)
    expect(result.created).toEqual({ agentBot: true, webhook: true })
    expect(result.agentBotId).toBeTypeOf('number')
    expect(result.webhookId).toBeTypeOf('number')
    expect(cw.bots).toHaveLength(1)
    expect(cw.webhooks).toHaveLength(1)
    expect(cw.webhooks[0]!.url).toBe('https://helpuit.example.com/webhooks/chatwoot')
  })

  it('is idempotent — a second run reuses the existing bot + webhook (no duplicates)', async () => {
    const cw = await chatwootStub()
    const args = { baseUrl: cw.base, token: 'tok', accountId: 3, publicUrl: 'https://helpuit.example.com' }

    const first = await autoSetupChatwoot(args)
    const second = await autoSetupChatwoot(args)

    expect(first.created).toEqual({ agentBot: true, webhook: true })
    expect(second.created).toEqual({ agentBot: false, webhook: false })
    expect(second.agentBotId).toBe(first.agentBotId)
    expect(second.webhookId).toBe(first.webhookId)
    // The real server still holds exactly one of each.
    expect(cw.bots).toHaveLength(1)
    expect(cw.webhooks).toHaveLength(1)
  })

  it('refuses (clearly) when no public URL is configured', async () => {
    const cw = await chatwootStub()

    const result = await autoSetupChatwoot({ baseUrl: cw.base, token: 'tok', accountId: 3, publicUrl: '' })

    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/HELPUIT_PUBLIC_URL/)
    expect(cw.bots).toHaveLength(0) // nothing was created
  })
})
