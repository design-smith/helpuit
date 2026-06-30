import { useEffect, useRef } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

// ---- shared DTO types (mirror the admin API responses) ----

export interface Page<T> {
  items: T[]
  total: number
}

export interface Investigation {
  id: string
  conversationId: number
  customerId: string | null
  status: string
  level: string
  classification: string | null
  confidence: number | null
  createdAt: number
  updatedAt: number
  /** Console list flags (present on /admin/investigations; drive the Conversations filters/badges). */
  hasTicket?: boolean
  hasOpenIssue?: boolean
  pendingDraft?: boolean
}

/** One message in a live conversation transcript (from Chatwoot). */
export interface TranscriptMessage {
  author: 'customer' | 'agent' | 'system'
  text: string
  at: number
}
export interface ConversationTranscript {
  available: boolean
  messages?: TranscriptMessage[]
  detail?: string
}

export interface Overview {
  investigations: {
    total: number
    byStatus: Record<string, number>
    byClassification: Record<string, number>
    recent: Array<{ id: string; status: string; level: string; classification: string | null; createdAt: number }>
  }
  reproduction: { attempts: number; reproduced: number; successRate: number }
  spend: { totalTokens: number }
  escalations: { issuesLinked: number }
  queue: { pending: number; active: number; done: number; failed: number }
  control: { pausedConversations: number }
}

export interface AuditEntry {
  id: number
  investigationId: string
  type: string
  data: Record<string, unknown> | null
  at: number
}

export interface EvidenceMeta {
  id: string
  investigationId: string
  type: string
  redactionStatus: string
  createdAt: number
}

export interface SpendEntry {
  id: number
  investigationId: string
  amount: number
  at: number
}

export interface Ticket {
  id: string
  investigationId: string
  conversationId: number
  issueNumber: number | null
}

export interface GithubLink {
  id: string
  investigationId: string
  issueNumber: number
  issueUrl: string
  status: string | null
  createdAt: number
}

export interface InvestigationDetail {
  investigation: Investigation
  tickets: Ticket[]
  githubLinks: GithubLink[]
  evidenceCount: number
}

export interface Draft {
  id: string
  investigationId: string
  conversationId: number
  title: string
  body: string
  labels: string[]
  severity: string
  status: 'pending' | 'published' | 'rejected'
  issueNumber: number | null
  issueUrl: string | null
  rejectionReason: string | null
  createdAt: number
}

export interface JobSummary {
  id: string
  type: string
  status: string
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

/** A job's resolved logs — the agent's step trail for the conversation it processed. */
export interface JobLogs {
  jobId: string
  conversationId: number | null
  investigationId: string | null
  lastError: string | null
  entries: AuditEntry[]
}

export interface PausedConversation {
  conversationId: number
  paused: boolean
  note: string | null
  updatedAt: number
}

/** A persisted grounding doc (feeds the L1 docs index), as the console lists it. */
export interface DocRecord {
  id: string
  title: string | null
  text: string
  source: string | null
  externalId: string | null
  createdAt: number
}

// ---- fetch client + auth handling ----

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let onUnauthorized: () => void = () => {}
/** App registers a handler that redirects to /login when any request 401s. */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (res.status === 401) {
    onUnauthorized()
    throw new ApiError(401, 'unauthorized')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function qs(params: object): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}

// ---- query keys ----
export const keys = {
  overview: ['overview'] as const,
  investigations: (f: object) => ['investigations', f] as const,
  investigation: (id: string) => ['investigation', id] as const,
  audit: (id: string) => ['investigation', id, 'audit'] as const,
  evidence: (id: string) => ['investigation', id, 'evidence'] as const,
  spend: (id: string) => ['investigation', id, 'spend'] as const,
  transcript: (id: string) => ['investigation', id, 'transcript'] as const,
  tickets: (f: object) => ['tickets', f] as const,
  issues: (f: object) => ['issues', f] as const,
  jobLogs: (id: string) => ['jobs', id, 'logs'] as const,
  drafts: (status: string) => ['drafts', status] as const,
  jobs: (f: object) => ['jobs', f] as const,
  paused: ['paused'] as const,
  docs: ['docs'] as const,
}

// ---- queries ----
export const useOverview = () =>
  useQuery({ queryKey: keys.overview, queryFn: () => api<Overview>('/admin/overview'), refetchInterval: 12_000 })

export interface InvestigationFilter {
  status?: string
  classification?: string
  /** Conversations-page relation filters (sent only when true). */
  ticket?: boolean
  openIssue?: boolean
  pendingDraft?: boolean
  limit?: number
  offset?: number
}
export const useInvestigations = (filter: InvestigationFilter) =>
  useQuery({
    queryKey: keys.investigations(filter),
    queryFn: () => api<Page<Investigation>>(`/admin/investigations${qs(filter)}`),
  })

export const useInvestigation = (id: string) =>
  useQuery({ queryKey: keys.investigation(id), queryFn: () => api<InvestigationDetail>(`/admin/investigations/${id}`) })

export const useTranscript = (id: string) =>
  useQuery({
    queryKey: keys.transcript(id),
    queryFn: () => api<ConversationTranscript>(`/admin/conversations/${id}/transcript`),
  })

export const useAudit = (id: string) =>
  useQuery({
    queryKey: keys.audit(id),
    queryFn: () => api<{ items: AuditEntry[] }>(`/admin/investigations/${id}/audit`).then((r) => r.items),
  })

export const useEvidence = (id: string) =>
  useQuery({
    queryKey: keys.evidence(id),
    queryFn: () => api<{ items: EvidenceMeta[] }>(`/admin/investigations/${id}/evidence`).then((r) => r.items),
  })

export const useSpend = (id: string) =>
  useQuery({
    queryKey: keys.spend(id),
    queryFn: () => api<{ items: SpendEntry[]; total: number; attributed: boolean }>(`/admin/investigations/${id}/spend`),
  })

export const useTickets = (filter: { investigationId?: string; limit?: number; offset?: number }) =>
  useQuery({ queryKey: keys.tickets(filter), queryFn: () => api<Page<Ticket>>(`/admin/tickets${qs(filter)}`) })

export const useIssues = (filter: { status?: 'open' | 'closed'; limit?: number; offset?: number }) =>
  useQuery({
    queryKey: keys.issues(filter),
    queryFn: () => api<Page<GithubLink>>(`/admin/issues${qs(filter)}`),
    refetchInterval: 30_000, // keep open/closed reasonably fresh
  })

/** Re-pull current open/closed state from GitHub, then refresh the list. */
export function useRefreshIssues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiSoft<{ synced: number }>('/admin/issues/refresh', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['issues'] }),
  })
}

export const useDrafts = (status: 'pending' | 'published' | 'rejected') =>
  useQuery({ queryKey: keys.drafts(status), queryFn: () => api<Page<Draft>>(`/admin/drafts${qs({ status })}`) })

export const useJobs = (filter: { status?: string; limit?: number }) =>
  useQuery({ queryKey: keys.jobs(filter), queryFn: () => api<Page<JobSummary>>(`/admin/jobs${qs(filter)}`) })

/** A job's agent step-trail — fetched lazily (only when its row is expanded). */
export const useJobLogs = (id: string, enabled: boolean) =>
  useQuery({ queryKey: keys.jobLogs(id), queryFn: () => api<JobLogs>(`/admin/jobs/${id}/logs`), enabled })

export const usePaused = () =>
  useQuery({
    queryKey: keys.paused,
    queryFn: () => api<{ items: PausedConversation[] }>('/admin/conversations/paused').then((r) => r.items),
    refetchInterval: 15_000,
  })

// ---- mutations ----
export const useLogin = () =>
  useMutation({
    mutationFn: (token: string) => api('/admin/login', { method: 'POST', body: JSON.stringify({ token }) }),
  })

export const useLogout = () =>
  useMutation({ mutationFn: () => api('/admin/logout', { method: 'POST' }) })

export function usePublishDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ status: string }>(`/admin/drafts/${id}/publish`, { method: 'POST' }),
    onSuccess: () => invalidateDraftsAndOverview(qc),
  })
}

export function useRejectDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<{ status: string }>(`/admin/drafts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => invalidateDraftsAndOverview(qc),
  })
}

export function usePauseConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      api(`/admin/conversations/${id}/pause`, { method: 'POST', body: JSON.stringify({ note }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.paused }),
  })
}

export function useResumeConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api(`/admin/conversations/${id}/resume`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.paused }),
  })
}

function invalidateDraftsAndOverview(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['drafts'] })
  void qc.invalidateQueries({ queryKey: keys.overview })
}

// ---- config + secrets (Phase 2) ----

export interface SecretCatalogEntry {
  key: string
  set: boolean
  required: boolean
  source: 'vault' | 'env' | 'unset'
}

export interface RestartStatus {
  pending: boolean
  reasons: string[]
  setAt: number | null
}

export interface EffectiveConfigView {
  config: Record<string, any>
  secrets: SecretCatalogEntry[]
  structuralIssues: string[]
  restart: RestartStatus
  editableSections: string[]
}

export type ApplyResult = { ok: true; mode: string } | { ok: false; code: string; issues: string[] }

/** A fetch that returns the parsed body even on 4xx (so validation errors surface, not throw). */
async function apiSoft<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
  if (res.status === 401) {
    onUnauthorized()
    throw new ApiError(401, 'unauthorized')
  }
  return (await res.json()) as T
}

export const useEffectiveConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => api<EffectiveConfigView>('/admin/config/effective') })

export const useRestartStatus = () =>
  useQuery({
    queryKey: ['restart-status'],
    queryFn: () => api<RestartStatus>('/admin/config/restart-status'),
    refetchInterval: 20_000,
  })

/** Trigger a graceful one-click restart (FCW-15); a process supervisor brings the app back. */
export function useRestartNow() {
  return useMutation({
    mutationFn: () => apiSoft<{ status: string; reasons: string[] }>('/admin/config/restart', { method: 'POST' }),
  })
}

export function useApplySection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ section, value }: { section: string; value: unknown }) =>
      apiSoft<ApplyResult>(`/admin/config/section/${section}`, { method: 'PUT', body: JSON.stringify(value) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

export function useSetSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiSoft<{ ok?: boolean; status?: string }>(`/admin/config/secret/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
    },
  })
}

export function useDeleteSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => api(`/admin/config/secret/${key}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
    },
  })
}

/**
 * Live on/off toggle for the integrations enable-map. Sends the FULL map — the
 * section is replaced wholesale on the server, so a partial send would reset the
 * others to their defaults. Applies live (no restart).
 */
export function useToggleIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (next: Record<string, boolean>) =>
      apiSoft<ApplyResult>('/admin/config/section/integrations', { method: 'PUT', body: JSON.stringify(next) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

/** Disconnect an integration: clears its secrets (+ resets GitHub App metadata). Restart-class. */
export function useDisconnectConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiSoft<{ ok: boolean; detail: string }>(`/admin/connections/${id}/disconnect`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
    },
  })
}

// ---- setup readiness (FCW-07/08) ----

export interface ReadinessItem {
  /** The env-secret key (e.g. "GITHUB_TOKEN") or "config" for a structural gap. */
  key: string
  message: string
}

export interface Readiness {
  ready: boolean
  blockers: ReadinessItem[]
  warnings: ReadinessItem[]
}

export const useReadiness = () =>
  useQuery({ queryKey: ['readiness'], queryFn: () => api<Readiness>('/admin/readiness'), refetchInterval: 15_000 })

export interface LlmTestResult {
  ok: boolean
  provider: string
  detail: string
  usage?: { inputTokens: number; outputTokens: number }
}

/** Make a real completion call through the model router and report green/red (FCW-09). */
export function useTestLlm() {
  return useMutation({ mutationFn: () => apiSoft<LlmTestResult>('/admin/test/llm', { method: 'POST' }) })
}

export interface IdentityTestResult {
  ok: boolean
  mode: string
  detail: string
}

/** Run a real identity-verifier check for the configured mode and report green/red (FCW-11). */
export function useTestIdentity() {
  return useMutation({ mutationFn: () => apiSoft<IdentityTestResult>('/admin/test/identity', { method: 'POST' }) })
}

export interface ChatwootValidation {
  ok: boolean
  detail: string
  accountId?: number
  inboxId?: number
  accounts?: Array<{ id: number; name: string }>
  inboxes?: Array<{ id: number; name: string }>
}

/** Validate a Chatwoot URL + token against the REST API and prefill account/inbox (FCW-12). */
export function useValidateChatwoot() {
  return useMutation({
    mutationFn: (input: { baseUrl: string; token: string }) =>
      apiSoft<ChatwootValidation>('/admin/test/chatwoot', { method: 'POST', body: JSON.stringify(input) }),
  })
}

export interface GitHubTestResult {
  ok: boolean
  detail: string
  repo?: string
}

/** Verify the configured repo is reachable via the current GitHub auth (FCW-14). */
export function useTestGitHub() {
  return useMutation({ mutationFn: () => apiSoft<GitHubTestResult>('/admin/test/github', { method: 'POST' }) })
}

export interface ChatwootSetupResult {
  ok: boolean
  detail: string
  agentBotId?: number
  webhookId?: number
  created: { agentBot: boolean; webhook: boolean }
}

/** Auto-create the Chatwoot Agent Bot + webhook (idempotent), FCW-13. */
export function useSetupChatwoot() {
  return useMutation({
    mutationFn: (input: { baseUrl: string; token: string; accountId: number }) =>
      apiSoft<ChatwootSetupResult>('/admin/setup/chatwoot', { method: 'POST', body: JSON.stringify(input) }),
  })
}

export interface QueryRouteScaffoldResult {
  functionName: string
  functionTs: string
  configYaml: string
}

/** Generate the Supabase Edge Function + queryRoutes config for L2 account data (FCW-19). */
export function useQueryRouteScaffold() {
  return useMutation({
    mutationFn: (input: { table: string; userColumn: string; allowedColumns: string[]; supabaseUrl?: string }) =>
      apiSoft<QueryRouteScaffoldResult>('/admin/scaffold/supabase-query-route', { method: 'POST', body: JSON.stringify(input) }),
  })
}

/** Set the verified customer token on a Chatwoot conversation (L2 hand-off, FCW-20). */
export function useSetChatwootToken() {
  return useMutation({
    mutationFn: (input: { conversationId: number; authToken: string }) =>
      apiSoft<{ ok: boolean; detail: string }>('/admin/chatwoot/set-token', { method: 'POST', body: JSON.stringify(input) }),
  })
}

// ---- feature manifest review/edit (FCW-18) ----

export interface ManifestFeature {
  key: string
  name: string
  routes: string[]
  components: string[]
  endpoints: string[]
  docsLinks: string[]
  keywords?: string[]
  sandboxRole?: string
}

export interface FeatureManifest {
  ref: string
  features: ManifestFeature[]
}

export interface ManifestSaveResult {
  ok: boolean
  manifest?: FeatureManifest
  errors: string[]
}

export const useManifest = () =>
  useQuery({ queryKey: ['manifest'], queryFn: () => api<FeatureManifest | null>('/admin/manifest') })

export function useSaveManifest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: unknown) => apiSoft<ManifestSaveResult>('/admin/manifest', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['manifest'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
    },
  })
}

// ---- operations: alerts history, job actions, live feed (Phase 3) ----

export interface AlertRecord {
  id: number
  kind: string
  severity: string
  message: string
  at: number
}

export interface ActivityEvent {
  type: string
  at: number
  data?: { outcome?: string; conversationId?: number }
}

export const useAlertHistory = () =>
  useQuery({
    queryKey: ['alerts-history'],
    queryFn: () => api<{ items: AlertRecord[] }>('/admin/alerts/history').then((r) => r.items),
    refetchInterval: 30_000,
  })

export function useRetryJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ retried: boolean }>(`/admin/jobs/${id}/retry`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function usePurgeJobs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: 'done' | 'failed') =>
      api<{ purged: number }>(`/admin/jobs/purge${qs({ status })}`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

/**
 * Subscribe to the server's SSE activity stream. The callback ref is kept current
 * so the EventSource isn't torn down on every render. The browser auto-reconnects
 * on transient errors; the session cookie authorizes the connection.
 */
/**
 * Start the GitHub App "connect" flow: fetch the manifest + state, then submit a
 * full-page form POST to GitHub (the manifest flow requires a form post, not a
 * redirect). GitHub creates the app and redirects back to the server callback.
 */
export function useGithubConnect() {
  return useMutation({
    mutationFn: async () => {
      const { url, manifest, state } = await api<{ url: string; manifest: unknown; state: string }>(
        '/admin/connect/github/manifest',
      )
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = `${url}?state=${encodeURIComponent(state)}`
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'manifest'
      input.value = JSON.stringify(manifest)
      form.appendChild(input)
      document.body.appendChild(form)
      form.submit()
    },
  })
}

/**
 * Reuse the App this deployment already created: navigate to ITS install/configure
 * page (no new App). Falls back to creating one (manifest flow) if none exists yet.
 */
export function useGithubInstall() {
  const connect = useGithubConnect()
  return useMutation({
    mutationFn: async () => {
      const { url } = await api<{ url: string | null }>('/admin/connect/github/install')
      if (url === null) {
        await connect.mutateAsync()
        return
      }
      window.location.assign(url)
    },
  })
}

export interface GithubRepoChoice {
  owner: string
  repo: string
  fullName: string
}

/** The repositories the connected GitHub App installation can access (the repo picker). */
export const useGithubRepos = (enabled: boolean) =>
  useQuery({
    queryKey: ['github', 'repos'],
    queryFn: () => api<{ items: GithubRepoChoice[] }>('/admin/connect/github/repos').then((r) => r.items),
    enabled,
  })

/** Record the operator's explicit repo pick (restart-applied). */
export function useSelectGithubRepo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { owner: string; repo: string }) =>
      apiSoft<{ status: string }>('/admin/connect/github/select-repo', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
    },
  })
}

/** Link an externally-created GitHub App by its credentials (App id + private key + installation id). */
export function useConnectGithubApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { appId: string; privateKey: string; installationId: number; slug?: string }) =>
      apiSoft<{ status: string; message?: string }>('/admin/connect/github/app', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
      void qc.invalidateQueries({ queryKey: ['github', 'repos'] })
    },
  })
}

// ---- Supabase connect (L2 account data) ----

export interface SupabaseProject {
  ref: string
  name: string
  organizationId: string
  region?: string
}

/** Start the Supabase OAuth flow — redirect to the authorize URL (state embedded). */
export function useSupabaseConnect() {
  return useMutation({
    mutationFn: async () => {
      // Redirect back to wherever the operator opened the console (e.g. localhost) —
      // a stable URL to register once, rather than the ephemeral tunnel host.
      const redirectUri = `${window.location.origin}/admin/connect/supabase/callback`
      const { url } = await api<{ url: string; state: string }>(
        `/admin/connect/supabase/manifest?redirectUri=${encodeURIComponent(redirectUri)}`,
      )
      window.location.assign(url)
    },
  })
}

export const useSupabaseProjects = (enabled: boolean) =>
  useQuery({
    queryKey: ['supabase', 'projects'],
    queryFn: () => api<SupabaseProject[]>('/admin/connect/supabase/projects'),
    enabled,
  })

export const useSupabaseTables = (ref: string, enabled: boolean) =>
  useQuery({
    queryKey: ['supabase', 'tables', ref],
    queryFn: () => api<string[]>(`/admin/connect/supabase/tables${qs({ ref })}`),
    enabled: enabled && ref !== '',
  })

export const useSupabaseColumns = (ref: string, table: string, enabled: boolean) =>
  useQuery({
    queryKey: ['supabase', 'columns', ref, table],
    queryFn: () => api<string[]>(`/admin/connect/supabase/columns${qs({ ref, table })}`),
    enabled: enabled && ref !== '' && table !== '',
  })

export function useSelectSupabaseProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ref: string; table: string; userColumn: string; columns: string[] }) =>
      apiSoft<{ ok: boolean; detail: string }>('/admin/connect/supabase/select', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['config'] })
      void qc.invalidateQueries({ queryKey: ['restart-status'] })
    },
  })
}

// ---- grounding docs (operator-managed L1 knowledge, FCW-04) ----

/** All persisted grounding docs, newest first. */
export const useDocs = () =>
  useQuery({ queryKey: keys.docs, queryFn: () => api<{ items: DocRecord[] }>('/admin/docs').then((r) => r.items) })

/**
 * Ingest a doc via the admin endpoint. A stable `externalId` (e.g. the filename)
 * makes a re-import refresh the doc in place rather than duplicate it. Applies
 * live — no restart — so a fresh upload grounds answers immediately.
 */
export function useImportDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title?: string; text: string; source?: string; externalId?: string }) =>
      api<DocRecord>('/admin/docs', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.docs }),
  })
}

/** Delete a grounding doc. Removes it from the store and the live index at once (no restart). */
export function useDeleteDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ status: string }>(`/admin/docs/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.docs }),
  })
}

export function useActivityStream(onEvent: (event: ActivityEvent) => void): void {
  const ref = useRef(onEvent)
  ref.current = onEvent
  useEffect(() => {
    const es = new EventSource('/admin/stream', { withCredentials: true })
    es.onmessage = (m) => {
      try {
        ref.current(JSON.parse(m.data) as ActivityEvent)
      } catch {
        /* ignore malformed frame */
      }
    }
    return () => es.close()
  }, [])
}
