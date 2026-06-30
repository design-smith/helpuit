import { pgTable, text, bigint, integer, real, bigserial } from 'drizzle-orm/pg-core'

// Postgres mirror of `schema.ts` (same table/column names) for the Postgres track
// (PB23). Dialect mapping: ms-epoch timestamps + large counters → `bigint` (read as
// number); `INTEGER PRIMARY KEY AUTOINCREMENT` → `bigserial`; boolean flags stay
// `integer` (0/1); `confidence` stays `real`. Kept consistent with
// `POSTGRES_MIGRATION_SQL` (the same schema.ts ↔ migrations.ts pairing as SQLite).

const ts = (name: string) => bigint(name, { mode: 'number' })

export const investigations = pgTable('helpuit_investigations', {
  id: text('id').primaryKey(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull(),
  customerId: text('customer_id'),
  status: text('status').notNull(),
  level: text('level').notNull(),
  classification: text('classification'),
  confidence: real('confidence'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const manifests = pgTable('helpuit_manifests', {
  id: text('id').primaryKey(),
  json: text('json').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const docs = pgTable('helpuit_docs', {
  id: text('id').primaryKey(),
  title: text('title'),
  text: text('text').notNull(),
  source: text('source'),
  externalId: text('external_id'),
  createdAt: ts('created_at').notNull(),
})

export const tickets = pgTable('helpuit_tickets', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull(),
  issueNumber: integer('issue_number'),
})

export const githubLinks = pgTable('helpuit_github_links', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  issueNumber: integer('issue_number').notNull(),
  issueUrl: text('issue_url').notNull(),
  status: text('status'),
  lastSyncedAt: ts('last_synced_at'),
  createdAt: ts('created_at').notNull(),
})

export const auditEntries = pgTable('helpuit_audit_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  investigationId: text('investigation_id').notNull(),
  type: text('type').notNull(),
  data: text('data'),
  at: ts('at').notNull(),
})

export const spendEntries = pgTable('helpuit_spend_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  investigationId: text('investigation_id').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  at: ts('at').notNull(),
})

export const evidenceArtifacts = pgTable('helpuit_evidence_artifacts', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  type: text('type').notNull(),
  redactionStatus: text('redaction_status').notNull(),
  content: text('content'),
  createdAt: ts('created_at').notNull(),
})

export const userContextSnapshots = pgTable('helpuit_user_context_snapshots', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  summary: text('summary').notNull(),
  createdAt: ts('created_at').notNull(),
})

export const reproductionAttempts = pgTable('helpuit_reproduction_attempts', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  sandboxRole: text('sandbox_role'),
  reproduced: integer('reproduced'),
  evidence: text('evidence'),
  createdAt: ts('created_at').notNull(),
})

export const processedWebhookEvents = pgTable('helpuit_processed_webhook_events', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  processedAt: ts('processed_at').notNull(),
})

export const conversationControls = pgTable('helpuit_conversation_controls', {
  conversationId: bigint('conversation_id', { mode: 'number' }).primaryKey(),
  paused: integer('paused').notNull(),
  note: text('note'),
  updatedAt: ts('updated_at').notNull(),
})

export const issueDrafts = pgTable('helpuit_issue_drafts', {
  id: text('id').primaryKey(),
  investigationId: text('investigation_id').notNull(),
  conversationId: bigint('conversation_id', { mode: 'number' }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  labels: text('labels').notNull(),
  severity: text('severity').notNull(),
  signature: text('signature'),
  openMatchIssue: integer('open_match_issue'),
  status: text('status').notNull(),
  issueNumber: integer('issue_number'),
  issueUrl: text('issue_url'),
  rejectionReason: text('rejection_reason'),
  createdAt: ts('created_at').notNull(),
  decidedAt: ts('decided_at'),
})

export const jobs = pgTable('helpuit_jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
  runAfter: ts('run_after').notNull(),
  lastError: text('last_error'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const configStore = pgTable('helpuit_config_store', {
  section: text('section').primaryKey(),
  json: text('json').notNull(),
  version: bigint('version', { mode: 'number' }).notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const secretVault = pgTable('helpuit_secret_vault', {
  key: text('key').primaryKey(),
  sealed: text('sealed').notNull(),
  updatedAt: ts('updated_at').notNull(),
})

export const configAudit = pgTable('helpuit_config_audit', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  at: ts('at').notNull(),
})

export const restartFlag = pgTable('helpuit_restart_flag', {
  id: text('id').primaryKey(),
  pending: integer('pending').notNull(),
  reasons: text('reasons'),
  setAt: ts('set_at').notNull(),
})

export const alerts = pgTable('helpuit_alerts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  at: ts('at').notNull(),
})

/** The Postgres schema map (mirrors `schema.ts`'s `schema`). */
export const pgSchema = {
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
