import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseConfig } from '@helpuit/config'
import { createDb, investigations, DrizzleProcessedEvents, DrizzleJobQueue, type DbHandle } from '@helpuit/db'
import { buildOrchestrator } from '@helpuit/composition'
import { Worker } from '@helpuit/queue'
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

const SECRET = 'hmac-secret'
const token = (userId: string): string => `${userId}.${createHmac('sha256', SECRET).update(userId).digest('hex')}`

async function asyncStack() {
  const llmUrl = await startServer((_req, res, body) => {
    const system = (JSON.parse(body) as { messages: Array<{ content: string }> }).messages[0]?.content ?? ''
    const content = system.includes('routing brain')
      ? '{"directives":[{"kind":"compose_reply","intent":"answer"}]}'
      : 'Click Save on the billing page.'
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: {} }))
  })
  const chatwootReplies: string[] = []
  const chatwootUrl = await startServer((_req, res, body) => {
    chatwootReplies.push((JSON.parse(body) as { content: string }).content)
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
      IDENTITY_HMAC_SECRET: SECRET,
      OPENAI_COMPATIBLE_BASE_URL: llmUrl,
      SANDBOX_ADMIN_USER: 'a@x.com',
      SANDBOX_ADMIN_PASS: 'pw',
    },
  )

  handle = await createDb(':memory:')
  const orchestrator = buildOrchestrator(config, {
    db: handle.db,
    docs: [{ id: 'd1', text: 'click Save on the billing page' }],
  })
  const queue = new DrizzleJobQueue(handle.db)

  // The worker runs the REAL orchestrator off the request path.
  const worker = new Worker(
    queue,
    {
      investigation: async (job) => {
        const { payload, context } = job.payload as { payload: unknown; context: { customAttributes?: Record<string, unknown> } }
        await orchestrator.handleInbound(payload, context)
      },
    },
    { retryDelayMs: 0 },
  )

  app = buildServer({
    chatwoot: {
      // Webhook just enqueues — returns immediately, no investigation work inline.
      intake: (payload, context) => queue.enqueue({ type: 'investigation', payload: { payload, context } }),
      idempotency: new DrizzleProcessedEvents(handle.db, 'chatwoot'),
    },
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  return { base, chatwootReplies, queue, worker, db: handle.db }
}

const inbound = (id: number) => ({
  id,
  message_type: 'incoming',
  content: 'how do I save billing?',
  conversation: { id: 7, custom_attributes: { helpuit_auth_token: token('user-1') } },
})

describe('async pipeline: webhook enqueues → worker drains → real orchestrator', () => {
  it('returns 200 immediately without processing, then the worker does the real work', async () => {
    const { base, chatwootReplies, queue, worker, db } = await asyncStack()

    const res = await fetch(`${base}/webhooks/chatwoot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inbound(1001)),
    })

    // Webhook returned fast; nothing has been processed yet.
    expect(res.status).toBe(200)
    expect(chatwootReplies).toEqual([])
    expect((await queue.counts()).pending).toBe(1)
    expect(await db.select().from(investigations)).toHaveLength(0)

    // Worker drains the queue → the real orchestrator runs end-to-end.
    await worker.drain()

    expect(chatwootReplies).toEqual(['Click Save on the billing page.'])
    expect((await queue.counts()).done).toBe(1)
    expect(await db.select().from(investigations)).toHaveLength(1)
  })

  it('idempotency still dedupes a redelivered webhook before it is enqueued', async () => {
    const { base, queue, worker, db } = await asyncStack()
    const send = () =>
      fetch(`${base}/webhooks/chatwoot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inbound(2002)),
      })

    await send()
    const second = await send()
    expect(await second.json()).toEqual({ status: 'duplicate' })

    await worker.drain()
    expect((await queue.counts()).done).toBe(1) // only one job ever enqueued
    expect(await db.select().from(investigations)).toHaveLength(1)
  })
})
