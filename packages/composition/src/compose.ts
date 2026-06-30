import type { HelpuitConfig } from '@helpuit/config'
import {
  DrizzleInvestigationRepository,
  DrizzleTicketing,
  DrizzleControlStore,
  DrizzleAuditRepository,
  DrizzleSpendRepository,
  DrizzleDraftRepository,
  type Db,
} from '@helpuit/db'
import {
  ModelRouter,
  createGuidanceModel,
  createAccountModel,
  createStaticAnalysisModel,
  MeteredChatModel,
  type ChatModel,
} from '@helpuit/llm'
import { PersistingSpendLedger, BudgetGovernor } from '@helpuit/budget'
import { IdentityResolver, createTokenVerifier, type TokenVerifierConfig } from '@helpuit/identity'
import { GuidanceAgent, InMemoryDocsIndex, ManifestCodeContextProvider, type Doc, type DocsIndex } from '@helpuit/guidance'
import { HttpChatwootClient } from '@helpuit/chatwoot'
import { PersistingAuditLog } from '@helpuit/audit'
import type { MatchVerdict } from '@helpuit/dedup'
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
  Orchestrator,
  type AccountInvestigationPort,
  type StaticInvestigationPort,
  type EscalationPort,
} from '@helpuit/orchestrator'

/** Default confidence threshold for resolving guidance vs escalating. */
const GUIDANCE_THRESHOLD = 0.7

export interface CompositionDeps {
  db: Db
  /** Docs to ground L1 guidance (used only when `docsIndex` is not supplied). */
  docs?: Doc[]
  /**
   * Live, shared docs index (FCW-04). When provided it's used as-is — so docs the
   * operator ingests at runtime ground answers immediately and survive the config
   * rebuilds that swap the orchestrator. When absent, an index is built from `docs`.
   */
  docsIndex?: DocsIndex
  /** Confirmed feature manifest; when present, enables L3a static code investigation. */
  manifest?: FeatureManifest
  /**
   * Browser driver for L3b dynamic reproduction (FCW-06). When provided AND
   * `policy.playwrightEnabled` is on AND sandbox creds exist, a suspected bug is
   * reproduced in a sandbox and the evidence persisted. Absent → no reproduction.
   */
  browserDriver?: BrowserDriver
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
 * Wire the production Orchestrator from validated config + a live database.
 * Every collaborator here is a REAL adapter: HTTP Chatwoot client, the
 * provider-agnostic LLM-backed guidance model, the config-selected identity
 * verifier, and Drizzle-backed repositories.
 *
 * Deeper capabilities (account investigation, static investigation, escalation,
 * GitHub-backed known-issue dedup) attach in their own batches; until then the
 * spine runs the L1 guidance path and the known-issue check is a no-op.
 */
export function buildOrchestrator(config: HelpuitConfig, deps: CompositionDeps): Orchestrator {
  const client = new HttpChatwootClient({
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
  const investigations = new DrizzleInvestigationRepository(deps.db)
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
  // Ground L1 guidance in the resolved feature's real code when a confirmed
  // manifest is available (issue 27) — degrades to docs-only otherwise.
  // GitHub OFF → no code grounding (the retriever would hit GitHub).
  const codeContext =
    config.integrations.github && deps.manifest !== undefined
      ? new ManifestCodeContextProvider(deps.manifest, new GitHubCodeRetriever(githubOptions))
      : undefined
  const guidance = new GuidanceAgent(
    docsIndex,
    createGuidanceModel(meter(router.forTier('guidance'))),
    codeContext,
  )

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

  // L3a static code investigation — wired when a confirmed manifest is available
  // AND GitHub is on (it fetches suspect source from the repo).
  let staticInvestigation: StaticInvestigationPort | undefined
  if (config.integrations.github && deps.manifest !== undefined) {
    staticInvestigation = new StaticCodeInvestigator(
      deps.manifest,
      new GitHubCodeRetriever(githubOptions),
      createStaticAnalysisModel(meter(router.forTier('reasoning'))),
    )
  }

  // L3b dynamic reproduction — wired only when the founder enabled Playwright, a
  // browser driver is available, and sandbox creds exist (else undefined = off).
  const reproduction = buildReproductionRunner(config, { db: deps.db, browserDriver: deps.browserDriver })

  // L3a → L4 escalation pipeline: dedup + (optionally) reproduce + file/link a real
  // GitHub issue. The tracker is wrapped in a redaction gate so no PII/secrets reach
  // GitHub even if an upstream summary slips.
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

  // GitHub-backed intake dedup is approximate (no signature at intake); off for now.
  const knownIssue = async (): Promise<MatchVerdict> => ({ verdict: 'none', issue: null })

  return new Orchestrator({
    client,
    identity,
    investigations,
    guidance,
    ticketing,
    audit,
    knownIssue,
    accountInvestigation,
    staticInvestigation,
    escalation,
    draftStore,
    control,
    config: {
      // Identity OFF → open the anonymous gate (the verifier already resolves nobody).
      allowAnonymous: config.policy.allowAnonymous || !config.integrations.identity,
      guidanceThreshold: GUIDANCE_THRESHOLD,
    },
  })
}
