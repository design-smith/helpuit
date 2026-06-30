import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

/** Core investigation record (mirrors the `Investigation` contract). */
export const investigations = sqliteTable('helpuit_investigations', {
  id: text('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  customerId: text('customer_id'),
  status: text('status').notNull(),
  level: text('level').notNull(),
  classification: text('classification'),
  confidence: real('confidence'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Confirmed feature manifest (single current row, keyed 'current'). */
export const manifests = sqliteTable('helpuit_manifests', {
  id: text('id').primaryKey(),
  json: text('json').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Operator-ingested grounding docs (pasted/uploaded/imported) that feed the L1 docs index. */
export const docs = sqliteTable('helpuit_docs', {
  id: text('id').primaryKey(),
  title: text('title'),
  text: text('text').notNull(),
  /** Where the doc came from: 'upload' | 'gdrive' | 'dropbox' | 'sharepoint' | 'repo' (null on legacy rows). */
  source: text('source'),
  /** Stable per-source id (provider file id / filename) — the upsert key for re-import. */
  externalId: text('external_id'),
  createdAt: integer('created_at').notNull(),
})

/** Chatwoot tickets, linked to an investigation and (many→one) to a GitHub issue. */
export const tickets = sqliteTable('helpuit_tickets', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  conversationId: integer('conversation_id').notNull(),
  issueNumber: integer('issue_number'),
})

/** Explicit investigation ↔ GitHub issue links (many investigations → one issue). */
export const githubLinks = sqliteTable('helpuit_github_links', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  issueNumber: integer('issue_number').notNull(),
  issueUrl: text('issue_url').notNull(),
  status: text('status'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at').notNull(),
})

/** Per-investigation audit entries (messages + actions). */
export const auditEntries = sqliteTable('helpuit_audit_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  investigationId: text('investigation_id').notNull(),
  type: text('type').notNull(),
  data: text('data'),
  at: integer('at').notNull(),
})

/** Token/cost spend ledger. */
export const spendEntries = sqliteTable('helpuit_spend_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  investigationId: text('investigation_id').notNull(),
  amount: integer('amount').notNull(),
  at: integer('at').notNull(),
})

/** Evidence artifacts (encrypted blob ref + redaction status). */
export const evidenceArtifacts = sqliteTable('helpuit_evidence_artifacts', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  type: text('type').notNull(),
  redactionStatus: text('redaction_status').notNull(),
  content: text('content'),
  createdAt: integer('created_at').notNull(),
})

/** Safe account-state snapshots gathered during L2. */
export const userContextSnapshots = sqliteTable('helpuit_user_context_snapshots', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  summary: text('summary').notNull(),
  createdAt: integer('created_at').notNull(),
})

/** Reproduction attempts (L3b). */
export const reproductionAttempts = sqliteTable('helpuit_reproduction_attempts', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  sandboxRole: text('sandbox_role'),
  reproduced: integer('reproduced'),
  evidence: text('evidence'),
  createdAt: integer('created_at').notNull(),
})

/** Idempotency guard for inbound webhooks. */
export const processedWebhookEvents = sqliteTable('helpuit_processed_webhook_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  processedAt: integer('processed_at').notNull(),
})

/** Founder takeover: conversations the human has paused from autonomous handling. */
export const conversationControls = sqliteTable('helpuit_conversation_controls', {
  conversationId: integer('conversation_id').primaryKey(),
  paused: integer('paused').notNull(),
  note: text('note'),
  updatedAt: integer('updated_at').notNull(),
})

/**
 * Escalation issue drafts awaiting founder approval (policy.autopublish = 'draft').
 * A drafted issue is held here until the operator publishes or rejects it.
 */
export const issueDrafts = sqliteTable('helpuit_issue_drafts', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  conversationId: integer('conversation_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  /** JSON-encoded string[] of GitHub labels. */
  labels: text('labels').notNull(),
  severity: text('severity').notNull(),
  /** Bug signature (for dedup) embedded in the eventual issue body. */
  signature: text('signature'),
  /** When dedup found an open match, the issue to comment on instead of filing new. */
  openMatchIssue: integer('open_match_issue'),
  /** 'pending' | 'published' | 'rejected'. */
  status: text('status').notNull(),
  issueNumber: integer('issue_number'),
  issueUrl: text('issue_url'),
  rejectionReason: text('rejection_reason'),
  createdAt: integer('created_at').notNull(),
  decidedAt: integer('decided_at'),
})

/** Durable async job queue (webhook intake → worker-processed investigations). */
export const jobs = sqliteTable('helpuit_jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
  runAfter: integer('run_after').notNull(),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Runtime structural-config overrides (one row per editable section), layered over file/env. */
export const configStore = sqliteTable('helpuit_config_store', {
  section: text('section').primaryKey(),
  json: text('json').notNull(),
  version: integer('version').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Encrypted secret vault (key → SecretBox-sealed value). Plaintext never stored. */
export const secretVault = sqliteTable('helpuit_secret_vault', {
  key: text('key').primaryKey(),
  sealed: text('sealed').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Append-only audit of config/secret changes — records WHAT changed, never the value. */
export const configAudit = sqliteTable('helpuit_config_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  target: text('target').notNull(),
  at: integer('at').notNull(),
})

/** History of fired operational alerts (budget/repro-failure/escalation-spike). */
export const alerts = sqliteTable('helpuit_alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  at: integer('at').notNull(),
})

/** Single-row marker: are there secret/restart-class changes pending a restart? */
export const restartFlag = sqliteTable('helpuit_restart_flag', {
  id: text('id').primaryKey(),
  pending: integer('pending').notNull(),
  reasons: text('reasons'),
  setAt: integer('set_at').notNull(),
})

export const schema = {
  investigations,
  manifests,
  docs,
  tickets,
  githubLinks,
  auditEntries,
  spendEntries,
  evidenceArtifacts,
  userContextSnapshots,
  reproductionAttempts,
  processedWebhookEvents,
  conversationControls,
  issueDrafts,
  jobs,
  configStore,
  secretVault,
  configAudit,
  restartFlag,
  alerts,
}
