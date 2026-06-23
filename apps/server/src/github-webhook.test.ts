import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseConfig } from '@helpuit/config'
import { createDb, DrizzleTicketing, DrizzleProcessedEvents, type DbHandle } from '@helpuit/db'
import { buildGitHubWebhookHandler } from '@helpuit/composition'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './server.js'

const servers: Server[] = []
let app: FastifyInstance | undefined
let handle: DbHandle | undefined
afterEach(async () => {
  await app?.close()
  for (const s of servers) s.close()
  servers.length = 0
  handle?.close()
})

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void
async function startServer(handler: Handler): Promise<string> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => handler(req, res, body))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const WEBHOOK_SECRET = 'whsec'
function sign(body: string): string {
  return `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`
}

interface CapturedMessage {
  conversationId: number
  content: string
  private: boolean
}

async function liveServer() {
  const messages: CapturedMessage[] = []
  const chatwootUrl = await startServer((req, res, body) => {
    const match = (req.url ?? '').match(/conversations\/(\d+)\/messages/)
    const parsed = JSON.parse(body) as { content: string; private: boolean }
    messages.push({ conversationId: Number(match![1]), content: parsed.content, private: parsed.private })
    res.end('{}')
  })

  const config = parseConfig(
    `
chatwoot: { baseUrl: ${chatwootUrl}, accountId: 3, inboxId: 2 }
github: { owner: acme, repo: product }
identity: { mode: hmac }
reproduction:
  targetUrl: https://app.example.com
  sandboxRoles: [admin]
  login: { url: https://app.example.com/login }
models:
  provider: openai-compatible
  tiers:
    guidance: { model: local }
    reasoning: { model: local }
    vision: { model: local }
`,
    {
      CHATWOOT_API_TOKEN: 'cw',
      GITHUB_TOKEN: 'gh',
      GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
      IDENTITY_HMAC_SECRET: 's',
      OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:9',
      HELPUIT_RESOLUTION_MODE: 'auto',
      SANDBOX_ADMIN_USER: 'a@x.com',
      SANDBOX_ADMIN_PASS: 'pw',
    },
  )

  handle = await createDb(':memory:')
  const ticketing = new DrizzleTicketing(handle.db)
  for (const [investigationId, conversationId] of [
    ['inv-1', 11],
    ['inv-2', 22],
  ] as const) {
    const ticket = await ticketing.create({ investigationId, conversationId })
    await ticketing.linkToIssue(ticket.id, 555)
  }

  app = buildServer({
    github: {
      handle: buildGitHubWebhookHandler(config, { db: handle.db }),
      secret: config.github.webhookSecret,
      idempotency: new DrizzleProcessedEvents(handle.db, 'github'),
    },
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return { base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, messages }
}

const CLOSED = JSON.stringify({ action: 'closed', issue: { number: 555, state_reason: 'completed' } })

function post(base: string, body: string, headers: Record<string, string>) {
  return fetch(`${base}/webhooks/github`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('POST /webhooks/github — lifecycle fan-out', () => {
  it('on a signed "issue closed (completed)", fans the retry message to every linked customer', async () => {
    const { base, messages } = await liveServer()

    const res = await post(base, CLOSED, {
      'x-hub-signature-256': sign(CLOSED),
      'x-github-delivery': 'd1',
    })

    expect(res.status).toBe(200)
    const replies = messages.filter((m) => !m.private)
    expect(replies.map((r) => r.conversationId).sort()).toEqual([11, 22])
    expect(replies[0]!.content).toMatch(/fixed|try again/i)
  })

  it('rejects an invalid signature with 401 and sends nothing', async () => {
    const { base, messages } = await liveServer()
    const res = await post(base, CLOSED, {
      'x-hub-signature-256': 'sha256=deadbeef',
      'x-github-delivery': 'd2',
    })
    expect(res.status).toBe(401)
    expect(messages).toHaveLength(0)
  })

  it('is idempotent on redelivery (same delivery id)', async () => {
    const { base, messages } = await liveServer()
    const headers = { 'x-hub-signature-256': sign(CLOSED), 'x-github-delivery': 'd3' }
    await post(base, CLOSED, headers)
    const second = await post(base, CLOSED, headers)
    expect(await second.json()).toEqual({ status: 'duplicate' })
    expect(messages.filter((m) => !m.private)).toHaveLength(2) // not doubled
  })
})
