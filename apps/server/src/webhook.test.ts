import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseConfig } from '@helpuit/config'
import { createDb, investigations, DrizzleProcessedEvents, type DbHandle } from '@helpuit/db'
import { buildOrchestrator } from '@helpuit/composition'
import { RateLimiter } from '@helpuit/budget'
import { createMetrics, type Metrics } from '@helpuit/observability'
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
  const port = (server.address() as AddressInfo).port
  return `http://127.0.0.1:${port}`
}

const SECRET = 'hmac-secret'
function token(userId: string): string {
  return `${userId}.${createHmac('sha256', SECRET).update(userId).digest('hex')}`
}

async function liveServer(opts: { rateLimiter?: RateLimiter; metrics?: Metrics; chatwootEnabled?: () => boolean } = {}) {
  const llmUrl = await startServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [{ message: { content: '{"message":"Click Save on the billing page.","confidence":0.9}' } }],
        usage: {},
      }),
    )
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
  const idempotency = new DrizzleProcessedEvents(handle.db, 'chatwoot')

  app = buildServer({
    chatwoot: {
      intake: (payload, context) => orchestrator.handleInbound(payload, context),
      idempotency,
      rateLimiter: opts.rateLimiter,
      enabled: opts.chatwootEnabled,
    },
    metrics: opts.metrics,
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  return { base, chatwootReplies, db: handle.db }
}

function inboundPayload(id: number) {
  return {
    id,
    message_type: 'incoming',
    content: 'how do I save billing?',
    conversation: { id: 7, custom_attributes: { helpuit_auth_token: token('user-1') } },
  }
}

describe('POST /webhooks/chatwoot — live L1 round-trip', () => {
  it('drives the full pipeline from a real webhook to a real Chatwoot reply', async () => {
    const { base, chatwootReplies, db } = await liveServer()

    const res = await fetch(`${base}/webhooks/chatwoot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inboundPayload(1001)),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(chatwootReplies).toEqual(['Click Save on the billing page.'])
    expect(await db.select().from(investigations)).toHaveLength(1)
  })

  it('is idempotent — a redelivered webhook (same id) does not act twice', async () => {
    const { base, chatwootReplies, db } = await liveServer()
    const send = () =>
      fetch(`${base}/webhooks/chatwoot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inboundPayload(1001)),
      })

    await send()
    const second = await send()

    expect(await second.json()).toEqual({ status: 'duplicate' })
    expect(chatwootReplies).toHaveLength(1)
    expect(await db.select().from(investigations)).toHaveLength(1)
  })

  it('skips intake entirely when the Chatwoot integration is turned off (paused)', async () => {
    const { base, chatwootReplies, db } = await liveServer({ chatwootEnabled: () => false })

    const res = await fetch(`${base}/webhooks/chatwoot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inboundPayload(3001)),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'skipped' })
    expect(chatwootReplies).toEqual([]) // agent stayed silent — nothing processed
    expect(await db.select().from(investigations)).toHaveLength(0)
  })

  it('rate-limits a flood of messages on one conversation', async () => {
    const { base, chatwootReplies } = await liveServer({
      rateLimiter: new RateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    const send = (id: number) =>
      fetch(`${base}/webhooks/chatwoot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inboundPayload(id)), // distinct ids → not deduped
      })

    await send(1)
    await send(2)
    const third = await send(3)

    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({ status: 'rate_limited' })
    expect(chatwootReplies).toHaveLength(2) // only the first two were processed
  })

  it('exposes Prometheus metrics for real webhooks and outcomes at /metrics', async () => {
    const metrics = createMetrics()
    const { base } = await liveServer({ metrics })

    const res = await fetch(`${base}/webhooks/chatwoot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inboundPayload(2001)),
    })
    expect(res.status).toBe(200)

    const scrape = await fetch(`${base}/metrics`)
    expect(scrape.status).toBe(200)
    expect(scrape.headers.get('content-type')).toContain('text/plain')
    const text = await scrape.text()
    expect(text).toContain('helpuit_webhooks_total{source="chatwoot"} 1')
    expect(text).toContain('helpuit_outcomes_total{outcome="guided"} 1')
  })

  it('rejects an oversized body', async () => {
    const { base } = await liveServer()
    const huge = JSON.stringify({ ...inboundPayload(1), content: 'x'.repeat(2_000_000) })
    // The body-size limit rejects an oversized payload either with a 413 or by
    // closing the connection mid-upload (Node's fetch surfaces that as a thrown
    // TypeError). Both mean the flood was refused before any processing.
    let outcome: number | 'connection-closed'
    try {
      const res = await fetch(`${base}/webhooks/chatwoot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: huge,
      })
      outcome = res.status
    } catch {
      outcome = 'connection-closed'
    }
    expect([413, 'connection-closed']).toContain(outcome)
  })
})
