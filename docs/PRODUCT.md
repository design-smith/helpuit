# Helpuit — Product Description

**Helpuit is a source-available, self-hosted autonomous AI support engineer.** It sits on your
existing Chatwoot inbox, and when a customer message arrives it answers from your product's docs
and **real source code**, reads the customer's **verified** account state, reproduces suspected
bugs in a sandbox, files engineering-grade GitHub issues, and keeps the customer's ticket updated
through resolution — escalating only as far as it needs to, with a human gate where it matters.

It is a **standalone service** that integrates with **stock Chatwoot** (Agent Bot + webhooks) — it
does not fork Chatwoot. It is **single-tenant**: one company per deployment.

---

## The problem

Customer support for software products is split across two worlds that rarely talk:

- **Support** answers from canned macros and docs — and escalates anything real to engineering.
- **Engineering** receives vague tickets ("it's broken"), has to reproduce them, dig through the
  code, and figure out whether it's user error, an account-state issue, or a genuine bug.

The result is slow first responses, low-quality bug reports, and engineers context-switching to
triage. Generic AI chatbots make the first problem look solved while making the second worse — they
hallucinate answers with no grounding in the actual product, and they can't investigate.

**Helpuit closes that loop.** It does the engineer's triage *automatically and with grounding* —
real code, real account data, real reproduction — and only involves a human when the work is
irreversible or genuinely ambiguous.

## Who it's for

Software companies running customer support through Chatwoot who want their support agent to be
**grounded in their actual product**, not a generic FAQ bot — and who want every escalation to
arrive as a clean, deduplicated, engineering-ready GitHub issue.

---

## How it works: the escalation ladder

A customer message only climbs as far as it needs to. Each rung is independent — you connect only
what you need, and the agent gets more capable as you connect more.

| Level | What happens | Needs |
| --- | --- | --- |
| **L1 — Guidance** | Answers from your **product docs and the resolved feature's real source code** — grounded in how the feature actually behaves, not a generic guess. | GitHub + an LLM key (docs optional) |
| **L2 — Account investigation** | Reads the **verified** customer's real account state through founder-approved, **column-allowlisted read-only routes** — never raw SQL, identity always from a verified token. | Account query routes + identity verification |
| **L3a — Static investigation** | Resolves the complaint to a feature, fetches that feature's code, and forms a hypothesis with a confidence score. | GitHub + a feature manifest |
| **L3b — Dynamic reproduction** | Drives your app in a **real browser as a sandbox account** to confirm a suspected bug, capturing evidence. *(Opt-in; the reproduction engine is built and real-Chromium tested.)* | Playwright enabled + sandbox credentials |
| **L4 — Escalation** | **Dedupes** against open issues, files a **redacted** GitHub issue (or links the duplicate), and tells the customer. Issue lifecycle events then sync back to the customer's ticket. | GitHub |

**The climb:** L1 guidance → if low-confidence and account data is connected, L2 account
investigation → if the account doesn't explain it, L3a static investigation → a suspected bug
optionally L3b reproduces → L4 dedupes and files/links a redacted GitHub issue, then updates the
customer.

The webhook **enqueues the work and returns immediately**; a background worker runs the (slow)
investigation off the request path, with retries, backoff, and dead-lettering.

> **Minimum to do the bare job** — a grounded answer plus a filed issue — is just **Chatwoot**,
> **GitHub**, an **LLM key**, and **customer identity**. Everything above L1 is an optional rung.

---

## Always-on guardrails

These run across every investigation, regardless of which rungs are connected:

- **Cost caps** — every LLM call is metered against per-day / per-month budgets; exceeding a cap
  halts work and hands the conversation to a human rather than spending further.
- **Redaction** — an output rail strips code, SQL, file paths, and secrets from every customer
  reply; a separate redaction gate scrubs PII/secrets from anything exported to GitHub.
- **Encryption at rest** — evidence (screenshots, logs, account snapshots) and stored secrets are
  sealed with AES-256-GCM.
- **Retention** — investigations and their entire child cascade age out past a configurable window.
- **Observability** — Prometheus `/metrics`, structured logs, and a threshold alert engine
  (budget near/over cap, reproduction failure rate, escalation spikes) with webhook or log sinks.
- **Human gate** — irreversible action categories never run autonomously, and an operator can pause
  ("take over") any conversation and resume it later.

---

## The operator console

A built-in web console (the operator's cockpit) over a token-guarded admin API:

- **Dashboard** — live operational overview with a real-time activity feed (SSE): investigations,
  issues linked, spend, reproduction success rate, queue depth, paused conversations.
- **Getting started** — a dismissible onboarding card: a guided-setup video alongside a checklist
  of the connectors to wire.
- **Setup checklist / readiness** — shows exactly what's still required before the agent is ready.
- **Connections** — connect GitHub (App or token), Chatwoot (validate + auto-setup the Agent Bot
  and webhook), and the LLM provider, each with a one-click **Test**.
- **Configuration & Secrets** — edit structural settings live; manage secrets in an encrypted vault
  (values are masked and never returned in plaintext).
- **Feature manifest** — review and edit the feature↔code map that grounds L1/L3a (auto-drafted
  from your connected repo).
- **Jobs & Alerts** — inspect the queue, retry or purge dead-lettered jobs, and review alert history.
- **One-click Restart** — apply changes that need a reboot; the server restarts itself cleanly.

Most configuration is UI-first; structural settings apply live or via the one-click restart.

---

## Integrations

- **Chatwoot** — stock Chatwoot via Agent Bot + webhooks. The console validates your URL/token and
  auto-creates the bot and webhook for you.
- **GitHub** — a GitHub App (recommended, multi-repo) or a personal access token. Grounds answers in
  your code, files issues, and syncs issue lifecycle back to customer tickets.
- **LLM providers** — a **model-agnostic gateway**: Anthropic (Claude), OpenAI, AWS Bedrock,
  DeepSeek, or any OpenAI-compatible / local model. Providers and models are selectable **per
  pipeline tier** (high-volume guidance vs. deeper reasoning vs. vision) and every call is metered.
- **Identity verification** — turn the chat widget's user token into a *trusted* user id via **HMAC**
  (Chatwoot Identity Validation), **JWT**, or a verify **endpoint**. Helpuit never trusts a
  chat-asserted id.
- **Account data** — read-only, column-allowlisted query routes against your app (e.g. a Supabase
  Edge Function scaffold) so the agent can read a verified customer's state without raw database
  access.

---

## Setup & configuration

A fresh clone is brought up with one bootstrap command and then connected from the console:

1. **`pnpm run setup`** — a first-run wizard that generates a strong encryption key and admin token,
   asks how the instance is reachable (a built-in **Cloudflare tunnel** for local use, or **your own
   domain** when deployed), picks the database, and writes your `.env` + a valid config file.
2. **`pnpm start`** (or `pnpm start --tunnel`) — boots the server and prints the local + public URLs.
   Locally it runs under a small supervisor so the console's "Restart now" actually restarts.
3. **Connect** GitHub, Chatwoot, the LLM provider, and identity from the console's Setup checklist.

Configuration layers cleanly: a non-secret structural file (`helpuit.config.yaml`) + secrets/runtime
(`.env`) form the baseline, which a database config store and an encrypted secret vault **override**
for live, in-console changes. The app **boots even with nothing configured** (lenient) and reports
what's missing.

---

## Security & privacy invariants

These are enforced in code, not just convention:

- **Identity is only ever a verified token** — never a chat-asserted user id.
- **No raw SQL to customer data** — only founder-approved, column-scoped query routes.
- **No PII or secrets to GitHub** — every export passes a redaction gate.
- **No sensitive data in plaintext at rest** — evidence and secrets are AES-256-GCM sealed; the
  encryption key is generated strong at setup and must stay stable.
- **Cost is capped** — metered LLM calls; a breached cap halts and hands off.
- **Data ages out** — retention purges past a configurable window.
- **Human gate** — irreversible categories never run autonomously; operators can take over any
  conversation.

---

## Architecture & technology

A pnpm/TypeScript (ESM) monorepo: **one package per capability**, each a deep module with a small
interface, composed into a single orchestrator and served by one Fastify app. Optional capability
ports degrade gracefully — an unconnected rung simply isn't used.

- **Stack:** TypeScript/Node, Fastify, Zod, Drizzle ORM, Playwright, Vitest; a React + Vite operator
  console.
- **Testing:** exercised against **real collaborators** (real HTTP servers, a real in-memory
  database, real Chromium) rather than mocks.
- **Persistence:** Drizzle over **SQLite/libsql** — a local `file:` database by default (zero DB
  setup), or a managed/HA remote **libsql server (Turso)**. Migrations are idempotent and applied at
  startup. *(A Postgres/Supabase dialect is on the roadmap — the foundation is built and verified
  against real Postgres; see [ADR 0001](adr/0001-database-engine.md).)*

See [ARCHITECTURE.md](ARCHITECTURE.md) for the request flow and package map.

---

## Deployment

- **Local / trial:** `pnpm run setup` → `pnpm start --tunnel` gives a public URL with no domain needed.
- **Self-hosted production:** point your domain at the server, run it with TLS behind a reverse
  proxy, back up the database volume (or use Turso). See [SELF-HOSTING.md](SELF-HOSTING.md).
- **Database:** a SQLite file on a persistent volume, or a remote libsql/Turso URL for managed/HA.

---

## Maturity — what's built vs. planned

- **Built & in use:** the full intake → L1/L2/L3a → L4 pipeline, the operator console, connectors
  (GitHub App/token, Chatwoot auto-setup, model-agnostic LLM, identity, account query routes), the
  always-on guardrails, the bootstrap wizard, and the local tunnel + supervisor.
- **Built & tested, wiring staged:** L3b dynamic reproduction (real-Chromium tested; opt-in).
- **On the roadmap:** Postgres/Supabase as a first-class database engine (foundation banked), and
  per-investigation spend attribution.

---

## Licensing

Helpuit is **source-available, not open source**, under
[PolyForm Noncommercial 1.0.0](../LICENSE):

- ✅ **Free** for personal, research, educational, and other **noncommercial** use — including
  reading, running, and modifying the source.
- ❌ **Commercial / business use requires a separate commercial license** — see
  [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md).

---

## Learn more

- [README](../README.md) — quick start, step by step.
- [Capability ladder](capability-ladder.md) — what each rung unlocks.
- [Architecture](ARCHITECTURE.md) — request flow, package map, invariants.
- [Self-hosting](SELF-HOSTING.md) — production deploy guide.
