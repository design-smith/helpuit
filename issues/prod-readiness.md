# Helpuit — Production Readiness: Batches & Build Plan

> Local tracking (not published). Source: `docs/prd/production-readiness.md`.
> 43 issues grouped into 25 cohesive batches across 5 dependency waves.
> Everything inside a wave is mutually independent → build in parallel.
> Legend: **AFK** = no human needed · **HITL** = needs a human decision · `⟵` = blocked by.

## Wave map (parallel batches per wave)

- **W1:** PB1 Config ✅ · PB2 Persistence ✅ · PB3 CI/CD ✅ · PB4 License decision ✅
- **W2:** PB5 LLM gateway ✅ · PB6 Server+health ✅ · PB7 Identity ✅ · PB8 Reproduction driver ✅ · PB9 Crypto ✅ · PB10 Composition root ✅
- **W3:** PB11 ★Chatwoot+L1 e2e ✅ · PB12 Query routes/L2 ✅ · PB13 GitHub+manifest+static ✅ · PB14 Queue+worker+async ✅ · PB15 Observability ✅
- **W4:** PB16 Code-grounded guidance ✅ · PB17 Escalation/L4 ✅ · PB18 Lifecycle loop ✅ · PB19 Budget+dashboard+alerts+takeover ✅ · PB20 Rate-limit/validation ✅ · PB21 Retention ✅
- **W5:** PB22 Reliability hardening ✅ · PB23 Deploy ✅ · PB24 Test depth ✅ · PB25 Docs+License ✅

**Milestones:** end of W3 PB11 = first real L1 round-trip; end of W4 = full customer→repro→issue→fix loop; end of W5 = deployable + hardened.

---

# Wave 1 — Foundations

## PB1 — Config — AFK ⟵ none — ✅ DONE (`@helpuit/config`, 10 tests)
### 2. `@helpuit/config`
**What:** Zod schema + loader for `helpuit.config.yaml` + env binding/validation; ship `helpuit.config.example.yaml`.
**AC:** [x] invalid config fails fast with a clear error (aggregates ALL problems) · [x] env overrides file (policy toggles) · [x] exposes typed config (routes catalog, sandbox roles, toggles, caps, model tiering, identity mode) · [x] shipped `helpuit.config.example.yaml` validates through the real loader.

## PB2 — Persistence — AFK ⟵ none — ✅ DONE (`@helpuit/db`, 8 tests vs real SQLite)
### 3. `@helpuit/db` schema + migrations
**What:** Drizzle (libsql/SQLite) schema for the full `helpuit_*` model + `processed_webhook_events`; idempotent migration runner; `createDb(url)`.
**AC:** [x] all `helpuit_*` tables + idempotent migrations applied to a real SQLite/libsql DB · [x] many-investigations→one-issue modeled (`tickets.issue_number` + `helpuit_github_links`) · [x] artifacts table carries `redaction_status` + content ref · [~] **Postgres dialect** — **slices 1–2 landed** (verified against a **real `postgres:16` via testcontainers** — `pnpm test:pg`, `*.pg.test.ts`, isolated from the default suite like the browser tests): (1) `POSTGRES_MIGRATION_SQL` (pg dialect — `BIGSERIAL` for autoincrement, `BIGINT` for ms-epoch timestamps) + `createPostgresDb` (int8→number parser); all 19 tables apply, round-trips + idempotency proven. (2) `schema.pg.ts` (full `pgTable` mirror) + a real Drizzle `NodePgDatabase` handle, with the repos' actual query patterns proven portable (insert/select, `onConflictDoUpdate` upsert, `bigserial` returning). **Decision (ADR 0001):** standardize on **SQLite/libsql**, Postgres deferred — see `docs/adr/0001-database-engine.md`. Local `file:` for single-tenant durability (the unset-`DATABASE_URL` default); a remote **libsql/Turso** url + `DATABASE_AUTH_TOKEN` for managed/HA (`createDb` now attaches the token for remote urls via `libsqlClientConfig`). The pg foundation (migration + `pgTable` + verified Drizzle portability) stays **banked** behind `pnpm test:pg`; resuming = the ~30-file repo/`Db` generalization, low-risk since the unknowns are proven. `createDb` rejects `postgres://` with a message pointing at the ADR.
### 4. DB-backed repositories
**What:** Implement existing store interfaces on Drizzle, tested against a real `:memory:` DB.
**AC:** [x] `DrizzleInvestigationRepository` + `DrizzleManifestStore` + `DrizzleTicketing` + `DrizzleGithubLinks` implement the shared interfaces, real-SQLite tested · [x] orchestrator now depends on the `Ticketing` **interface** (DB impl is a drop-in swap) · [~] audit/spend/artifacts repos: **tables present**; their repos land with the async-consumer wiring (audit→PB10, spend→PB19) to avoid a sync→async refactor here.
**⟵ 3**

## PB3 — CI/CD — AFK ⟵ none — ✅ DONE
### 41. CI pipeline ✅
**What:** `.github/workflows/ci.yml` — `test` job (pnpm `--frozen-lockfile` install → `typecheck` → `test` → `test:smoke` → install Chromium → `test:browser`) + `docker` job (build the image via Buildx with GHA cache). Runs on push to `main` + all PRs; concurrency-cancels superseded runs.
**AC:** [x] every gate verified GREEN locally via the exact `pnpm -w run …` commands CI uses (frozen install in-sync, typecheck, 283 tests, 1 smoke, 2 browser) · [x] image builds (`docker build` confirmed earlier) · [x] workflow YAML validated · [~] pre-commit (Husky/lint-staged) + vuln scan not added — CI is the enforcement point; a lint step awaits adding a linter (none configured yet). Used `-w run` because root-level scripts in a pnpm workspace otherwise resolve ambiguously.

## PB4 — License & infra decision — HITL ⟵ none
### 1. Decide license + queue/infra defaults
**What:** Choose AGPL-3.0 vs Apache-2.0; confirm pg-boss (Postgres queue) vs Redis/BullMQ.
**AC:** [ ] license chosen · [ ] queue tech confirmed (default pg-boss).

---

# Wave 2 — ⟵ W1

## PB5 — LLM gateway + adapters — AFK ⟵ PB1 — ✅ DONE (`@helpuit/llm`, 10 tests)
### 7. `@helpuit/llm` gateway
**What:** `ChatModel` interface + per-tier `ModelRouter` (guidance/reasoning/vision from config) + token-usage reporting + `createGuidanceModel` bridge to `@helpuit/guidance`.
**AC:** [x] router picks provider+model per tier (incl. per-tier overrides), tested over real HTTP · [x] usage `{inputTokens,outputTokens}` returned for the budget governor · [x] guidance bridge parses structured JSON (message+confidence) with a plain-text fallback.
### 8. Anthropic adapter
**AC:** [x] real Messages API request + usage parsing, tested against a **real local HTTP server** · [x] non-2xx → `LlmError`. **⟵ 7**
### 9. OpenAI · DeepSeek · OpenAI-compatible(local) · Bedrock adapters
**AC:** [x] one `OpenAICompatibleModel` serves OpenAI/DeepSeek/local (base-URL + key by config), tested over real HTTP (incl. no-auth local) · [x] `BedrockModel` uses the real AWS SDK; request-build + response-parse unit-tested (SDK transport validated vs real AWS in PB24) · [x] all selectable by config. **⟵ 7**

## PB6 — Server + health — AFK ⟵ PB1, PB2 — ✅ DONE (`apps/server`, 4 tests over a real listener)
### 5. Fastify server skeleton + `/healthz` + `/readyz`
**What:** Fastify HTTP entry (`@helpuit/server`), pino logging, liveness + readiness; `main.ts` wires config → DB → server + graceful SIGTERM/SIGINT shutdown.
**AC:** [x] `/healthz` 200 always (real listener + fetch) · [x] `/readyz` runs injected checks — 200 on real DB ping, 503 when any dep fails or a check throws · [x] graceful start/stop in `main.ts` (config-driven port/logger; process-I/O, validated via e2e). `apps/*` now a workspace (vitest + tsc wired).

## PB7 — Identity — AFK ⟵ PB1 — ✅ DONE (`@helpuit/identity`, 18 tests)
### 14. HMAC `TokenVerifier` + gate
**AC:** [x] valid HMAC → identity (real `node:crypto`, constant-time compare) · [x] tampered/wrong-secret/malformed → null · [x] userId bound from verified token only. `TokenVerifier`/`IdentityResolver` migrated to async (orchestrator awaits; all consumers green).
### 15. JWT (JWKS) + endpoint verifiers
**AC:** [x] `jwt` verifier validates signatures against a **real JWKS** via `jose` (rejects wrong-key + expired) · [x] `endpoint` verifier POSTs to the app (real HTTP), parses identity, 401→null · [x] `createTokenVerifier` selects the verifier by config mode. **⟵ 14**

## PB8 — Reproduction driver — AFK ⟵ PB1 — ✅ DONE (`@helpuit/playwright`, real Chromium)
### 22. Real Playwright `BrowserDriver`
**AC:** [x] launches **real headless Chromium**, logs in as the sandbox account (secret refs from env), reaches the route · [x] runs through `DynamicReproducer` (lease + container lifecycle + always-cleanup) — real e2e.
### 23. Evidence capture + caps
**AC:** [x] screenshot + console errors + 5xx network errors captured · [x] `planWithinCaps`/repro caps (policy, tested) · [~] HAR + strict in-loop time/retry enforcement are later refinements. **⟵ 22**
### 24. `canReproduce` gating
**AC:** [x] irreversible-feature block + Playwright toggle honored (policy, tested) · [~] customer safe-state recreation + wiring repro into the escalation pipeline need per-feature **recipes** (later); the `ReproductionRunner` seam is ready. **⟵ 22**

## PB9 — Crypto — AFK ⟵ PB2 — ✅ DONE
### 34. Artifact encryption at rest + redaction-export enforcement ✅
**AC:** [x] new `@helpuit/crypto`: `SecretBox` (AES-256-GCM via `node:crypto` — random IV, auth-tag tamper detection, wrong-key rejection) + `deriveKey` (SHA-256 from a founder passphrase) + `Redactor` (regex scrub of emails/cards + provider secrets: OpenAI `sk-`, GitHub `ghp_`/`github_pat_`, AWS `AKIA`, Bearer/JWT, private-key blocks) — all TDD'd, real crypto · [x] artifacts encrypted at rest: new `DrizzleEvidenceArtifacts` repo seals `content` before insert / opens on read — **real DB test proves the raw column is ciphertext, not plaintext, and decrypts back** (fills the schema's reserved `helpuit_evidence_artifacts` table) · [x] redaction-gated export **wired live**: `RedactingIssueTracker` decorates the GitHub tracker in composition's escalation path — **real HTTP test** confirms PII/secrets are stripped from issue title+body+comments before they reach GitHub · [x] keys from env (`HELPUIT_ENCRYPTION_KEY`, documented in `.env.example`); SHA-256-derived so any length works · [~] the evidence repo's orchestrator write call-site lands with L3b reproduction-evidence wiring (the repo is the canonical encrypted store it will use); redaction is the always-on enforcement gate now.

## PB10 — Composition root — AFK ⟵ PB1, PB2 — ✅ DONE (`@helpuit/composition`, 2 tests)
### 6. Config-driven composition
**What:** `buildOrchestrator(config, { db, docs })` wires the orchestrator from validated config + a live DB — all REAL adapters: `HttpChatwootClient`, LLM-backed `GuidanceModel` (via `ModelRouter`), config-selected identity verifier, Drizzle repos.
**AC:** [x] one entrypoint wires everything · [x] **full real L1 round-trip proven** (customer msg → real LLM over HTTP → real reply posted to a real Chatwoot endpoint → investigation persisted in a real DB) + deny path · [x] deeper capabilities (account/static/escalation, GitHub dedup) degrade gracefully (no-op until their batches). Also: `HttpChatwootClient` (issue 11) now has real HTTP coverage.

---

# Wave 3 — ⟵ W2

## PB11 — ★ Chatwoot live + intake + L1 e2e — AFK ⟵ PB5, PB6, PB10 — ✅ DONE (live round-trip)
### 10. Real `GuidanceModel` + docs ingestion
**AC:** [x] guidance answers via the LLM gateway (`createGuidanceModel`) · [x] grounded in ingested docs (`InMemoryDocsIndex`, seeded via composition; bulk docs-source ingestion is a later enhancement). **⟵ 8**
### 11. `HttpChatwootClient`
**AC:** [x] posts replies + private notes to a real Chatwoot endpoint (real-HTTP tested) · [x] auth header + non-2xx error handled. **⟵ PB1**
### 12. Chatwoot webhook route → intake (idempotent)
**AC:** [x] `POST /webhooks/chatwoot` triggers `orchestrator.handleInbound` · [x] redelivered events deduped via real DB `DrizzleProcessedEvents`. **⟵ 5,6,11**
### 13. L1 guidance round-trip e2e
**AC:** [x] a real customer webhook → real LLM → real reply posted to a real Chatwoot endpoint, investigation persisted in a real DB · [x] output rail applied · [x] duplicate webhook does not act twice. `main.ts` wires it for prod. **⟵ 10,12**

## PB12 — Query routes + L2 — AFK ⟵ PB1, PB7, PB5 — ✅ DONE (live L2 escalation)
### 16. Query-route HTTP client
**AC:** [x] `HttpRouteExecutor` calls the founder's endpoints over real HTTP with bearer + the identity-bound param (path/query) · [x] catalog rejects out-of-allowlist columns + unknown routes. **⟵ 14**
### 17. Real `AccountModel` + L2 wired live
**AC:** [x] `createAccountModel` (LLM gateway) summarizes findings → safe summary + classification hint · [x] composition wires a real `AccountInvestigator`; **live e2e**: low-confidence guidance → real query-route HTTP → real account LLM → account-informed reply, level `account` + classification persisted. **⟵ 16,8**
### 18. Agent-guided query-route setup + sensitive-column guard
**AC:** [x] `findSensitiveColumns` guard (tested) · [~] agent-guided setup UI is a dashboard/settings concern (lands with PB38). **⟵ 16**

## PB13 — GitHub + manifest + static — AFK ⟵ PB1, PB5 — ✅ DONE (`@helpuit/github`, live L3a)
> Impl uses the **GitHub REST API** (configurable `apiBaseUrl` → GitHub Enterprise + tests); the design's "GitHub MCP" maps to these calls behind the same interfaces.
### 25. `@helpuit/github` IssueTracker/IssueSearch
**AC:** [x] `GitHubIssueTracker` create/comment + `GitHubIssueSearch` (real HTTP) · [x] signature-marker dedup (parses `helpuit-signature:` from issue bodies, maps open/closed). **⟵ wired into escalation in PB17**
### 26. RepoSource + code retriever + manifest
**AC:** [x] `GitHubRepoSource` lists files at the prod branch · [x] `GitHubCodeRetriever` fetches + base64-decodes contents (real HTTP) · [~] re-index-on-push is a later enhancement.
### 28. Real `StaticAnalysisModel` + L3a wired live
**AC:** [x] `createStaticAnalysisModel` → hypothesis + suspected files + confidence · [x] **live L3a e2e**: no-explanation account → real GitHub code fetch → real static LLM → classify `new_bug` → `static_investigated`, level `static_repro`. **⟵ 8,26**

## PB14 — Queue + worker + async — AFK ⟵ PB2, PB10 — ✅ DONE
### 19. `@helpuit/queue` ✅
**AC:** [x] new `@helpuit/queue`: `JobQueue` interface + real `InMemoryJobQueue` (dev/tests) + `Worker`; **persistent `DrizzleJobQueue`** in `@helpuit/db` on a new `helpuit_jobs` table (+migration/index) · [x] enqueue/claim/complete · [x] retry + exp-backoff (`runAfter`) · [x] dead-letter after `maxAttempts` (status `failed`, `lastError` kept) · [x] idempotency: the webhook's existing `processedWebhookEvents` claim dedupes BEFORE enqueue (proven async e2e) · [x] **atomic claim** — conditional `UPDATE … WHERE id=? AND status='pending'`; real-DB test proves two concurrent claimers never get the same job. Chose a DB-backed queue over pg-boss to stay single-tenant/zero-extra-infra and dialect-portable.
### 20. Worker ✅
**AC:** [x] `Worker` consumes the queue (registered handlers by job type), `drain()` (deterministic, for tests) + `start()/stop()` (background loops, configurable concurrency, graceful drain) · [x] wired in `main.ts` (concurrency 2; `stop()` drains in-flight on shutdown) · [~] horizontal scale: the atomic claim makes multiple worker processes safe against one DB; runs in-process by default for single-tenant simplicity (split into its own process when needed — no code change to the queue).
### 21. Async boundary ✅
**AC:** [x] investigations detach to the worker — the webhook **enqueues and returns 200 immediately**, the worker runs the real orchestrator off the request path; **full async e2e** proves: POST → nothing processed yet (0 replies, job pending) → `worker.drain()` → real LLM/Chatwoot round-trip + persisted investigation · [x] results post back to the same conversation (orchestrator replies via the Chatwoot client as before) · [~] the ">10 min, you can leave" customer notice is a small copy add on the enqueue path — deferred (the mechanism — async detach — is done).

## PB15 — Observability — AFK ⟵ PB6 — ✅ DONE
### 32. Logging + tracing + metrics ✅
**AC:** [x] pino JSON logs with request/trace ids (Fastify's built-in pino logger, on with per-request `reqId`; on in prod via `main.ts`) · [x] real Prometheus metrics via new `@helpuit/observability` (`prom-client` registry): `helpuit_outcomes_total{outcome}`, `helpuit_webhooks_total{source}`, `helpuit_llm_tokens_total{tier}` + `helpuit_llm_call_seconds` histogram; opt-in default process metrics · [x] `GET /metrics` endpoint (Prometheus exposition text + correct content-type), wired in `buildServer` + `main.ts`; webhook/outcome counters recorded in the chatwoot/github routes — **live e2e**: real webhook → `/metrics` shows `helpuit_webhooks_total{source="chatwoot"} 1` and `helpuit_outcomes_total{outcome="guided"} 1` · [~] full OTel traces deferred (pino structured logs + Prometheus metrics cover the operability need; distributed tracing is a later add).

---

# Wave 4 — ⟵ W3

## PB16 — Code-grounded guidance — AFK ⟵ PB13, PB11 — ✅ DONE
### 27. Guidance grounded in code ✅
**AC:** [x] manifest → code retrieval feeds the guidance model: new `ManifestCodeContextProvider` resolves the complaint to a feature (reusing `resolveFeature`), reads that feature's component files via a `CodeReader` (the real `GitHubCodeRetriever` in prod), and returns byte-capped snippets · [x] `GuidanceAgent` takes an optional `CodeContextProvider` and passes code into the model input + reports `codeSources`; the guidance bridge renders a "Relevant source code" block into the prompt and the system prompt tells the model to prefer code over docs · [x] **wired live in composition** — code grounding turns on whenever a confirmed manifest is present; **full e2e proven** (real manifest → real GitHub contents fetch → decoded source appears in the guidance prompt sent to the real LLM) · [x] falls back to docs-only when no manifest / no feature matches (existing L1 path unchanged, all prior tests green).

## PB17 — Escalation pipeline + L4 — AFK ⟵ PB13 — ✅ DONE (live, files real issues)
### 29. Escalation pipeline composition + orchestrator L3a→L4 live
**What:** `EscalationPipeline` (in `@helpuit/escalation`): signature dedup (GitHub `IssueSearch`) → optional reproduce → file or link (GitHub `IssueTracker`); orchestrator wires ticket + status + customer message.
**AC:** [x] **live e2e**: suspected bug → files a **real GitHub issue** (or links an open match by embedded `helpuit-signature`) · [x] ticket created + linked, investigation status `escalated`, customer told · [x] autopublish toggle honored (`auto` files / `draft` holds) · [x] issue body carries only the customer report + findings, no account PII · [~] the reproduce step is optional (real Playwright in PB8); currently files from static evidence (`reproduced:false`). **⟵ 13** (PB8 loosened — reproduction slots in later)

## PB18 — Lifecycle loop — AFK ⟵ PB6, PB13, PB11 — ✅ DONE (round-trip closed)
### 30. GitHub webhook route (HMAC, idempotent) → sync
**AC:** [x] `POST /webhooks/github` verifies the `x-hub-signature-256` HMAC (401 on bad), idempotent by `x-github-delivery` · [x] events drive ticket status + private notes via `LifecycleSync`. **⟵ 5,25**
### 31. Resolution-mode wiring + fan-out live
**AC:** [x] auto-notify only on a `completed` close (resolution mode from config) · [x] **live e2e**: one signed close fans the "try again" reply out to **all linked customers** (real Chatwoot HTTP), idempotent on redelivery. **⟵ 30,11**

## PB19 — Budget + dashboard + alerts — AFK ⟵ PB5, PB2, PB15
### 33. Budget governor wired to real token accounting ✅
**AC:** [x] `MeteredChatModel` records real token usage from every LLM call + enforces day/month caps (throws `BudgetExceededError`) · [x] composition meters all tier models; **live e2e**: exceeding the day cap mid-flow → orchestrator catches → customer gets a graceful message, investigation set `needs_founder`, no further LLM spend · [~] spend ledger is in-memory per-process now (the `helpuit_spend_entries` table exists; DB-backed ledger is a follow-up). **⟵ 7,4**
### 38. Founder dashboard (view-model + metrics API) + takeover ✅
**AC:** [x] `DrizzleDashboardService.overview()` aggregates the live DB into a view-model — investigation totals + breakdown by status/classification + recent list, reproduction success rate, total token spend, escalation (issues-linked) count, async-queue health, paused-conversation count — **real-DB test** · [x] served at **`GET /admin/overview`**, gated by a constant-time bearer check (`HELPUIT_ADMIN_TOKEN`); endpoint isn't registered at all when no token is set — **real HTTP test** (200 with token, 401 without, 404 when disabled); wired in `main.ts` · [x] **founder takeover**: new `DrizzleControlStore` (`helpuit_conversation_controls` table) pause/resume/isPaused; the orchestrator gates inbound on it — a paused conversation returns `outcome: 'paused'` **silently** (no reply, no investigation, no spend), proven via the real wired orchestrator; `POST /admin/conversations/:id/pause|resume` (bearer-gated, real HTTP test) wired in `main.ts`. Full React Dashboard App is a UI layer over this API.
### 39. Alerts ✅
**AC:** [x] new `AlertEngine` (`@helpuit/observability`): budget-near/over-cap (warn→critical), reproduction-failure-rate (with min sample), and escalation-spike thresholds → an `AlertSink` — TDD'd · [x] `WebhookAlertSink` POSTs JSON alerts (real-server test); falls back to structured logs · [x] `DashboardService.alertSnapshot({since,dayCap})` provides the real rolling-24h DB snapshot; `main.ts` evaluates every 5 min (`unref`'d, cleared on shutdown) · [x] thresholds configurable via the `alerts` config block; webhook via `HELPUIT_ALERT_WEBHOOK_URL` (documented).

## PB20 — Rate-limit + validation — AFK ⟵ PB6 — ✅ DONE
### 37. Rate limiting + input validation on the webhook endpoints
**AC:** [x] per-conversation `RateLimiter` on `/webhooks/chatwoot` → 429 when a flood exceeds the cap (real server e2e) · [x] body-size limit (413) on all endpoints; malformed JSON → 400 (custom parser) · [~] per-conversation is the proxy for per-user (per-verified-user is finer, later); deep Zod payload validation is light (the orchestrator tolerates malformed). Wired in `main.ts` from `config.budget.rateLimit`.

## PB21 — Retention — AFK ⟵ PB14, PB9 — ✅ DONE
### 35. Retention/purge job ✅
**AC:** [x] new `RetentionService` (`@helpuit/db`): `purgeOlderThan(windowMs)` deletes investigations past the window AND every child row that references them — audit, encrypted evidence, account snapshots, repro attempts, spend, tickets, GitHub links — plus stale webhook idempotency records (by `processedAt`); batched deletes (SQLite 999-param safe) with per-table counts; **real-DB test** proves old rows + their cascade are gone while recent rows survive · [x] configurable policy: `retention.investigationDays` (default 90; `0` = keep forever) via YAML + `HELPUIT_RETENTION_DAYS` env override, documented in `.env.example` · [x] runs on a schedule: `main.ts` sweeps at startup + daily (`unref`'d timer, cleared on shutdown, logs purge counts) · [~] standalone scheduled timer rather than the (still-pending) PB14 job queue — swaps to the queue when PB14 lands.

---

# Wave 5 — ⟵ W4

## PB22 — Reliability hardening — AFK ⟵ PB14, PB8 — ✅ DONE
### 36. Timeouts, circuit breakers, backoff, graceful shutdown ✅
**AC:** [x] new `@helpuit/resilience`: `withTimeout` (deadline + AbortSignal cancel), `withRetry` (exp backoff + full jitter + retryable classification), `CircuitBreaker` (closed→open→half-open, deterministic injectable clock), `resilientFetch` (timeout + retry over real `fetch`, retries 408/429/5xx + network/timeout, returns final response on exhaustion) — all TDD'd against **real local HTTP servers** (slow/flaky), no mocks · [x] external calls bounded + auto-retried: wired `resilientFetch` into the Chatwoot client + the OpenAI-compatible LLM adapter; **live integration tests**: a transient 502/503 is transparently retried to success · [x] graceful shutdown in `main.ts` (SIGTERM/SIGINT → `app.close()` + DB close) · [~] full shutdown drain of queue/leases/containers depends on PB14 queue/worker (deferred with it); breaker is available for adapters to opt into per-dependency.

## PB23 — Deploy — AFK ⟵ PB6, PB14 — ✅ DONE
### 40. Dockerfile + docker-compose ✅
**AC:** [x] real `Dockerfile` (node:24-bookworm-slim + corepack pnpm + `tsx` runtime — no bundling, so libsql/native deps work; node-`fetch` HEALTHCHECK) — **actually built here**; [x] `docker-compose.yml` (one `helpuit` service — worker runs in-process for single-tenant; SQLite on a persistent named volume; mounted config; env_file) — **`docker compose config` validates**; [x] **the built container boots and serves `/healthz`+`/readyz` for real** (verified by `docker run` + curl); same image runs locally or on any host; [x] env-driven via `.env` + a mounted `helpuit.config.yaml` (new `HELPUIT_CONFIG_PATH` so a container points at a mounted file); [x] repeatable **boot smoke test** (`pnpm test:smoke`, isolated config) spawns the real entrypoint via tsx and probes health · [~] **honest scope vs the original AC**: single service not server+worker+postgres+browser — the worker is in-process (single-tenant), Postgres awaits the Drizzle pg dialect (libsql `file:` volume is the durable store now), and the Playwright/browser base is deferred until dynamic L3b repro is wired into the orchestrator (documented in the Dockerfile); TLS/reverse-proxy is a deploy-doc note for PB25.

## PB24 — Test depth — AFK ⟵ PB5, PB11, PB13 — ✅ DONE (security gaps found + fixed)
### 42. Contract + integration + security + e2e + evals ✅ (Postgres/eval-harness deferred)
**AC:** [x] probed real edge cases through public interfaces; two genuine **security gaps found and fixed via TDD**: (1) **output rail leaked secrets** — it stripped code/SQL/paths/stack-frames but not a key echoed *inline*, which code-grounded guidance (PB16) made reachable → added secret stripping (`Redactor.redactSecrets`, secrets-only so the customer's own contact info stays), proven end-to-end (a model answer containing `sk-…` never reaches the customer via the live `replyAndAudit` rail); (2) **redaction missed phone numbers** → added NANP + E.164 phone rules (flow through `RedactingIssueTracker` to GitHub) · [x] refactored `Redactor` into reusable secret/PII rule sets (single source of truth, now shared by the export gate AND the output rail) · [x] confirmed loop-prevention (`parseInboundMessage` ignores outgoing/empty/no-conversation) is regression-covered · [~] Postgres-on-testcontainers + a formal LLM eval harness deferred (the SQLite suite + real-HTTP/real-DB integration tests cover behavior; Postgres dialect lands with the deploy work, evals are a separate ops concern).

## PB25 — Docs + License — AFK ⟵ PB4 — ✅ DONE
### 43. Docs + LICENSE ✅
**AC:** [x] `README.md` rewritten to the real built state (capabilities, levels, quickstart, config, licensing) · [x] `docs/ARCHITECTURE.md` (request flow, level→package map, full package list, safety invariants, persistence) · [x] `docs/SELF-HOSTING.md` (configure/run, Chatwoot+GitHub wiring, **TLS/reverse-proxy**, admin API, metrics, alerts, budget, retention, backups/keys, scaling) · [x] `CONTRIBUTING.md` (TDD/no-mocks conventions + **CLA note** preserving dual-licensing) · [x] config reference via the heavily-commented `.env.example` + `helpuit.config.example.yaml` (pointed to from README/SELF-HOSTING) · [~] formal ADR set folded into ARCHITECTURE's "safety invariants" rather than separate ADR files.

## PB4 — License decision — HITL — ✅ DONE
### 44. License selection
**AC:** [x] founder chose **PolyForm Noncommercial 1.0.0** (source-available; free for personal/noncommercial, commercial use requires a separate license) · [x] `LICENSE` committed with the Required Notice; `COMMERCIAL-LICENSE.md` routes commercial users to the founder; `package.json` `license` set; "open source" → "source-available" everywhere user-facing.
