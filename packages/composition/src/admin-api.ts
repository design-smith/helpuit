import type { HelpuitConfig } from '@helpuit/config'
import { investigationId, type Investigation, type ListOptions, type Page } from '@helpuit/contracts'
import {
  DrizzleInvestigationRepository,
  DrizzleTicketing,
  DrizzleGithubLinks,
  DrizzleAuditRepository,
  DrizzleSpendRepository,
  DrizzleDraftRepository,
  DrizzleEvidenceArtifacts,
  DrizzleControlStore,
  DrizzleDashboardService,
  DrizzleJobQueue,
  DrizzleAlertHistory,
  DrizzleConfigStore,
  DrizzleSecretVault,
  DrizzleConfigAudit,
  DrizzleRestartFlag,
  DrizzleManifestStore,
  type AlertRecord,
  type Db,
  type ConsoleInvestigationFilter,
  type EnrichedInvestigation,
  type TicketListFilter,
  type DraftListFilter,
  type JobListFilter,
  type JobSummary,
  type AuditEntryRecord,
  type SpendEntryRecord,
  type EvidenceArtifactMeta,
  type EvidenceArtifactRecord,
  type GithubLinkRecord,
  type IssueDraftRecord,
  type DashboardOverview,
  type AlertSnapshotData,
} from '@helpuit/db'
import type { Ticket } from '@helpuit/ticketing'
import type { ConversationControl } from '@helpuit/db'
import { SecretBox, deriveKey } from '@helpuit/crypto'
import { GitHubIssueTracker, RedactingIssueTracker, getIssueState, type GitHubOptions } from '@helpuit/github'
import type { ConfigController } from '@helpuit/runtime-config'
import { DraftPublisher, type DraftActionResult } from './draft-actions.js'
import { GitHubConnectionService } from './github-connect.js'
import { SupabaseConnection, type SupabaseConnectionService } from './supabase-connect.js'
import type { DocsService } from './docs-service.js'
import { ReadinessService, type Readiness } from './readiness.js'
import { testLlm, type LlmTestResult } from './llm-test.js'
import { testIdentity, type IdentityTestResult } from './identity-test.js'
import { validateChatwoot, type ChatwootValidation } from './chatwoot-validate.js'
import { autoSetupChatwoot, type ChatwootSetupResult } from './chatwoot-setup.js'
import { setChatwootAuthToken } from './chatwoot-token.js'
import { HttpChatwootClient, type ConversationMessage } from '@helpuit/chatwoot'
import { testGitHub, type GitHubTestResult } from './github-test.js'
import { githubOptionsFromConfig } from './github-options.js'
import { validateManifest, type ManifestValidation } from './manifest-editor.js'
import { supabaseQueryRouteScaffold, type QueryRouteScaffold, type QueryRouteScaffoldOptions } from './query-route-scaffold.js'
import type { FeatureManifest } from '@helpuit/feature-manifest'

const DAY_MS = 86_400_000

/** One investigation with its directly-related records, for the detail view. */
export interface InvestigationDetail {
  investigation: Investigation
  tickets: Ticket[]
  githubLinks: GithubLinkRecord[]
  evidenceCount: number
}

/** Per-investigation spend; `attributed` is false when only global-scoped spend exists. */
export interface InvestigationSpend {
  items: SpendEntryRecord[]
  total: number
  attributed: boolean
}

/**
 * The full operator-console read/act surface. Implemented by `buildAdminApi`
 * over the real repositories; consumed by the server's `registerAdminRoutes`.
 */
/** Result of a live transcript fetch: messages when available, else a reason. */
export interface ConversationTranscript {
  available: boolean
  messages?: ConversationMessage[]
  detail?: string
}

export interface AdminApi {
  overview(): Promise<DashboardOverview>
  alerts(): Promise<AlertSnapshotData>

  listInvestigations(filter: ConsoleInvestigationFilter, options: ListOptions): Promise<Page<EnrichedInvestigation>>
  getInvestigation(id: string): Promise<InvestigationDetail | null>
  /** Live conversation transcript fetched from Chatwoot (by investigation id). null = unknown investigation. */
  conversationTranscript(id: string): Promise<ConversationTranscript | null>
  investigationAudit(id: string, options?: { limit?: number }): Promise<AuditEntryRecord[]>
  investigationEvidence(id: string): Promise<EvidenceArtifactMeta[]>
  getEvidence(id: string): Promise<EvidenceArtifactRecord | null>
  investigationSpend(id: string): Promise<InvestigationSpend>

  listTickets(filter: TicketListFilter, options: ListOptions): Promise<Page<Ticket>>

  /** Filed GitHub issues (links), newest first; optional open/closed filter. */
  listIssues(options: ListOptions, filter?: { status?: 'open' | 'closed' }): Promise<Page<GithubLinkRecord>>

  /** Re-pull current open/closed state from GitHub for not-yet-closed issues. */
  refreshIssues(): Promise<{ synced: number }>

  listDrafts(filter: DraftListFilter, options: ListOptions): Promise<Page<IssueDraftRecord>>
  getDraft(id: string): Promise<IssueDraftRecord | null>
  publishDraft(id: string): Promise<DraftActionResult>
  rejectDraft(id: string, reason?: string): Promise<DraftActionResult>

  listPausedConversations(): Promise<ConversationControl[]>
  pauseConversation(id: number, note?: string): Promise<void>
  resumeConversation(id: number): Promise<void>

  listJobs(filter: JobListFilter, options: ListOptions): Promise<Page<JobSummary>>
  /** The agent's step trail for a job's conversation (job → conversation → investigation → audit). null = unknown job. */
  jobLogs(id: string): Promise<JobLogs | null>
  retryJob(id: string): Promise<{ retried: boolean }>
  purgeJobs(status: 'done' | 'failed'): Promise<{ purged: number }>

  alertHistory(limit?: number): Promise<AlertRecord[]>

  /** GitHub App "connect" flow (manifest → install). */
  githubConnect: GitHubConnectionService
  /** The "Connect Supabase" OAuth flow for L2 account data. */
  supabaseConnect: SupabaseConnectionService

  /** Operator-ingested grounding docs (paste/upload → L1). Present when wired in main.ts. */
  docs?: DocsService

  /** Setup readiness (blockers/warnings/ready). Present only when a supervisor is wired. */
  readiness?(): Promise<Readiness>

  /** Real "Test LLM" connector check. Present only when a supervisor is wired. */
  testLlm?(): Promise<LlmTestResult>

  /** Real "Test identity" connector check (per mode). Present only when a supervisor is wired. */
  testIdentity?(): Promise<IdentityTestResult>

  /** Real "Test connection" check for GitHub (repo reachability via PAT/App auth). Present with a supervisor. */
  testGitHub?(): Promise<GitHubTestResult>

  /** Validate a Chatwoot URL + token against the REST API and prefill account/inbox. Stateless. */
  validateChatwoot(input: { baseUrl: string; token: string }): Promise<ChatwootValidation>

  /** Generate a copy-pasteable Supabase Edge Function + queryRoutes config for L2 (FCW-19). Stateless. */
  supabaseQueryRouteScaffold(opts: QueryRouteScaffoldOptions): QueryRouteScaffold

  /** The confirmed feature manifest (auto-drafted/seeded), or null if none yet. */
  getManifest(): Promise<FeatureManifest | null>
  /** Validate + persist an operator-edited manifest; flags a restart to apply. */
  saveManifest(input: unknown): Promise<ManifestValidation>

  /** Auto-create the Chatwoot Agent Bot + webhook (idempotent). The public URL comes from config. */
  setupChatwoot(input: { baseUrl: string; token: string; accountId: number }): Promise<ChatwootSetupResult>

  /** Set the verified customer token on a Chatwoot conversation (L2 hand-off). Uses the configured Chatwoot creds. */
  setChatwootAuthToken(input: { conversationId: number; authToken: string }): Promise<{ ok: boolean; detail: string }>

  /** Disconnect an integration (github/chatwoot/identity/llm): clear its secrets + reset GitHub App metadata. Restart-class. Present with a supervisor. */
  disconnectConnection?(id: string): Promise<{ ok: boolean; detail: string }>

  /** Runtime config + secrets management. Present only when a supervisor is wired (main.ts). */
  config?: ConfigController
}

export interface AdminApiDeps {
  db: Db
  /** The runtime-config supervisor (enables the config/secrets routes). */
  configController?: ConfigController
  /** The live docs service (enables the docs routes); shares its index with the orchestrator. */
  docs?: DocsService
  now?: () => number
}

/** A job's resolved logs: the agent's step trail for the conversation it processed. */
export interface JobLogs {
  jobId: string
  conversationId: number | null
  investigationId: string | null
  lastError: string | null
  entries: AuditEntryRecord[]
}

/** Extract the Chatwoot conversation id from an investigation job's stored payload (`{ payload: <webhook body>, context }`). */
function conversationIdFromJob(payload: unknown): number | null {
  const p = payload as { payload?: { conversation?: { id?: unknown } } } | null
  const id = p?.payload?.conversation?.id
  return typeof id === 'number' ? id : null
}

/** Secret keys cleared when an integration is disconnected (best-effort; missing keys are no-ops). */
const CONNECTION_SECRETS: Record<string, string[]> = {
  github: ['GITHUB_TOKEN', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_WEBHOOK_SECRET'],
  chatwoot: ['CHATWOOT_API_TOKEN'],
  identity: ['IDENTITY_HMAC_SECRET', 'IDENTITY_VERIFY_TOKEN'],
  llm: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'OPENAI_COMPATIBLE_API_KEY'],
  accountData: ['SUPABASE_SERVICE_KEY', 'SUPABASE_OAUTH_ACCESS_TOKEN', 'SUPABASE_OAUTH_REFRESH_TOKEN', 'ACCOUNT_DB_URL', 'QUERY_ROUTES_TOKEN'],
}

/**
 * Disconnect an integration: delete its secret(s) from the vault, and for GitHub
 * also drop App auth back to PAT + clear the installed-App metadata so the card
 * returns to a clean unconnected state. All of this is restart-class (the bound
 * clients capture creds at build), so it flags a restart rather than applying live.
 */
async function disconnectIntegration(controller: ConfigController, id: string): Promise<{ ok: boolean; detail: string }> {
  const keys = CONNECTION_SECRETS[id]
  if (keys === undefined) return { ok: false, detail: `Unknown integration "${id}".` }
  for (const key of keys) await controller.deleteSecret(key)
  if (id === 'github') {
    const gh = (await controller.resolveEffective()).github
    await controller.applyStructural('github', {
      owner: gh.owner,
      repo: gh.repo,
      productionBranch: gh.productionBranch,
      auth: 'pat',
    })
  }
  if (id === 'accountData') await controller.applyStructural('accountData', { source: 'none' })
  return { ok: true, detail: `Disconnected ${id}.` }
}

/** Wire the operator-console API over the real database + GitHub tracker. */
export function buildAdminApi(config: HelpuitConfig, deps: AdminApiDeps): AdminApi {
  const { db } = deps
  const now = deps.now ?? (() => Date.now())

  const investigations = new DrizzleInvestigationRepository(db)
  const ticketing = new DrizzleTicketing(db)
  const githubLinks = new DrizzleGithubLinks(db)
  const auditRepo = new DrizzleAuditRepository(db)
  const spendRepo = new DrizzleSpendRepository(db)
  const drafts = new DrizzleDraftRepository(db)
  const control = new DrizzleControlStore(db)
  const dashboard = new DrizzleDashboardService(db)
  const queue = new DrizzleJobQueue(db)
  const alertHistory = new DrizzleAlertHistory(db)
  const box = new SecretBox(deriveKey(config.security.encryptionKey ?? 'helpuit-no-key'))
  const evidence = new DrizzleEvidenceArtifacts(db, box)

  const githubConnect = new GitHubConnectionService({
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, box),
    restartFlag: new DrizzleRestartFlag(db),
    audit: new DrizzleConfigAudit(db),
    publicUrl: config.runtime?.publicUrl ?? '',
    appName: 'Helpuit',
    apiBaseUrl: config.github.apiBaseUrl,
  })

  const supabaseConnect = new SupabaseConnection({
    configStore: new DrizzleConfigStore(db),
    vault: new DrizzleSecretVault(db, box),
    restartFlag: new DrizzleRestartFlag(db),
    audit: new DrizzleConfigAudit(db),
    publicUrl: config.runtime?.publicUrl ?? '',
  })

  const githubOptions: GitHubOptions = {
    owner: config.github.owner,
    repo: config.github.repo,
    token: config.github.token,
    apiBaseUrl: config.github.apiBaseUrl,
    ref: config.github.productionBranch,
  }
  const publisher = new DraftPublisher({
    drafts,
    tracker: new RedactingIssueTracker(new GitHubIssueTracker(githubOptions)),
    investigations,
    ticketing,
    githubLinks,
    audit: {
      record: (id, event) =>
        void auditRepo
          .record({ investigationId: id, type: event.type, data: event.data, at: now() })
          .catch((err: unknown) => console.error('audit persist failed', err)),
    },
    issueUrl: (n) => `https://github.com/${config.github.owner}/${config.github.repo}/issues/${n}`,
  })

  return {
    overview: () => dashboard.overview({}),
    alerts: () => dashboard.alertSnapshot({ since: now() - DAY_MS, dayCap: config.budget.perDay }),

    listInvestigations: (filter, options) => investigations.listEnriched(filter, options),
    async getInvestigation(id) {
      const investigation = await investigations.get(investigationId(id))
      if (investigation === null) return null
      const [tickets, links, evidenceMeta] = await Promise.all([
        ticketing.listByInvestigation(id),
        githubLinks.listByInvestigation(id),
        evidence.listMetaForInvestigation(id),
      ])
      return { investigation, tickets, githubLinks: links, evidenceCount: evidenceMeta.length }
    },
    async conversationTranscript(id) {
      const investigation = await investigations.get(investigationId(id))
      if (investigation === null) return null
      // Prefer freshly-resolved creds (a just-connected Chatwoot is in the vault
      // before the restart that rebuilds the orchestrator); fall back to boot config.
      const cw =
        deps.configController !== undefined ? (await deps.configController.resolveEffective()).chatwoot : config.chatwoot
      if (cw === undefined || !cw.apiToken) return { available: false, detail: 'Chatwoot is not connected.' }
      try {
        const client = new HttpChatwootClient({ baseUrl: cw.baseUrl, accountId: cw.accountId, apiAccessToken: cw.apiToken })
        return { available: true, messages: await client.getMessages(investigation.conversationId) }
      } catch (error) {
        return { available: false, detail: error instanceof Error ? error.message : 'Failed to load transcript.' }
      }
    },
    investigationAudit: (id, options) => auditRepo.forInvestigation(id, { limit: options?.limit }),
    investigationEvidence: (id) => evidence.listMetaForInvestigation(id),
    getEvidence: (id) => evidence.get(id),
    async investigationSpend(id) {
      const [items, total] = await Promise.all([
        spendRepo.listForInvestigation(id),
        spendRepo.totalForInvestigation(id),
      ])
      return { items, total, attributed: items.length > 0 }
    },

    listTickets: (filter, options) => ticketing.listAll(filter, options),

    listIssues: (options, filter) => githubLinks.listAll(options, filter),

    async refreshIssues() {
      // Use freshly-resolved github creds when a supervisor is wired (a console-connected
      // repo is in the vault before the restart that rebuilds the orchestrator).
      const cfg = deps.configController !== undefined ? await deps.configController.resolveEffective() : config
      const options = githubOptionsFromConfig(cfg)
      const numbers = await githubLinks.issueNumbersNeedingSync(200)
      let synced = 0
      for (const issueNumber of numbers) {
        try {
          await githubLinks.updateStatus(issueNumber, await getIssueState(options, issueNumber), now())
          synced += 1
        } catch {
          // One failed lookup (rate limit, deleted issue) shouldn't abort the batch.
        }
      }
      return { synced }
    },

    listDrafts: (filter, options) => drafts.list(filter, options),
    getDraft: (id) => drafts.get(id),
    publishDraft: (id) => publisher.publish(id),
    rejectDraft: (id, reason) => publisher.reject(id, reason),

    listPausedConversations: () => control.listPaused(),
    pauseConversation: (id, note) => control.pause(id, note),
    resumeConversation: (id) => control.resume(id),

    listJobs: (filter, options) => queue.listJobs(filter, options),
    async jobLogs(id) {
      const job = await queue.get(id)
      if (job === null) return null
      const conversationId = conversationIdFromJob(job.payload)
      let investigationId: string | null = null
      let entries: AuditEntryRecord[] = []
      if (conversationId !== null) {
        const inv = (await investigations.list({ conversationId }, { limit: 1 })).items[0]
        if (inv !== undefined) {
          investigationId = inv.id
          entries = await auditRepo.forInvestigation(inv.id)
        }
      }
      return { jobId: id, conversationId, investigationId, lastError: job.lastError, entries }
    },
    retryJob: async (id) => ({ retried: await queue.retry(id, now()) }),
    purgeJobs: async (status) => ({ purged: await queue.purge(status) }),

    alertHistory: (limit) => alertHistory.recent(limit),

    githubConnect,
    supabaseConnect,

    docs: deps.docs,

    readiness:
      deps.configController !== undefined
        ? (() => {
            const service = new ReadinessService(deps.configController!)
            return () => service.evaluate()
          })()
        : undefined,

    testLlm:
      deps.configController !== undefined
        ? async () => testLlm((await deps.configController!.resolveEffective()).models)
        : undefined,

    testIdentity:
      deps.configController !== undefined
        ? async () => testIdentity((await deps.configController!.resolveEffective()).identity)
        : undefined,

    testGitHub:
      deps.configController !== undefined
        ? async () => testGitHub(githubOptionsFromConfig(await deps.configController!.resolveEffective()))
        : undefined,

    validateChatwoot: (input) => validateChatwoot(input),

    setupChatwoot: (input) => autoSetupChatwoot({ ...input, publicUrl: config.runtime?.publicUrl ?? '' }),

    setChatwootAuthToken: (input) => {
      const cw = config.chatwoot
      if (cw === undefined) return Promise.resolve({ ok: false, detail: 'Chatwoot is not configured.' })
      return setChatwootAuthToken({ baseUrl: cw.baseUrl, accountId: cw.accountId, apiToken: cw.apiToken }, input)
    },

    supabaseQueryRouteScaffold: (opts) => supabaseQueryRouteScaffold(opts),

    getManifest: () => new DrizzleManifestStore(db).load(),
    async saveManifest(input) {
      const result = validateManifest(input)
      if (!result.ok || result.manifest === undefined) return result
      await new DrizzleManifestStore(db).save(result.manifest)
      // The orchestrator captures the manifest at boot — applies on the next restart.
      await new DrizzleRestartFlag(db).add('manifest')
      return result
    },

    disconnectConnection:
      deps.configController !== undefined ? (id: string) => disconnectIntegration(deps.configController!, id) : undefined,

    config: deps.configController,
  }
}
