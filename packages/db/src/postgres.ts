import pgPkg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { pgSchema } from './schema.pg.js'

const { Pool, types } = pgPkg

export type PgDb = NodePgDatabase<typeof pgSchema>

// node-postgres returns BIGINT (int8, OID 20) as a string to avoid precision loss.
// Our timestamps/ids are ms-epoch / counters that fit JS safe integers, and the
// app's model is numeric — so parse int8 to number to match the SQLite path.
types.setTypeParser(20, (value: string) => Number.parseInt(value, 10))

/**
 * Postgres-dialect schema DDL — mirrors `migrations.ts` (SQLite) for Postgres:
 * `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL`, and every timestamp/counter
 * `INTEGER` → `BIGINT` (SQLite INTEGER is 64-bit; Postgres INTEGER is 32-bit and
 * ms-epoch overflows it). Boolean flags stay integer 0/1. Idempotent
 * (`IF NOT EXISTS`) so it doubles as a migration + a no-op on an existing DB.
 */
export const POSTGRES_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS helpuit_investigations (
  id TEXT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  customer_id TEXT,
  status TEXT NOT NULL,
  level TEXT NOT NULL,
  classification TEXT,
  confidence REAL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_manifests (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_docs (
  id TEXT PRIMARY KEY,
  title TEXT,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_created ON helpuit_docs (created_at);

CREATE TABLE IF NOT EXISTS helpuit_tickets (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  conversation_id BIGINT NOT NULL,
  issue_number INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_issue ON helpuit_tickets (issue_number);

CREATE TABLE IF NOT EXISTS helpuit_github_links (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  issue_url TEXT NOT NULL,
  status TEXT,
  last_synced_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_issue ON helpuit_github_links (issue_number);

CREATE TABLE IF NOT EXISTS helpuit_audit_entries (
  id BIGSERIAL PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_investigation ON helpuit_audit_entries (investigation_id);

CREATE TABLE IF NOT EXISTS helpuit_spend_entries (
  id BIGSERIAL PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  amount BIGINT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spend_investigation ON helpuit_spend_entries (investigation_id);

CREATE TABLE IF NOT EXISTS helpuit_evidence_artifacts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  redaction_status TEXT NOT NULL,
  content TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_user_context_snapshots (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_reproduction_attempts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  sandbox_role TEXT,
  reproduced INTEGER,
  evidence TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_processed_webhook_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  processed_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_conversation_controls (
  conversation_id BIGINT PRIMARY KEY,
  paused INTEGER NOT NULL,
  note TEXT,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_issue_drafts (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  conversation_id BIGINT NOT NULL,
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
  created_at BIGINT NOT NULL,
  decided_at BIGINT
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
  run_after BIGINT NOT NULL,
  last_error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON helpuit_jobs (status, run_after, created_at);

CREATE TABLE IF NOT EXISTS helpuit_config_store (
  section TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  version BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_secret_vault (
  key TEXT PRIMARY KEY,
  sealed TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_config_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_restart_flag (
  id TEXT PRIMARY KEY,
  pending INTEGER NOT NULL,
  reasons TEXT,
  set_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpuit_alerts (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_at ON helpuit_alerts (at);
`

export interface PostgresHandle {
  /** Drizzle ORM handle over the Postgres schema — the same query surface the repos use. */
  db: PgDb
  /** Raw node-postgres pool (for migrations / raw queries). */
  client: InstanceType<typeof Pool>
  close: () => Promise<void>
}

/**
 * Open a real Postgres connection (node-postgres + Drizzle) and apply the schema
 * migration. This is the verified foundation of the Postgres track (PB23): the
 * libsql path in `client.ts` is unchanged. Making `createDb` + the repositories
 * (currently libsql-typed) dialect-aware so `main.ts` can use a `postgres://` url
 * is the remaining slice.
 */
export async function createPostgresDb(url: string): Promise<PostgresHandle> {
  const pool = new Pool({ connectionString: url })
  await pool.query(POSTGRES_MIGRATION_SQL)
  const db = drizzle(pool, { schema: pgSchema })
  return { db, client: pool, close: () => pool.end() }
}
