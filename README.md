# Helpuit

**Source-available, self-hosted autonomous AI support engineer.** Helpuit reads a
product's docs and source code, looks at a customer's real account state, reproduces
suspected bugs in a sandbox, files engineering-grade GitHub issues, and keeps the
customer's ticket updated through resolution — autonomously, with a human gate where it
matters.

> Helpuit is a **standalone service** that integrates with **stock Chatwoot** (Agent Bot
> + webhooks). It does **not** fork Chatwoot. Single-tenant: one company per deployment.

> **Licensing:** Helpuit is **source-available, not open source.** It is free for
> personal and noncommercial use under the [PolyForm Noncommercial 1.0.0](LICENSE)
> license. **Any commercial or business use requires a separate commercial license** —
> see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

## What it does

A customer message comes in through Chatwoot; Helpuit escalates only as far as it needs to:

1. **L1 — Guidance.** Answers from your docs **and your actual source code** (grounded in
   the real behavior of the feature the complaint maps to).
2. **L2 — Account investigation.** Reads the customer's real state through **founder-approved,
   read-only query routes** (never raw SQL, identity always from a verified token — never
   chat-asserted).
3. **L3a — Static investigation.** Resolves the feature, reads its code, forms a hypothesis.
4. **L3b — Dynamic reproduction.** Drives your app in a real browser as a sandbox account
   to confirm the bug *(opt-in: enable Playwright + provide sandbox credentials)*.
5. **L4 — Escalation.** Dedupes against open issues, then files a **redacted**
   GitHub issue (or links an existing one) and tells the customer.

Cross-cutting: **cost caps** (per-day/month budget that halts work and hands off), **redaction
+ encryption** (no PII/secrets to GitHub, evidence encrypted at rest), **retention** (data
ages out), **observability** (`/metrics`, structured logs, threshold alerts), an **async
queue + worker** (webhooks return instantly), and **founder takeover** (pause the agent on
any conversation and handle it yourself).

## Quick start — fork → connect → working

No file editing. Bring it up, then connect everything in the console.

```sh
docker compose up -d
# On first boot Helpuit prints a one-time admin token to the logs:
docker compose logs helpuit | grep "admin token"
```

Open the console at `http://localhost:3000`, log in with that printed **admin token**, and
work the **Setup checklist** on the home screen — every connector has a one-click **Test**:

1. **Connect GitHub** — a GitHub App (recommended) or a token; *Test connection*.
2. **Connect Chatwoot** — paste your URL + token, *Validate & prefill* the account/inbox,
   then *Auto-setup* the Agent Bot + webhook.
3. **Pick an LLM** — choose a provider, set its key, *Test LLM*.
4. *(optional)* Add product **docs**, connect **account data**, enable **reproduction**.

Click **Restart now** when the banner offers it. Then a Chatwoot message gets a **grounded**
answer, and a real bug gets an engineering-grade GitHub issue filed for it. The agent boots
with nothing set and gets smarter as you connect more — see the
**[capability ladder](docs/capability-ladder.md)**.

### Minimum config

The bare job — a grounded answer plus a filed issue — needs only these (set them in the
console, or as env vars):

| Secret | Why |
| --- | --- |
| `CHATWOOT_API_TOKEN` | Read and reply to Chatwoot conversations. |
| `GITHUB_TOKEN` | Ground answers in your repo and file issues (or connect a GitHub App instead). |
| `ANTHROPIC_API_KEY` | Your LLM provider's key — powers the agent's reasoning (swap for your provider's key). |
| `IDENTITY_HMAC_SECRET` | Verify the customer before reading their account (or pick JWT/endpoint mode instead). |

Everything else is optional and adds capability. See **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**
for the full deploy guide (TLS/reverse proxy, backups, the admin API, metrics, scaling).

## Local development

```sh
pnpm install
pnpm setup          # first-run bootstrap: generates your encryption key + admin token,
                    #   writes .env, and seeds helpuit.config.yaml (re-runnable; --yes for CI)
pnpm start          # run the server from source (tsx); prints the console URL + token
pnpm test           # unit + integration suite
pnpm test:browser   # real-Chromium reproduction tests (Playwright)
pnpm test:smoke     # boots the real server process and probes health
pnpm typecheck
```

New to the project? Run `pnpm setup` first — it gets you a strong encryption key, a stable
admin token, and a valid `.env` + `helpuit.config.yaml`, so `pnpm start` boots straight into a
log-in-able console. You then connect GitHub/Chatwoot/the LLM/identity from the Setup checklist.

## Configuration

UI-first: connect and configure everything in the console (Connections, Configuration,
Secrets, Manifest). Structural settings apply live or via a one-click restart; secrets are
encrypted at rest and never shown back. Files are optional/advanced:

- **`.env`** — secrets + runtime, if you prefer env over the console. Template: [`.env.example`](.env.example).
- **`helpuit.config.yaml`** — a baseline the console layers over. Template: [`helpuit.config.example.yaml`](helpuit.config.example.yaml).

Precedence: console (DB config + encrypted vault) overrides the file/env baseline. With
`DATABASE_URL` unset, Helpuit uses a local SQLite file so your data persists with zero DB setup.

## Architecture

A pnpm monorepo, one package per capability, composed by `@helpuit/composition` into the
orchestrator and served by `apps/server`. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

- **Stack:** TypeScript/Node (ESM), Fastify, Zod, Drizzle ORM (libsql/SQLite now, Postgres
  dialect planned), Playwright, Vitest.
- **Model-agnostic LLM gateway:** Claude / OpenAI / Bedrock / DeepSeek / any
  OpenAI-compatible or local model, selectable per pipeline tier.

## Licensing

Helpuit is licensed under **[PolyForm Noncommercial 1.0.0](LICENSE)**:

- ✅ **Free** for personal projects, research, education, and other **noncommercial** use —
  including reading, running, and modifying the source.
- ❌ **Commercial/business use is not permitted** under this license. To use Helpuit in or
  for a business, you need a **commercial license** — see
  [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Contributions are welcome under a CLA so the project can continue to be dual-licensed —
see [CONTRIBUTING.md](CONTRIBUTING.md).
