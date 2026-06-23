# ADR 0001 — Database engine: SQLite/libsql (Postgres deferred)

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** maintainers

## Context

Helpuit is **single-tenant** (one company per deployment). It needs a durable store
for the `helpuit_*` model with zero-config local boot and a managed/HA option for
real deployments. The whole data layer is built on **Drizzle + libsql/SQLite**: the
schema (`schema.ts`), migrations (`migrations.ts`), and ~19 repositories are typed to
`LibSQLDatabase`, and the readiness probe uses the libsql client API.

A Postgres dialect was scoped (PB2/PB23). The genuinely-uncertain parts were built
and **verified against a real `postgres:16` via testcontainers** (`pnpm test:pg`):

- `POSTGRES_MIGRATION_SQL` — the full schema in Postgres dialect (`BIGSERIAL`,
  `BIGINT` for ms-epoch timestamps), idempotent; all 19 tables apply.
- `schema.pg.ts` — a full `pgTable` mirror + a real Drizzle `NodePgDatabase` handle.
- The repositories' actual query patterns proven portable on Postgres
  (insert/select, `onConflictDoUpdate` upsert, `bigserial` `.returning()`).

What remains for the app to *run* on Postgres is **not** uncertain, just large: the
repositories import concrete `sqliteTable` objects, and Drizzle has no cross-dialect
table or union `Db` type — so all ~19 repos (+ their call sites) must be parameterized
over the schema to use the `pgTable` objects with a pg handle. That's a ~30-file,
type-heavy refactor.

## Decision

**Standardize on SQLite/libsql. Do not wire Postgres now.**

- **Local / single-tenant durable:** a `file:` SQLite DB (the default when
  `DATABASE_URL` is unset — `file:./helpuit.sqlite`). Data persists across restarts
  with zero DB setup.
- **Managed / HA:** a remote **libsql server (e.g. Turso)** via a `libsql://` (or
  `https://`) `DATABASE_URL` + `DATABASE_AUTH_TOKEN`. `createDb` attaches the auth
  token for remote urls (`libsqlClientConfig`); local dbs ignore it.
- **Postgres:** `createDb` rejects `postgres://` with a message pointing here. The
  dialect foundation (migration + `pgTable` + verified Drizzle portability) is
  **banked** behind `pnpm test:pg` so the track can resume later cheaply.

## Rationale

- libsql already covers both needs: zero-config local durability **and** a managed,
  replicated/HA option (Turso) — so Postgres is largely a "fits-existing-infra"
  convenience, not a capability gap.
- The remaining Postgres work is a large, type-sensitive refactor of the repository
  layer for marginal benefit today; the risky/unknown parts are already proven, so
  resuming is low-risk if a real need (e.g. an org standardized on Postgres) appears.

## Consequences

- Deployments use a SQLite file (with backups of the volume) or Turso for HA.
- If Postgres is later required, resume from the banked foundation: choose
  generic/parameterized repos (preferred) vs. a parallel pg repo set, generalize the
  `Db` type + `DbHandle.client` usage, and convert repos one at a time — verifying
  each against **both** real databases.

## Revisit if

A deployment target mandates Postgres (compliance/infra standardization), or libsql/
Turso can't meet an HA/operational requirement.
