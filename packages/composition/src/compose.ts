import type { HelpuitConfig } from '@helpuit/config'
import {
  DrizzleInvestigationRepository,
  DrizzleTicketing,
  DrizzleControlStore,
  DrizzleAuditRepository,
  DrizzleSpendRepository,
  DrizzleDraftRepository,
  DrizzleEmbeddingRepository,
  type Db,
} from '@helpuit/db'
import { ModelRouter, createAccountModel, createStaticAnalysisModel, MeteredChatModel, type ChatModel } from '@helpuit/llm'
import { PersistingSpendLedger, BudgetGovernor } from '@helpuit/budget'
import { IdentityResolver, createTokenVerifier, type TokenVerifierConfig, type ConversationContext } from '@helpuit/identity'
import { InMemoryDocsIndex, type Doc, type DocsIndex } from '@helpuit/guidance'
import { HttpChatwootClient, type SupportClient, type InboundMessage } from '@helpuit/chatwoot'
import { HttpIntercomClient, parseInboundMessage as parseIntercom, verifyIntercomSignature, extractExternalId } from '@helpuit/intercom'
import { HttpFreshdeskClient, FreshdeskPoller, fetchRequesterExternalId, type PolledMessage } from '@helpuit/freshdesk'
import { HttpHubSpotClient, HubSpotPoller } from '@helpuit/hubspot'
import { HttpZendeskClient, parseInboundMessage as parseZendesk, verifyZendeskSignature } from '@helpuit/zendesk'
import { PersistingAuditLog } from '@helpuit/audit'
import {
  QueryRouteCatalog,
  QueryRouteClient,
  HttpRouteExecutor,
  PostgrestExecutor,
  PostgresExecutor,
  type RouteExecutor,
} from '@helpuit/query-routes'
import { AccountInvestigator } from '@helpuit/account-investigation'
import { StaticCodeInvestigator } from '@helpuit/static-investigation'
import type { FeatureManifest } from '@helpuit/feature-manifest'
import {
  GitHubCodeRetriever,
  GitHubIssueTracker,
  RedactingIssueTracker,
  GitHubIssueSearch,
} from '@helpuit/github'
import { githubOptionsFromConfig } from './github-options.js'
import { EscalationPipeline } from '@helpuit/escalation'
import type { BrowserDriver } from '@helpuit/reproduction'
import { buildReproductionRunner } from './repro-runner.js'
import {
  PlannerEngine,
  Planner,
  Composer,
  PolicyKernel,
  type AccountInvestigationPort,
  type CodeAnalystPort,
  type EscalationPort,
} from '@helpuit/orchestrator'
import { buildEmbedder } from './embedder.js'
import { withCaseEmbedding } from './knowledge-sync.js'
import { KnownIssueMatcher } from './known-issue.js'

export interface CompositionDeps {
  db: Db
  /** Docs to ground answers (used only when `docsIndex` is not supplied). */
  docs?: Doc[]
  /**
   * Live, shared docs index (FCW-04). When provided it's used as-is — so docs the
   * operator ingests at runtime ground answers immediately and survive the config
   * rebuilds that swap the orchestrator. When absent, an index is built from `docs`.
   */
  docsIndex?: DocsIndex
  /** Confirmed feature manifest; when present, enables the Code Analyst. */
  manifest?: FeatureManifest
  /**
   * Browser driver for dynamic reproduction (FCW-06). When provided AND
   * `policy.playwrightEnabled` is on AND sandbox creds exist, a suspected bug is
   * reproduced in a sandbox and the evidence persisted. Absent → no reproduction.
   */
  browserDriver?: BrowserDriver
  /**
   * Support-platform override. Absent → the default Chatwoot connection (bare
   * conversationIds). Present → replies go through this client and state is
   * namespaced `connectionId:nativeId` (see `buildIntercomConnection`).
   */
  connection?: PlatformConnection
}

/** A resolved non-Chatwoot support connection: which client replies + how to parse + its namespace. */
export interface PlatformConnection {
  connectionId: string
  client: SupportClient
  parse: (payload: unknown) => InboundMessage | null
  /** Webhook signature check (rawBody + headers), or undefined when no secret is set. */
  verify?: (rawBody: string, headers: Record<string, string | string[] | undefined>) => boolean
  /** Identity resolver for this platform (e.g. trust an Intercom-verified external_id). */
  identity?: IdentityResolver
  /** Pull the auth token / context out of this platform's webhook payload. */
  extractContext?: (payload: unknown) => ConversationContext
  /** Poll-only platforms (Freshdesk, HubSpot): fetch customer messages since a cursor. Absent on webhook platforms. */
  poll?: (sinceIso: string) => Promise<PolledMessage[]>
  /** When true, this connection's engine is built without account investigation (weak identity → L2 off). */
  disableAccount?: boolean
}

/** Where the auth token lives in a conversation's custom attributes (Helpuit's default key). */
const AUTH_TOKEN_KEY = 'helpuit_auth_token'

/** Poll loops enqueue pre-normalized messages; the connection's parse just validates the shape. */
function parsePolledMessage(payload: unknown): InboundMessage | null {
  const m = payload as { conversationId?: unknown; content?: unknown }
  return typeof m.conversationId === 'string' && typeof m.content === 'string' && m.content !== ''
    ? { conversationId: m.conversationId, content: m.content }
    : null
}

/** Lift a polled message's requester into the auth-token slot for the identity resolver. */
function requesterContext(payload: unknown): ConversationContext {
  return { customAttributes: { [AUTH_TOKEN_KEY]: (payload as { requesterId?: string }).requesterId } }
}

/**
 * Resolve the Intercom connection from config, or undefined when Intercom isn't
 * configured or is toggled off. connectionId `intercom` namespaces its state.
 */
export function buildIntercomConnection(config: HelpuitConfig): PlatformConnection | undefined {
  if (config.intercom === undefined || !config.integrations.intercom) return undefined
  const clientSecret = config.intercom.clientSecret
  return {
    connectionId: 'intercom',
    client: new HttpIntercomClient({
      accessToken: config.intercom.accessToken,
      adminId: config.intercom.adminId,
      baseUrl: config.intercom.baseUrl,
    }),
    parse: parseIntercom,
    // Intercom signs with X-Hub-Signature (sha1 HMAC of the raw body). No secret → no check.
    verify:
      clientSecret !== undefined && clientSecret !== ''
        ? (rawBody, headers) => {
            const header = headers['x-hub-signature']
            return verifyIntercomSignature(rawBody, clientSecret, Array.isArray(header) ? header[0] : header)
          }
        : undefined,
    // Identity = the contact's external_id, trusted as the verified user.
    // ponytail: trusts Intercom Identity Verification (it signs external_id at Messenger
    //   boot). If a merchant can't enable IV, upgrade to verifying a user_hash / fetching
    //   the contact before this can be trusted.
    identity: new IdentityResolver({ verify: (userId) => Promise.resolve(userId ? { userId } : null) }),
    extractContext: (payload) => ({ customAttributes: { [AUTH_TOKEN_KEY]: extractExternalId(payload) } }),
  }
}

/**
 * Resolve the Freshdesk connection from config, or undefined when it isn't
 * configured or is toggled off. Poll-only (no webhook), so no `verify`. The poll
 * loop enqueues pre-normalized messages ({ conversationId, content, requesterId });
 * identity re-fetches the requester contact for its merchant-side id.
 */
export function buildFreshdeskConnection(config: HelpuitConfig): PlatformConnection | undefined {
  if (config.freshdesk === undefined || !config.integrations.freshdesk) return undefined
  const fd = { baseUrl: `https://${config.freshdesk.domain}.freshdesk.com/api/v2`, apiKey: config.freshdesk.apiKey }
  const poller = new FreshdeskPoller(fd)
  return {
    connectionId: 'freshdesk',
    client: new HttpFreshdeskClient(fd),
    poll: (sinceIso) => poller.poll(sinceIso),
    parse: parsePolledMessage,
    identity: new IdentityResolver({
      verify: (requesterId) => fetchRequesterExternalId(fd, requesterId).then((id) => (id ? { userId: id } : null)),
    }),
    extractContext: requesterContext,
  }
}

/**
 * Resolve the HubSpot connection from config, or undefined when it isn't configured
 * or is toggled off. Poll-only (Conversations threads). Identity is the visitor id
 * from the message actor — trusted for L1 continuity only, so account investigation
 * (L2) is off: HubSpot's Visitor-ID isn't a merchant account id.
 */
export function buildHubSpotConnection(config: HelpuitConfig): PlatformConnection | undefined {
  if (config.hubspot === undefined || !config.integrations.hubspot) return undefined
  const hs = { accessToken: config.hubspot.accessToken, senderActorId: config.hubspot.senderActorId, baseUrl: config.hubspot.baseUrl }
  const poller = new HubSpotPoller(hs)
  return {
    connectionId: 'hubspot',
    client: new HttpHubSpotClient(hs),
    poll: (sinceIso) => poller.poll(sinceIso),
    parse: parsePolledMessage,
    identity: new IdentityResolver({ verify: (visitorId) => Promise.resolve(visitorId ? { userId: visitorId } : null) }),
    extractContext: requesterContext,
    disableAccount: true,
  }
}

/**
 * Resolve the Zendesk connection from config, or undefined when it isn't configured
 * or is toggled off. Webhook-based (a trigger POSTs our payload): the signature is
 * HMAC-SHA256 over timestamp+body; identity is the requester's external_id (else
 * email), trusted as Zendesk-managed. Loop-safety lives in the parse (public end-user
 * comments only).
 */
export function buildZendeskConnection(config: HelpuitConfig): PlatformConnection | undefined {
  if (config.zendesk === undefined || !config.integrations.zendesk) return undefined
  const zd = config.zendesk
  const webhookSecret = zd.webhookSecret
  return {
    connectionId: 'zendesk',
    client: new HttpZendeskClient({ baseUrl: `https://${zd.subdomain}.zendesk.com/api/v2`, email: zd.email, apiToken: zd.apiToken }),
    parse: parseZendesk,
    verify:
      webhookSecret !== undefined && webhookSecret !== ''
        ? (rawBody, headers) => {
            const sig = headers['x-zendesk-webhook-signature']
            const ts = headers['x-zendesk-webhook-signature-timestamp']
            return verifyZendeskSignature(
              rawBody,
              Array.isArray(ts) ? ts[0] : ts,
              webhookSecret,
              Array.isArray(sig) ? sig[0] : sig,
            )
          }
        : undefined,
    identity: new IdentityResolver({ verify: (userId) => Promise.resolve(userId ? { userId } : null) }),
    extractContext: (payload) => {
      const p = payload as { requester_external_id?: string; requester_email?: string }
      return { customAttributes: { [AUTH_TOKEN_KEY]: p.requester_external_id ?? p.requester_email } }
    },
  }
}

function toVerifierConfig(identity: HelpuitConfig['identity']): TokenVerifierConfig {
  switch (identity.mode) {
    case 'hmac':
      return { mode: 'hmac', secret: identity.secret ?? '' }
    case 'jwt':
      return { mode: 'jwt', jwksUrl: identity.jwksUrl ?? '', useridClaim: identity.useridClaim }
    case 'endpoint':
      return {
        mode: 'endpoint',
        verifyUrl: identity.verifyUrl ?? '',
        verifyToken: identity.verifyToken,
        useridClaim: identity.useridClaim,
      }
  }
}

/**
 * Wire the production engine (the "new brain") from validated config + a live
 * database. Every collaborator is a REAL adapter: HTTP support clients, metered
 * provider-agnostic LLM tiers, the config-selected identity verifier, and
 * Drizzle-backed repositories.
 *
 * Planner runs on the reasoning tier, the Composer (the only customer voice) on
 * the cheap guidance tier, and the Policy Kernel gates every directive against
 * identity, capabilities, per-case budget, and pending consent. Semantic
 * features (case embedding, known-issue matching) wire only when
 * `models.embedding` resolves — absent, they degrade silently.
 */
export function buildOrchestrator(config: HelpuitConfig, deps: CompositionDeps): PlannerEngine {
  // Default connection = Chatwoot (bare conversationIds). A `connection` override
  // (e.g. Intercom) swaps the reply client + injects that platform's parse and
  // namespace so its state never collides with another connection's.
  const client =
    deps.connection?.client ??
    new HttpChatwootClient({
      baseUrl: config.chatwoot.baseUrl,
      accountId: config.chatwoot.accountId,
      apiAccessToken: config.chatwoot.apiToken,
    })

  // Identity OFF → the verifier never resolves a user, so everyone is anonymous
  // (allowAnonymous is forced on below). This is the "behaves as if not set up" pause.
  const identity = new IdentityResolver(
    config.integrations.identity
      ? createTokenVerifier(toVerifierConfig(config.identity))
      : { verify: () => Promise.resolve(null) },
  )
  const ticketing = new DrizzleTicketing(deps.db)
  const control = new DrizzleControlStore(deps.db)

  // Audit + spend are kept fast in-memory AND persisted durably (so the operator
  // console can read the per-investigation trail and spend back after a restart).
  // Persistence is best-effort: a failed write logs but never breaks intake.
  const auditRepo = new DrizzleAuditRepository(deps.db)
  const audit = new PersistingAuditLog({
    record: (entry) =>
      void auditRepo.record(entry).catch((err: unknown) => console.error('audit persist failed', err)),
  })

  // Lenient: a tier whose provider key is unset boots fine and errors clearly
  // only when used — so the server runs even before secrets are configured.
  // LLM OFF → blank the provider keys so every tier is that lenient "missing key"
  // model: the agent can't reason and never calls a provider until toggled back on.
  const router = new ModelRouter(
    config.integrations.llm ? config.models : { ...config.models, providerKeys: {} },
    { lenient: true },
  )

  // Cost control: meter every LLM call's tokens and enforce day/month caps.
  // The in-memory ledger is the governor's synchronous fast path; the sink mirrors
  // each entry to the database for the console.
  const spendRepo = new DrizzleSpendRepository(deps.db)
  const ledger = new PersistingSpendLedger({
    record: (entry) =>
      void spendRepo.record(entry).catch((err: unknown) => console.error('spend persist failed', err)),
  })
  const governor = new BudgetGovernor(
    { perDay: config.budget.perDay, perMonth: config.budget.perMonth },
    ledger,
  )
  const meter = (chat: ChatModel): ChatModel => new MeteredChatModel(chat, { ledger, governor })

  // GitHub auth (static PAT or App installation tokens) — single source of truth.
  const githubOptions = githubOptionsFromConfig(config)

  // Semantic layer: resolves only when models.embedding is configured for an
  // OpenAI-style provider. Absent → case embedding + known-issue matching are off.
  const embedding = buildEmbedder(config)
  const vectors = embedding !== undefined ? new DrizzleEmbeddingRepository(deps.db) : undefined

  // The Case store. With an embedder, case memory joins the semantic match pool on
  // save and leaves it when the case concludes.
  const drizzleInvestigations = new DrizzleInvestigationRepository(deps.db)
  const investigations =
    embedding !== undefined && vectors !== undefined
      ? withCaseEmbedding(drizzleInvestigations, { embedder: embedding.embedder, store: vectors, model: embedding.model })
      : drizzleInvestigations

  // Prefer the shared live index (operator-ingested docs, survives rebuilds);
  // otherwise build one from the docs passed at construction.
  let docsIndex: DocsIndex
  if (deps.docsIndex !== undefined) {
    docsIndex = deps.docsIndex
  } else {
    const built = new InMemoryDocsIndex()
    built.ingest(deps.docs ?? [])
    docsIndex = built
  }

  // L2 account investigation — pick the data source: a connected Supabase project
  // (direct REST), a direct Postgres URL, or the legacy customer-deployed query
  // routes. All read column-allowlisted, scoped to the verified user's row.
  let accountInvestigation: AccountInvestigationPort | undefined
  const ad = config.accountData
  const accountModel = () => createAccountModel(meter(router.forTier('reasoning')))

  if (ad.source === 'supabase' && ad.supabase !== undefined && ad.table && ad.userColumn && ad.serviceKey && ad.columns.length > 0) {
    const catalog = new QueryRouteCatalog([{ name: 'account', allowedColumns: ad.columns, param: ad.userColumn }])
    const executor: RouteExecutor = new PostgrestExecutor({
      restUrl: ad.supabase.restUrl,
      serviceKey: ad.serviceKey,
      routes: [{ name: 'account', table: ad.table, userColumn: ad.userColumn }],
    })
    accountInvestigation = new AccountInvestigator(
      new QueryRouteClient(catalog, executor),
      [{ route: 'account', columns: ad.columns }],
      accountModel(),
    )
  } else if (ad.source === 'postgres' && ad.table && ad.userColumn && ad.dbUrl && ad.columns.length > 0) {
    const catalog = new QueryRouteCatalog([{ name: 'account', allowedColumns: ad.columns, param: ad.userColumn }])
    const executor: RouteExecutor = new PostgresExecutor({
      connectionString: ad.dbUrl,
      routes: [{ name: 'account', table: ad.table, userColumn: ad.userColumn }],
    })
    accountInvestigation = new AccountInvestigator(
      new QueryRouteClient(catalog, executor),
      [{ route: 'account', columns: ad.columns }],
      accountModel(),
    )
  } else if (config.queryRoutes !== undefined) {
    const catalog = new QueryRouteCatalog(
      config.queryRoutes.routes.map((r) => ({ name: r.name, allowedColumns: r.columns, param: r.param })),
    )
    const executor = new HttpRouteExecutor({
      baseUrl: config.queryRoutes.baseUrl,
      token: config.queryRoutes.token,
      routes: config.queryRoutes.routes.map((r) => ({ name: r.name, method: r.method, path: r.path, param: r.param })),
    })
    const queries = config.queryRoutes.routes.map((r) => ({ route: r.name, columns: r.columns }))
    accountInvestigation = new AccountInvestigator(new QueryRouteClient(catalog, executor), queries, accountModel())
  }

  // The Code Analyst — wired when a confirmed manifest is available AND GitHub is
  // on (it fetches suspect source from the repo). Strictly siloed: the engine keeps
  // its technical layer in case memory; only the customer-safe explanation composes.
  let codeAnalyst: CodeAnalystPort | undefined
  if (config.integrations.github && deps.manifest !== undefined) {
    codeAnalyst = new StaticCodeInvestigator(
      deps.manifest,
      new GitHubCodeRetriever(githubOptions),
      createStaticAnalysisModel(meter(router.forTier('reasoning'))),
    )
  }

  // Dynamic reproduction — wired only when the founder enabled Playwright, a
  // browser driver is available, and sandbox creds exist (else undefined = off).
  const reproduction = buildReproductionRunner(config, { db: deps.db, browserDriver: deps.browserDriver })

  // Consent-gated escalation pipeline: dedup + (optionally) reproduce + file/link a
  // real GitHub issue. The tracker is wrapped in a redaction gate so no PII/secrets
  // reach GitHub even if an upstream summary slips.
  // GitHub OFF → a no-op tracker/search; an escalation becomes a draft (autopublish
  // forced off) and nothing is ever filed or searched on GitHub.
  const escalation: EscalationPort = new EscalationPipeline({
    tracker: config.integrations.github
      ? new RedactingIssueTracker(new GitHubIssueTracker(githubOptions))
      : { create: () => Promise.reject(new Error('GitHub is turned off')), comment: () => Promise.resolve() },
    search: config.integrations.github ? new GitHubIssueSearch(githubOptions) : { search: () => Promise.resolve([]) },
    autopublish: config.integrations.github && config.policy.autopublish === 'auto',
    reproduction,
  })

  // Persist drafted issues (autopublish=draft) for founder approval in the console.
  const draftStore = new DrizzleDraftRepository(deps.db)

  // Semantic known-issue matcher: nearest embedded open issue + a cheap confirm.
  // Runs once per fresh case; no embedder → the flow is silently absent.
  const knownIssue =
    embedding !== undefined && vectors !== undefined
      ? new KnownIssueMatcher({
          embedder: embedding.embedder,
          store: vectors,
          chat: meter(router.forTier('guidance')),
          model: embedding.model,
        })
      : undefined

  return new PlannerEngine({
    planner: new Planner(meter(router.forTier('reasoning'))),
    composer: new Composer(meter(router.forTier('guidance'))),
    kernel: new PolicyKernel({ audit, governor }),
    docs: docsIndex,
    client,
    parse: deps.connection?.parse,
    connectionId: deps.connection?.connectionId,
    // A connection can bring its own identity (e.g. Intercom trusts external_id); else Chatwoot's.
    identity: deps.connection?.identity ?? identity,
    control,
    // A weak-identity connection (e.g. HubSpot Visitor-ID) opts out of account investigation.
    account: deps.connection?.disableAccount === true ? undefined : accountInvestigation,
    codeAnalyst,
    knownIssue,
    escalation,
    draftStore,
    ticketing,
    investigations,
    audit,
    config: {
      // Identity OFF → open the anonymous gate (the verifier already resolves nobody).
      allowAnonymous: config.policy.allowAnonymous || !config.integrations.identity,
    },
  })
}
