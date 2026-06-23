import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parseConfig } from '@helpuit/config'
import { createDb, investigations, DrizzleControlStore, type DbHandle } from '@helpuit/db'
import { InMemoryDocsIndex, type Doc, type DocsIndex } from '@helpuit/guidance'
import type { FeatureManifest } from '@helpuit/feature-manifest'
import { buildOrchestrator } from './compose.js'

const servers: Server[] = []
let handle: DbHandle | undefined
afterEach(() => {
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
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}`
}

const SECRET = 'hmac-secret'
function token(userId: string): string {
  return `${userId}.${createHmac('sha256', SECRET).update(userId).digest('hex')}`
}

const MANIFEST: FeatureManifest = {
  ref: 'main',
  features: [
    {
      key: 'billing',
      name: 'Billing',
      routes: ['/settings/billing'],
      components: ['BillingForm.vue'],
      endpoints: [],
      docsLinks: [],
      keywords: ['save', 'billing'],
    },
  ],
}

interface HarnessOpts {
  guidanceConfidence?: number
  accountHasHint?: boolean
  docs?: Doc[]
  docsIndex?: DocsIndex
  perDay?: number
}

async function harness(opts: HarnessOpts = {}) {
  const confidence = opts.guidanceConfidence ?? 0.9
  const accountHasHint = opts.accountHasHint ?? true

  const guidancePrompts: string[] = []
  const llmUrl = await startServer((_req, res, body) => {
    const parsed = JSON.parse(body) as { messages: Array<{ content: string }> }
    const system = parsed.messages[0]?.content ?? ''
    let content: string
    if (system.includes('account state')) {
      content = accountHasHint
        ? '{"summary":"You are on the Basic plan; exports are disabled.","classificationHint":"account_data_issue"}'
        : '{"summary":"Your account looks normal."}'
    } else if (system.includes('static code analysis')) {
      content = '{"hypothesis":"null deref in the save handler","suspectedFiles":["BillingForm.vue"],"confidence":0.85}'
    } else {
      guidancePrompts.push(parsed.messages[1]?.content ?? '')
      content = `{"message":"Click Save on the billing page.","confidence":${confidence}}`
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }))
  })

  const chatwootReplies: string[] = []
  const chatwootUrl = await startServer((_req, res, body) => {
    chatwootReplies.push((JSON.parse(body) as { content: string }).content)
    res.end('{}')
  })

  const queryUrl = await startServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify([{ plan: 'basic' }]))
  })

  // Real GitHub-API-shaped server: code retrieval + issue search + issue create.
  const createdIssues: unknown[] = []
  const githubUrl = await startServer((req, res, body) => {
    res.setHeader('content-type', 'application/json')
    const url = req.url ?? ''
    if (url.includes('/search/issues')) {
      res.end(JSON.stringify({ items: [] }))
    } else if (req.method === 'POST' && url.endsWith('/issues')) {
      createdIssues.push(JSON.parse(body))
      res.end(JSON.stringify({ number: 555, html_url: 'https://github.com/acme/product/issues/555' }))
    } else if (url.includes('/contents/')) {
      res.end(JSON.stringify({ content: Buffer.from('function save() {}', 'utf8').toString('base64'), encoding: 'base64' }))
    } else {
      res.end('{}')
    }
  })

  const config = parseConfig(
    `
chatwoot: { baseUrl: ${chatwootUrl}, accountId: 3, inboxId: 2 }
github: { owner: acme, repo: product }
identity: { mode: hmac }
queryRoutes:
  baseUrl: ${queryUrl}
  routes:
    - { name: getPlan, method: GET, path: /plan, param: userId, columns: [plan] }
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
budget:
  perDay: ${opts.perDay ?? 5_000_000}
`,
    {
      CHATWOOT_API_TOKEN: 'cw',
      GITHUB_TOKEN: 'gh',
      GITHUB_API_URL: githubUrl,
      HELPUIT_AUTOPUBLISH: 'auto',
      IDENTITY_HMAC_SECRET: SECRET,
      QUERY_ROUTES_TOKEN: 'qr',
      OPENAI_COMPATIBLE_BASE_URL: llmUrl,
      SANDBOX_ADMIN_USER: 'a@x.com',
      SANDBOX_ADMIN_PASS: 'pw',
    },
  )

  handle = await createDb(':memory:')
  const orchestrator = buildOrchestrator(config, {
    db: handle.db,
    manifest: MANIFEST,
    docsIndex: opts.docsIndex,
    docs: opts.docsIndex !== undefined ? undefined : (opts.docs ?? [{ id: 'd1', text: 'click Save on the billing page' }]),
  })
  return { orchestrator, chatwootReplies, createdIssues, guidancePrompts, db: handle.db }
}

const message = { message_type: 'incoming', content: 'how do I save billing?', conversation: { id: 7 } }
const authed = { customAttributes: { helpuit_auth_token: token('user-1') } }

describe('buildOrchestrator', () => {
  it('L1: real LLM → real reply posted to Chatwoot, persisted in a real DB', async () => {
    const { orchestrator, chatwootReplies, db } = await harness()
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(chatwootReplies).toEqual(['Click Save on the billing page.'])
    expect(outcome).toMatchObject({ handled: true, outcome: 'guided' })
    expect((await db.select().from(investigations))[0]!.customerId).toBe('user-1')
  })

  it('L1 guidance is grounded in the resolved feature code (real manifest → real GitHub fetch → prompt)', async () => {
    const { orchestrator, guidancePrompts } = await harness()
    await orchestrator.handleInbound(message, authed)

    expect(guidancePrompts).toHaveLength(1)
    expect(guidancePrompts[0]!).toContain('Relevant source code:')
    expect(guidancePrompts[0]!).toContain('BillingForm.vue')
    expect(guidancePrompts[0]!).toContain('function save()') // fetched + base64-decoded from the GitHub server
  })

  it('L1 grounds on a live shared docs index passed to buildOrchestrator (FCW-04 ingestion path)', async () => {
    // The operator-ingested docs live in a shared index; buildOrchestrator must
    // ground L1 retrieval in it (not a fresh empty one). A distinctive phrase only
    // present in the ingested doc proves it reached the guidance prompt.
    const sharedIndex = new InMemoryDocsIndex()
    sharedIndex.ingest([{ id: 'ingested-1', text: 'To save billing, click the Frobnicate button in Settings.' }])
    const { orchestrator, guidancePrompts } = await harness({ docsIndex: sharedIndex })

    await orchestrator.handleInbound(message, authed)

    expect(guidancePrompts).toHaveLength(1)
    expect(guidancePrompts[0]!).toContain('Frobnicate button')
  })

  it('founder takeover: a paused conversation is handled silently by the wired orchestrator', async () => {
    const { orchestrator, chatwootReplies, db } = await harness()
    await new DrizzleControlStore(db).pause(7, 'founder handling this')

    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toEqual({ handled: true, outcome: 'paused' })
    expect(chatwootReplies).toEqual([]) // agent stayed silent
    expect(await db.select().from(investigations)).toHaveLength(0)
  })

  it('denies an unauthenticated user with a login prompt, persisting no investigation', async () => {
    const { orchestrator, chatwootReplies, db } = await harness()
    const outcome = await orchestrator.handleInbound(message, { customAttributes: {} })

    expect(outcome).toEqual({ handled: true, outcome: 'denied' })
    expect(chatwootReplies[0]!).toMatch(/log in/i)
    expect(await db.select().from(investigations)).toHaveLength(0)
  })

  it('L2: low-confidence guidance escalates to real account investigation over real HTTP', async () => {
    const { orchestrator, chatwootReplies, db } = await harness({ guidanceConfidence: 0.2 })
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'account_investigated' })
    expect(chatwootReplies[0]!).toContain('Basic plan')
    expect((await db.select().from(investigations))[0]!.classification).toBe('account_data_issue')
  })

  it('L3a→L4: no account explanation → static investigation → files a real GitHub issue, tells the customer', async () => {
    const { orchestrator, chatwootReplies, createdIssues, db } = await harness({
      guidanceConfidence: 0.2,
      accountHasHint: false,
    })
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'escalated' })
    expect(createdIssues).toHaveLength(1)
    expect(chatwootReplies[0]!).toMatch(/escalated it to engineering/i)
    const inv = (await db.select().from(investigations))[0]!
    expect(inv.status).toBe('escalated')
    expect(inv.classification).toBe('new_bug')
  })

  it('budget: exceeding the day cap mid-flow degrades gracefully and stops LLM spend', async () => {
    // perDay 15: the guidance call records 20 tokens; the next LLM call is blocked.
    const { orchestrator, chatwootReplies, db } = await harness({
      guidanceConfidence: 0.2,
      accountHasHint: false,
      perDay: 15,
    })
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'budget_exceeded' })
    expect(chatwootReplies[0]!).toMatch(/flagged/i)
    expect((await db.select().from(investigations))[0]!.status).toBe('needs_founder')
  })
})
