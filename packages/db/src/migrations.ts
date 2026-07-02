/**
 * Schema DDL applied at startup. Idempotent (CREATE TABLE IF NOT EXISTS) so it
 * doubles as a migration for a fresh DB and a no-op for an existing one. Mirrors
 * `schema.ts`. Columns ADDED to a table after its first release also need an entry
 * in {@link COLUMN_BACKFILL} so EXISTING databases pick them up (CREATE IF NOT
 * EXISTS can't alter a table that already exists).
 * (When Postgres lands, a dialect-specific variant is generated.)
 */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS helpuit_investigations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  customer_id TEXT,
  status TEXT NOT NULL,
  level TEXT NOT NULL,
  classification TEXT,
  confidence REAL,
  case_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_embeddings (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  vec BLOB NOT NULL,
  model TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embeddings_owner ON helpuit_embeddings (owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS helpuit_manifests (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_docs (
  id TEXT PRIMARY KEY,
  title TEXT,
  text TEXT NOT NULL,
  source TEXT,
  external_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_created ON helpuit_docs (created_at);

CREATE TABLE IF NOT EXISTS helpuit_tickets (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  issue_number INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_issue ON helpuit_tickets (issue_number);

CREATE TABLE IF NOT EXISTS helpuit_github_links (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  issue_url TEXT NOT NULL,
  status TEXT,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_issue ON helpuit_github_links (issue_number);

CREATE TABLE IF NOT EXISTS helpuit_audit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_investigation ON helpuit_audit_entries (investigation_id);

CREATE TABLE IF NOT EXISTS helpuit_spend_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spend_investigation ON helpuit_spend_entries (investigation_id);

CREATE TABLE IF NOT EXISTS helpuit_evidence_artifacts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  redaction_status TEXT NOT NULL,
  content TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_user_context_snapshots (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_reproduction_attempts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  sandbox_role TEXT,
  reproduced INTEGER,
  evidence TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_processed_webhook_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_conversation_controls (
  conversation_id TEXT PRIMARY KEY,
  paused INTEGER NOT NULL,
  note TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_issue_drafts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  labels TEXT NOT NULL,
  severity TEXT NOT NULL,
  signature TEXT,
  open_match_issue INTEGER,
  status TEXT NOT NULL,
  issue_number INTEGER,
  issue_url TEXT,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON helpuit_issue_drafts (status);
CREATE INDEX IF NOT EXISTS idx_drafts_investigation ON helpuit_issue_drafts (investigation_id);

CREATE TABLE IF NOT EXISTS helpuit_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  run_after INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON helpuit_jobs (status, run_after, created_at);

CREATE TABLE IF NOT EXISTS helpuit_config_store (
  section TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_secret_vault (
  key TEXT PRIMARY KEY,
  sealed TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_config_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_restart_flag (
  id TEXT PRIMARY KEY,
  pending INTEGER NOT NULL,
  reasons TEXT,
  set_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_at ON helpuit_alerts (at);
`

/**
 * Additive column migrations for EXISTING databases. The CREATE statements above
 * already include these columns for fresh DBs; this list lets the startup runner
 * add them to a pre-existing table (SQLite has no `ADD COLUMN IF NOT EXISTS`, so
 * the runner checks `PRAGMA table_info` first and only alters when missing).
 * Keep in sync with the table definitions above.
 */
export const COLUMN_BACKFILL: ReadonlyArray<{ table: string; column: string; type: string }> = [
  { table: 'helpuit_docs', column: 'source', type: 'TEXT' },
  { table: 'helpuit_docs', column: 'external_id', type: 'TEXT' },
  { table: 'helpuit_investigations', column: 'case_json', type: 'TEXT' },
]

/**
 * Indexes over {@link COLUMN_BACKFILL} columns. These CANNOT live in the CREATE
 * block above: on a database that predates the columns, `CREATE TABLE IF NOT
 * EXISTS` is a no-op (the columns aren't added there), so an index referencing
 * them would fail with "no such column". The startup runner applies these only
 * AFTER the columns are backfilled. All `IF NOT EXISTS`, so safe every boot.
 */
export const BACKFILL_INDEXES: ReadonlyArray<{ table: string; sql: string }> = [
  { table: 'helpuit_docs', sql: 'CREATE INDEX IF NOT EXISTS idx_docs_source ON helpuit_docs (source, external_id)' },
]
