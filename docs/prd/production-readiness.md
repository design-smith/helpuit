# PRD — Helpuit: Skeleton → Production-Ready, Enterprise-Grade (Source-Available, Single-Tenant)

> Licensing note (post-dates this PRD): Helpuit ships under PolyForm Noncommercial 1.0.0 —
> **source-available**, not OSI open source. Free for noncommercial use; commercial use needs
> a separate license. References to "open source" below are historical.

> Status: ready-for-agent · Scope: take the green, fully-faked package skeleton (23 packages,
> 135 passing behavior tests, typecheck clean) to a self-hostable application a single company
> can run in production. Open-source, **single-tenant** (one company per deployment). Not a
> multi-tenant SaaS.

## Problem Statement

Helpuit today is a correct **skeleton**: every capability (guidance, account investigation, static
investigation, classification, reproduction, escalation, lifecycle sync, the orchestrator spine) is
implemented and unit-tested, but every external dependency is a fake. Nothing real runs — there is
no HTTP server, no Chatwoot/GitHub/LLM/Playwright/database connection, no deployment, and none of
the operational concerns an enterprise self-hoster requires (security hardening, observability,
reliability, secrets, migrations, CI/CD, data protection, docs). A founder cannot yet point it at
their product and have it handle a real customer ticket end-to-end, nor run it safely in production.

## Solution

Wire the real adapters behind the existing interfaces, stand up the runtime (an HTTP server plus a
background worker), make configuration fully env/file-driven so the **same image runs locally and
deployed**, and add the cross-cutting enterprise concerns. When done, a single company can: set
secrets in `.env` / their secret store, describe their product in `helpuit.config.yaml`, run
`docker compose up` locally or deploy the image to the web, connect their Chatwoot + GitHub +
LLM provider(s) + read-only query endpoints, and have Helpuit autonomously handle customer support
— guiding, investigating account state, reproducing suspected bugs, filing engineering-grade GitHub
issues, and closing the loop when fixes ship — with full auditability, cost caps, and safety rails.

## User Stories

**Founder / operator (the self-hosting company)**
1. As a founder, I want to configure Helpuit entirely through `.env` + `helpuit.config.yaml`, so that I can run it without editing code.
2. As a founder, I want `docker compose up` to start the whole stack locally (API, worker, Postgres, headless browser), so that I can try it on my machine in minutes.
3. As a founder, I want to deploy the same container image to any host, so that local and production behave identically.
4. As a founder, I want the agent to guide me through defining my read-only query routes against my real schema, so that Level-2 setup is fast and I don't expose sensitive columns by accident.
5. As a founder, I want Helpuit to auto-draft my feature manifest from my repo and let me confirm it, so that I don't hand-author it.
6. As a founder, I want to choose my LLM provider(s) and per-tier models by config, so that I can run Claude, OpenAI, Bedrock, DeepSeek, or a local model without code changes.
7. As a founder, I want to set budget caps and have Helpuit stop and hand off to me when hit, so that I never get a surprise LLM bill.
8. As a founder, I want issue auto-publish to be a toggle (draft vs auto), so that I control what reaches my issue tracker.
9. As a founder, I want resolution updates to be manual or automatic by toggle, so that customers are never told "fixed" before it's true.
10. As a founder, I want a dashboard of resolution rate, reproduction success rate, spend vs caps, and classification breakdown, so that I can judge whether Helpuit is performing.
11. As a founder, I want a full per-investigation audit trail of every message and action, so that I can see exactly what the agent did.
12. As a founder, I want to take over any conversation from the agent, so that I can intervene when needed.
13. As a founder, I want alerts when budget thresholds, escalation spikes, or reproduction-failure spikes occur, so that I learn about problems before customers do.
14. As a founder, I want sensitive topics (money, security, data-loss, legal) routed to me rather than handled autonomously, so that the agent can't make an irreversible mistake.

**Customer (end user in chat)**
15. As a logged-in customer, I want the assistant to answer using real knowledge of the product and my account, so that I get accurate help, not generic boilerplate.
16. As a customer, I want to be told clearly when an issue is being escalated and that I'll be updated, so that I'm not left wondering.
17. As a customer, I want to be notified to retry once my reported bug is fixed, so that I know it's resolved.
18. As a customer, I want to be told if work will take a while and that I can leave, so that I'm not stuck waiting.
19. As a customer, I want the assistant to never leak code, SQL, or internal details to me, so that responses stay clear and safe.
20. As an unauthenticated visitor, I want to be asked to log in (when anonymous access is off), so that my data is protected.

**Engineer (founder wearing the eng hat / small team)**
21. As an engineer, I want engineering-grade GitHub issues with summary, repro steps, suspected files, severity, and evidence, so that I can fix fast.
22. As an engineer, I want duplicate reports collapsed into one issue with an affected-customer count, so that my tracker isn't spammed.
23. As an engineer, I want issue evidence to contain no customer PII or secrets, so that I don't leak data into a permanent, possibly-public tracker.
24. As an engineer, I want a recurrence after a closed fix filed as a new (regression) issue, so that regressions are visible.

**SRE / operator**
25. As an operator, I want `/healthz` and `/readyz` endpoints, so that my orchestrator can health-check and gate traffic.
26. As an operator, I want structured JSON logs with request/trace ids, so that I can debug across services.
27. As an operator, I want Prometheus/OpenTelemetry metrics and traces, so that I can monitor and profile.
28. As an operator, I want graceful shutdown that drains jobs and releases sandbox leases/containers, so that deploys don't strand work or leak resources.
29. As an operator, I want background work (reproduction, escalation, sync) on a durable queue with retries and a dead-letter, so that transient failures don't lose tickets.
30. As an operator, I want webhook handling to be idempotent, so that redelivered events don't double-act.
31. As an operator, I want external calls bounded by timeouts and circuit breakers, so that a slow Chatwoot/GitHub/LLM can't hang the system.
32. As an operator, I want database migrations that run on deploy, so that schema changes are safe and repeatable.
33. As an operator, I want to scale the worker horizontally, so that I can handle reproduction load.

**Security / compliance (often the same founder)**
34. As a security owner, I want all secrets loaded from env/secret store and never logged, so that credentials don't leak.
35. As a security owner, I want Chatwoot and GitHub webhooks signature-verified, so that endpoints can't be spoofed.
36. As a security owner, I want customer identity verified from a trusted token only (never chat text), so that no one can read another user's data.
37. As a security owner, I want account queries structurally limited to a founder-approved catalog scoped to the verified user, so that cross-user access is impossible.
38. As a security owner, I want evidence artifacts encrypted at rest and redaction enforced before any export, so that PII never escapes.
39. As a security owner, I want configurable data retention with automatic purge, so that we don't hoard customer data.
40. As a security owner, I want per-user rate limiting and input validation on all endpoints, so that abuse is contained.
41. As a security owner, I want dependency and image vulnerability scanning in CI, so that known CVEs are caught.
42. As a security owner, I want the bot to use least-privilege tokens (read-only where possible), so that a compromise has minimal blast radius.

**Open-source contributor**
43. As a contributor, I want a clear README, ARCHITECTURE doc, and ADRs, so that I understand the system.
44. As a contributor, I want a documented `helpuit.config.yaml` reference and self-hosting guide, so that I can run and extend it.
45. As a contributor, I want CONTRIBUTING guidelines, a license, and CI that runs lint/typecheck/test on PRs, so that contributions are smooth and safe.
46. As a contributor, I want each integration behind an interface with a fake, so that I can add a new provider/tracker without touching the core.
47. As a contributor, I want a way to add a new LLM provider by implementing one interface, so that the gateway stays extensible.

**Product completeness (close the remaining gaps)**
48. As a founder, I want guidance grounded in the actual code (not just docs), so that answers reflect how the feature really works.
49. As a customer, I want long-running investigations to detach and follow up asynchronously, so that the chat isn't blocked.
50. As a founder, I want reproduction blocked on irreversible-side-effect features and Playwright toggleable, so that the agent never charges a card or deletes data.
51. As a founder, I want the escalation pipeline to reproduce (when allowed) before filing, so that issues carry real evidence.

## Implementation Decisions

### Runtime topology
- Two processes from one image: **`apps/server`** (Fastify HTTP — webhooks, Dashboard App, health, admin/metrics) and **`apps/worker`** (background job processor for async L3/L4 and lifecycle fan-out). Selected by a start command/env so the same image serves both roles.
- All configuration is **12-factor**: secrets from env; non-secret product config from `helpuit.config.yaml`. No code changes to reconfigure.

### New deep modules (interfaces stay small; implementations swappable)
- **`@helpuit/llm`** — provider-agnostic `ChatModel` interface (`complete(messages, opts) → { text, usage }` and a structured/JSON variant) with adapters: `anthropic`, `openai`, `bedrock`, `deepseek`, `openai-compatible` (Ollama/vLLM/LM Studio). A `ModelRouter` selects provider+model per tier (guidance/reasoning/vision) from config. Emits token usage for the budget governor. The existing `GuidanceModel`/`AccountModel`/`StaticAnalysisModel` are implemented on top.
- **`@helpuit/config`** — Zod schema for `helpuit.config.yaml` + env binding + validated loader. Encodes: app/repro URLs, GitHub owner/repo/branch, query-route catalog, feature manifest seed, sandbox roles + login flow, policy toggles, budget caps, model tiering, identity mode.
- **`@helpuit/db`** — Drizzle schema + migrations + repository implementations of the existing interfaces (`InvestigationRepository`, `ManifestStore`, ticketing store, `AuditLog` persistence, `SpendLedger` persistence, GitHub links, artifacts). One schema, two dialects (SQLite local / Postgres prod).
- **`@helpuit/queue`** — durable job queue abstraction (`enqueue`, `process`, retry w/ backoff, idempotency key, dead-letter). Default impl: pg-boss (Postgres-backed, no extra infra) — keeps single-tenant ops simple.
- **`@helpuit/observability`** — pino structured logging, request/trace-id propagation, OpenTelemetry metrics + traces, and a metrics registry feeding the founder dashboard.
- **`@helpuit/crypto`** — artifact/snapshot encryption at rest + secret access helpers.
- **`@helpuit/playwright`** — real `BrowserDriver`: launches a browser (in the container via the existing `DockerContainerRunner`), performs the configured login flow, executes reproduction steps, captures screenshot/console/HAR evidence; enforces per-repro caps.
- **`@helpuit/github`** — `IssueTracker`/`IssueSearch`/`RepoSource` backed by GitHub MCP (issues read/write, contents read, search) + GitHub webhook parse/verify.

### Modules modified
- **`@helpuit/chatwoot`** — finish `HttpChatwootClient` (real HTTP), add the Fastify webhook route + (optional) signature verification, and the Dashboard App panel route + view-model (closes deferred P10).
- **`@helpuit/identity`** — concrete `TokenVerifier` implementations: `hmac` (Chatwoot identity validation), `jwt` (JWKS), `endpoint` (verify call). Selected by config.
- **`@helpuit/guidance`** — add code-grounded guidance (manifest → code retrieval as context), closing deferred P11.
- **`@helpuit/feature-manifest`** — wire `HeuristicManifestBuilder` to a GitHub MCP `RepoSource` at the production branch; add re-index on push.
- **`@helpuit/escalation`** — build the **escalation pipeline composition** that satisfies the orchestrator's `EscalationPort`: `canReproduce` (policy) → reproduce (if allowed) → `classifyEvidence({reproduced})` → draft → file/link. The one currently-unwired bit of glue.
- **`@helpuit/orchestrator`** — wire real ports; introduce the **async boundary** (deferred P15): L3/L4 detach to the worker, post the ">10 min, you can leave" notice, post results back to the open conversation; keep conversation open through the gap.
- **`@helpuit/reproduction`** — enforce caps inside the drive loop (steps/time/retries/budget) and the abortability precondition before launch.

### Persistence schema (Drizzle; the `helpuit_*` model)
`helpuit_investigations`, `helpuit_user_context_snapshots`, `helpuit_reproduction_attempts`,
`helpuit_evidence_artifacts` (with `redaction_status` + encrypted blob ref), `helpuit_github_links`
(**many investigations → one issue**), `helpuit_ticket_updates`, plus `helpuit_audit`,
`helpuit_spend`, and a `processed_webhook_events` table for idempotency.

### API contracts
- `POST /webhooks/chatwoot` — inbound message events → orchestrator intake (idempotent by message id).
- `POST /webhooks/github` — issue/PR events → lifecycle sync (HMAC-verified via `GITHUB_WEBHOOK_SECRET`, idempotent by delivery id).
- `GET /healthz` (liveness), `GET /readyz` (readiness: DB + queue reachable).
- `GET /app/dashboard` — Chatwoot Dashboard App iframe (renders the live investigation view-model for the open conversation).
- Admin/metrics endpoints (auth-gated): `/metrics` (Prometheus), founder dashboard data.
- **Query-route client contract**: `GET/POST {QUERY_ROUTES_BASE_URL}/{route}` with `Authorization: Bearer {QUERY_ROUTES_TOKEN}` and the bound `userId` from the verified identity; response is the allowlisted columns. The catalog lives in `helpuit.config.yaml`.

### Reliability & safety
- Idempotent webhooks (dedupe table), retries with exponential backoff + jitter, dead-letter on exhaustion, per-call timeouts + circuit breakers on Chatwoot/GitHub/LLM/query-routes, graceful shutdown (drain queue, release leases, kill containers), the abortability invariant for all reproduction.

### Deployment
- Multi-stage `Dockerfile`; `docker-compose.yml` for local (server + worker + Postgres + a headless-browser/Playwright container); env-driven for any host; reverse-proxy/TLS + health-check guidance documented. Browser execution isolated per reproduction (container), bounded by global concurrency cap.

### CI/CD & DX
- GitHub Actions: lint, typecheck, full test suite, build/scan image, optional eval suite, release. Husky pre-commit (lint-staged + typecheck + affected tests). Docs: README, ARCHITECTURE, SELF-HOSTING, CONFIG reference, CONTRIBUTING, ADRs, runbook, and an OSI **LICENSE** (e.g. Apache-2.0 or AGPL-3.0 — decision pending).

## Testing Decisions

**What makes a good test:** verifies observable behavior through a public interface, not internal
structure; survives refactors; for adapters, tests the *contract* (against a fake HTTP server or
recorded fixtures), not the live third party.

- **Unit (already in place, keep green):** the deterministic deep modules — redaction, dedup,
  classification, assessment, budget governor, rate limiter, sandbox pool, query-route catalog,
  lifecycle state machine, repro policy. Prior art: the existing 135 vitest behavior tests.
- **Adapter contract tests:** `@helpuit/llm` providers (against recorded responses / a stub server),
  `HttpChatwootClient`, `@helpuit/github`, query-route client, identity verifiers — assert request
  shape, auth headers, identity binding, and error mapping; no live network in CI.
- **Integration:** orchestrator end-to-end against a **real Drizzle DB on Postgres via
  testcontainers** with in-memory adapter fakes — proves the spine + persistence + transitions.
- **Security tests:** webhook signature rejection, identity-token rejection (forged/missing),
  redaction export gate blocks un-redacted artifacts, query-route rejects out-of-catalog columns,
  output rail strips code/SQL/PII.
- **LLM evals (non-blocking, scored):** recorded complaint→answer/classification fixtures with
  rubric scoring, to track guidance/classification quality and reproduction hit-rate over time.
- **E2E smoke (manual/optional gate):** a scripted message through a real Chatwoot test inbox to a
  staging app, asserting a reply posts back.

Modules to test: all of the above. LLM agents are validated by evals, not brittle unit assertions.

## Out of Scope

- Multi-tenant SaaS, tenant admin, billing/metering — Helpuit is **single-tenant** per deployment.
- Customer-account impersonation; arbitrary/free-form SQL from the LLM.
- Auto-code-fixing, auto-PRs, or any write access to the product's source.
- Automatic public "it's fixed" messages outside the resolution-mode toggle/approval.
- Building MuntuAI (or any target product) itself, or a hosted/managed Helpuit offering.
- A fully custom analytics platform beyond the operator dashboard + metrics export.

## Further Notes

- **Two empirical unknowns** only real usage resolves: dynamic-reproduction reliability and
  feature-manifest accuracy. Instrument both (repro success rate, manifest-correction rate) from day
  one and let the data drive how much to lean on them.
- **Dogfood against MuntuAI** but keep every product-specific detail behind config/adapters — no
  MuntuAI specifics in the core.
- **Model-agnostic** and **local-or-deployed** are hard requirements, reflected in `@helpuit/llm`
  and the 12-factor/compose setup.
- Recommended build order (incremental, each shippable): (1) config + DB/migrations + server skeleton
  + health; (2) live Chatwoot + LLM gateway → real **L1 guidance** round-trip; (3) identity verifier;
  (4) query routes → **L2**; (5) queue + async boundary; (6) Playwright + repro caps → **L3b**;
  (7) GitHub + escalation pipeline → **L4**; (8) lifecycle webhook → sync loop; (9) observability,
  security hardening, retention/crypto; (10) CI/CD, docs, license, dashboard.
</content>
