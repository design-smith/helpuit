# Architecture

Helpuit is a pnpm monorepo: **one package per capability**, each a deep module with a small
interface, composed into a single orchestrator and served by one HTTP app. Everything is
TypeScript/ESM, tested with Vitest against **real collaborators** (real HTTP servers, a real
in-memory database, real Chromium) — not mocks.

## Request flow

```
Chatwoot webhook ──> apps/server ──> enqueue job (DrizzleJobQueue)
                                        │
                                        ▼
                                   Worker (in-process)
                                        │
                                        ▼
                                 Orchestrator.handleInbound
   parse → [founder-takeover gate] → identity gate → create investigation
        → known-issue dedup → L1 guidance ──(low confidence)──┐
                                                              ▼
                          L2 account investigation ──(no explanation)──┐
                                                                       ▼
                                       L3a static code investigation ──(new bug)──┐
                                                                                  ▼
                                                            L4 escalation → GitHub issue
        every customer reply ─→ output rail (strip code/SQL/paths/secrets) ─→ Chatwoot
        every LLM call ─────────→ metered (budget caps) ─→ tokens recorded
```

The webhook **enqueues and returns 200 immediately**; the worker runs the (slow)
investigation off the request path, with retries/backoff/dead-lettering.

## Investigation levels

| Level | Package(s) | What happens |
|------|------------|--------------|
| **L1** Guidance | `guidance`, `llm` | Answer from docs **and the resolved feature's real source code** (`ManifestCodeContextProvider` → `GitHubCodeRetriever`). |
| **L2** Account | `account-investigation`, `query-routes` | Read the customer's real state via founder-approved **read-only query routes**. Identity comes only from a verified token. |
| **L3a** Static | `static-investigation`, `feature-manifest`, `github` | Resolve the feature, fetch its code, form a hypothesis + confidence. |
| **L3b** Dynamic | `reproduction`, `playwright`, `sandbox` | Drive the app in real Chromium as a sandbox account to confirm the bug. *(Built + tested; orchestrator wiring staged.)* |
| **L4** Escalation | `escalation`, `dedup`, `github` | Dedupe vs open issues, then file/link a **redacted** GitHub issue; update the ticket. |

## Package map

**Spine**
- `contracts` — shared branded types (`InvestigationId`, `Classification`, …).
- `orchestrator` — the intake spine; optional capability ports degrade gracefully.
- `composition` — wires the production orchestrator from validated config + a live DB.
- `config` — Zod schema + YAML loader + env/secret binding (`@helpuit/config`).
- `apps/server` — Fastify: webhooks, `/healthz` `/readyz` `/metrics`, admin API; `main.ts` entrypoint.

**Capabilities**
- `chatwoot` — inbound parse (loop-safe) + outbound client (resilient).
- `identity` — token verification (HMAC / JWT / endpoint) → verified identity; access gate.
- `guidance` + `llm` — docs/code-grounded answers over a model-agnostic LLM gateway
  (Anthropic / OpenAI / Bedrock / DeepSeek / OpenAI-compatible), routed per tier + metered.
- `account-investigation` + `query-routes` — capability-limited account reads.
- `feature-manifest` — feature ↔ code/route map + complaint→feature resolver.
- `static-investigation`, `reproduction`, `sandbox`, `playwright` — L3a/L3b.
- `escalation` + `dedup` + `github` — issue drafting, dedup, GitHub I/O, **redaction gate**.
- `lifecycle-sync` — GitHub issue events → customer ticket updates.

**Cross-cutting**
- `budget` — spend ledger + governor (per-day/month caps that halt work).
- `crypto` — `SecretBox` (AES-256-GCM at rest) + `Redactor` (PII/secret scrub).
- `resilience` — `withTimeout` / `withRetry` / `CircuitBreaker` / `resilientFetch`.
- `queue` — `JobQueue` + `Worker` (in-memory + persistent `DrizzleJobQueue`).
- `observability` — Prometheus metrics + `AlertEngine` + sinks.
- `db` — Drizzle schema + repositories + migrations + retention + dashboard + control store.
- `audit`, `assessment`, `classification`, `output-rail`, `ticketing`, `investigation-store` — supporting modules.

> `metrics` and `redaction` are early-skeleton packages superseded by `observability` and
> `crypto` respectively.

## Data & safety invariants

- **Identity** is only ever a verified token — never a chat-asserted user id.
- **No raw SQL** to customer data — only founder-approved, column-scoped query routes.
- **No PII/secrets to GitHub** — `RedactingIssueTracker` gates every export.
- **No sensitive data in plaintext at rest** — evidence content is AES-256-GCM sealed.
- **Cost is capped** — every LLM call is metered; exceeding a cap halts work and hands to the founder.
- **Data ages out** — retention purges investigations + their cascade past a configurable window.
- **Human gate** — irreversible categories never run autonomously; the founder can take over any conversation.

## Persistence

Drizzle ORM over libsql (`@libsql/client`): `:memory:` for tests, a `file:` database on a
volume for deployment. Migrations are idempotent DDL applied at startup. The Postgres dialect
is planned (the queries stay dialect-portable).
