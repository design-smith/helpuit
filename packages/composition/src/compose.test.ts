import { describe, it, expect, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { parseConfig } from '@helpuit/config'
import { createDb, investigations, DrizzleControlStore, type DbHandle } from '@helpuit/db'
import { InMemoryDocsIndex, type Doc, type DocsIndex } from '@helpuit/guidance'
import type { FeatureManifest } from '@helpuit/feature-manifest'
import { buildOrchestrator, buildIntercomConnection } from './compose.js'

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

/** Default planner script: consult docs, then hand the findings to the Composer. */
const DOCS_THEN_COMPOSE = [
  '{"directives":[{"kind":"consult_docs","query":"how to save billing"}]}',
  '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
]

const COMPOSE_DIRECTLY = ['{"directives":[{"kind":"compose_reply","intent":"answer"}]}']

interface HarnessOpts {
  /** Planner responses, one per planning round (repeats the last). */
  plannerScript?: string[]
  composerText?: string
  accountHasHint?: boolean
  docs?: Doc[]
  docsIndex?: DocsIndex
  perDay?: number
  /** Per-integration on/off switches (default: all on). */
  integrations?: Partial<{ github: boolean; chatwoot: boolean; identity: boolean; llm: boolean }>
  /** When 'supabase', wire L2 via a connected Supabase project (direct REST) instead of query routes. */
  accountSource?: 'supabase'
  /** Also wire an Intercom connection (second platform) + return its orchestrator + captured replies. */
  intercom?: boolean
}

async function harness(opts: HarnessOpts = {}) {
  const accountHasHint = opts.accountHasHint ?? true
  const plannerScript = opts.plannerScript ?? DOCS_THEN_COMPOSE

  // One fake provider serves every tier, discriminated by system prompt — exactly
  // how the real router fans one baseUrl out to planner/composer/account/analyst.
  const plannerPrompts: string[] = []
  const composerPrompts: string[] = []
  let plannerCalls = 0
  const llmUrl = await startServer((_req, res, body) => {
    const parsed = JSON.parse(body) as { messages: Array<{ content: string }> }
    const system = parsed.messages[0]?.content ?? ''
    const user = parsed.messages[1]?.content ?? ''
    let content: string
    if (system.includes('routing brain')) {
      plannerPrompts.push(user)
      content = plannerScript[Math.min(plannerCalls++, plannerScript.length - 1)]!
    } else if (system.includes('customer-support representative')) {
      composerPrompts.push(user)
      content = opts.composerText ?? 'Click Save on the billing page.'
    } else if (system.includes('account state')) {
      content = accountHasHint
        ? '{"summary":"You are on the Basic plan; exports are disabled.","classificationHint":"account_data_issue"}'
        : '{"summary":"Your account looks normal."}'
    } else {
      // static code analysis (the Code Analyst's model)
      content =
        '{"hypothesis":"null deref in the save handler","suspectedFiles":["BillingForm.vue"],"confidence":0.85,"explanation":"Saving billing details can fail on our side.","verdict":"actual_bug"}'
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }))
  })

  const chatwootReplies: string[] = []
  const chatwootUrl = await startServer((_req, res, body) => {
    chatwootReplies.push((JSON.parse(body) as { content: string }).content)
    res.end('{}')
  })

  // Fake Intercom API (POST /conversations/{id}/reply). Captures the reply body.
  const intercomReplies: string[] = []
  const intercomUrl = opts.intercom
    ? await startServer((_req, res, body) => {
        intercomReplies.push((JSON.parse(body) as { body: string }).body)
        res.setHeader('content-type', 'application/json')
        res.end('{}')
      })
    : undefined

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
${intercomUrl ? `intercom: { adminId: bot-1, baseUrl: ${intercomUrl} }` : ''}
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
${opts.integrations ? `integrations: ${JSON.stringify(opts.integrations)}` : ''}
${
  opts.accountSource === 'supabase'
    ? `accountData:
  source: supabase
  table: profiles
  userColumn: userId
  columns: [plan]
  supabase: { projectRef: ref, restUrl: ${queryUrl} }`
    : ''
}
`,
    {
      CHATWOOT_API_TOKEN: 'cw',
      INTERCOM_ACCESS_TOKEN: 'it',
      INTERCOM_CLIENT_SECRET: 'cs',
      GITHUB_TOKEN: 'gh',
      GITHUB_API_URL: githubUrl,
      HELPUIT_AUTOPUBLISH: 'auto',
      IDENTITY_HMAC_SECRET: SECRET,
      QUERY_ROUTES_TOKEN: 'qr',
      SUPABASE_SERVICE_KEY: 'svc',
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
  const intercomConnection = buildIntercomConnection(config)
  const intercomOrchestrator = intercomConnection
    ? buildOrchestrator(config, {
        db: handle.db,
        manifest: MANIFEST,
        docsIndex: opts.docsIndex,
        docs: opts.docsIndex !== undefined ? undefined : (opts.docs ?? [{ id: 'd1', text: 'click Save on the billing page' }]),
        connection: intercomConnection,
      })
    : undefined

  return {
    orchestrator,
    chatwootReplies,
    createdIssues,
    plannerPrompts,
    composerPrompts,
    db: handle.db,
    intercomOrchestrator,
    intercomReplies,
    intercomConnection,
  }
}

const message = { message_type: 'incoming', content: 'how do I save billing?', conversation: { id: 7 } }
const authed = { customAttributes: { helpuit_auth_token: token('user-1') } }

describe('buildOrchestrator (the engine, fully wired)', () => {
  it('second platform: an Intercom webhook flows through the engine → reply posted to Intercom, state namespaced', async () => {
    const { intercomOrchestrator, intercomReplies, db } = await harness({
      intercom: true,
      plannerScript: COMPOSE_DIRECTLY,
    })
    const intercomWebhook = {
      topic: 'conversation.user.replied',
      data: {
        item: {
          id: '123',
          conversation_parts: {
            conversation_parts: [{ body: '<p>how do I save billing?</p>', author: { type: 'user' } }],
          },
        },
      },
    }

    const outcome = await intercomOrchestrator!.handleInbound(intercomWebhook, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'replied' })
    expect(intercomReplies).toEqual(['Click Save on the billing page.']) // posted to /conversations/123/reply
    expect((await db.select().from(investigations))[0]!.conversationId).toBe('intercom:123') // namespaced
  })

  it('Intercom identity: a contact external_id is trusted as the verified user; no external_id → denied', async () => {
    const { intercomOrchestrator, intercomConnection, intercomReplies, db } = await harness({
      intercom: true,
      plannerScript: COMPOSE_DIRECTLY,
    })
    const webhook = (contacts: Array<Record<string, unknown>>) => ({
      topic: 'conversation.user.replied',
      data: {
        item: {
          id: '123',
          contacts: { contacts },
          conversation_parts: { conversation_parts: [{ body: 'how do I save billing?', author: { type: 'user' } }] },
        },
      },
    })

    // external_id present (Intercom-verified) → trusted as the verified user → served
    const known = webhook([{ type: 'contact', id: 'ic1', external_id: 'user-1' }])
    const served = await intercomOrchestrator!.handleInbound(known, intercomConnection!.extractContext!(known))
    expect(served).toMatchObject({ handled: true, outcome: 'replied' })
    expect(intercomReplies).toEqual(['Click Save on the billing page.'])
    expect((await db.select().from(investigations))[0]!.customerId).toBe('user-1') // external_id → verified userId

    // no external_id (IV off / anonymous lead) → no identity → denied with a login prompt
    const anon = webhook([{ type: 'contact', id: 'ic2' }])
    const denied = await intercomOrchestrator!.handleInbound(anon, intercomConnection!.extractContext!(anon))
    expect(denied).toMatchObject({ handled: true, outcome: 'denied' })
  })

  it('answers a docs question end-to-end: plan → consult → ack beat → composed reply over real HTTP, persisted', async () => {
    const { orchestrator, chatwootReplies, db, plannerPrompts } = await harness()
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'replied' })
    expect(chatwootReplies).toHaveLength(2) // ack while consulting, then the answer
    expect(chatwootReplies[1]).toBe('Click Save on the billing page.')
    expect(plannerPrompts[1]).toContain('click Save on the billing page') // re-plan saw the docs finding
    expect((await db.select().from(investigations))[0]!.customerId).toBe('user-1')
  })

  it('grounds the customer reply on a live shared docs index (FCW-04 ingestion path)', async () => {
    // The operator-ingested docs live in a shared index; the engine must ground its
    // consults in it (not a fresh empty one). A distinctive phrase only present in
    // the ingested doc proves it reached the Composer's briefing.
    const sharedIndex = new InMemoryDocsIndex()
    sharedIndex.ingest([{ id: 'ingested-1', text: 'To save billing, click the Frobnicate button in Settings.' }])
    const { orchestrator, composerPrompts } = await harness({ docsIndex: sharedIndex })

    await orchestrator.handleInbound(message, authed)

    expect(composerPrompts).toHaveLength(1)
    expect(composerPrompts[0]).toContain('Frobnicate button')
  })

  it('founder takeover: a paused conversation is handled silently by the wired engine', async () => {
    const { orchestrator, chatwootReplies, db } = await harness()
    await new DrizzleControlStore(db).pause('7', 'founder handling this')

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

  it('account consult: real account investigation over real HTTP; classification recorded for the console', async () => {
    const { orchestrator, chatwootReplies, db, composerPrompts } = await harness({
      plannerScript: [
        '{"directives":[{"kind":"consult_account","brief":"check plan"}]}',
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
    })
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'replied' })
    expect(composerPrompts[0]).toContain('Basic plan') // the account summary reached the briefing
    expect(chatwootReplies).toHaveLength(2) // ack + reply
    expect((await db.select().from(investigations))[0]!.classification).toBe('account_data_issue')
  })

  it('account consult via a connected Supabase project: reads account data directly over REST', async () => {
    const { orchestrator, db, composerPrompts } = await harness({
      accountSource: 'supabase',
      plannerScript: [
        '{"directives":[{"kind":"consult_account","brief":"check plan"}]}',
        '{"directives":[{"kind":"compose_reply","intent":"answer"}]}',
      ],
    })
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'replied' })
    expect(composerPrompts[0]).toContain('Basic plan')
    expect((await db.select().from(investigations))[0]!.classification).toBe('account_data_issue')
  })

  it('code analyst → consent → filed: a real GitHub issue only after the customer says yes', async () => {
    const { orchestrator, chatwootReplies, createdIssues, db } = await harness({
      plannerScript: [
        '{"directives":[{"kind":"consult_code","brief":"saving billing fails"}]}',
        '{"directives":[{"kind":"offer_consent","offer":"file_ticket"}]}',
        '{"directives":[{"kind":"file_ticket"}]}',
      ],
    })

    // Turn 1: the analyst investigates (real GitHub code fetch), consent is offered — nothing filed yet.
    const first = await orchestrator.handleInbound(message, authed)
    expect(first).toMatchObject({ handled: true, outcome: 'replied' })
    expect(createdIssues).toHaveLength(0)

    // Turn 2: the customer consents → the pipeline files the real issue.
    const second = await orchestrator.handleInbound({ ...message, content: 'yes please log it' }, authed)
    expect(second).toMatchObject({ handled: true, outcome: 'escalated' })
    expect(createdIssues).toHaveLength(1)
    expect(chatwootReplies.at(-1)!).toBe('Click Save on the billing page.') // composer voices the notice
    const inv = (await db.select().from(investigations))[0]!
    expect(inv.status).toBe('escalated')
    expect(inv.classification).toBe('new_bug')
  })

  it('integration OFF — GitHub disabled: a consented escalation files NO GitHub issue (drafts instead)', async () => {
    const { orchestrator, createdIssues } = await harness({
      integrations: { github: false },
      plannerScript: [
        '{"directives":[{"kind":"offer_consent","offer":"file_ticket"}]}',
        '{"directives":[{"kind":"file_ticket"}]}',
      ],
    })
    await orchestrator.handleInbound(message, authed)
    const outcome = await orchestrator.handleInbound({ ...message, content: 'yes do it' }, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'escalated' })
    expect(createdIssues).toHaveLength(0) // GitHub gated → no issue filed
  })

  it('integration OFF — Identity disabled: an unauthenticated user is served (treated anonymous), not denied', async () => {
    const { orchestrator, chatwootReplies } = await harness({
      integrations: { identity: false },
      plannerScript: COMPOSE_DIRECTLY,
    })
    const outcome = await orchestrator.handleInbound(message, { customAttributes: {} })

    expect(outcome).toMatchObject({ handled: true, outcome: 'replied' })
    expect(chatwootReplies).toEqual(['Click Save on the billing page.'])
  })

  it('integration OFF — LLM disabled: no call ever reaches the model provider', async () => {
    const { orchestrator, plannerPrompts, composerPrompts, chatwootReplies } = await harness({
      integrations: { llm: false },
    })
    // The agent cannot reason with the LLM off; it must not call the provider.
    await orchestrator.handleInbound(message, authed).catch(() => undefined)

    expect(plannerPrompts).toEqual([])
    expect(composerPrompts).toEqual([])
    expect(chatwootReplies).toEqual([])
  })

  it('budget: exceeding the day cap degrades gracefully — safe reply, needs_founder, no more LLM spend', async () => {
    // perDay 15: the planning call records 20 tokens; the kernel's budget probe
    // then force-composes a budget stop and the case is handed to the founder.
    const { orchestrator, chatwootReplies, db } = await harness({ perDay: 15 })
    const outcome = await orchestrator.handleInbound(message, authed)

    expect(outcome).toMatchObject({ handled: true, outcome: 'budget_exceeded' })
    expect(chatwootReplies.at(-1)!).toMatch(/flagged/i)
    expect((await db.select().from(investigations))[0]!.status).toBe('needs_founder')
  })
})
