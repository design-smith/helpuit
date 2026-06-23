# Helpuit

**Source-available, self-hosted autonomous AI support engineer.** A customer message arrives in
Chatwoot; Helpuit answers from your docs and source code, reads the customer's real account state,
reproduces suspected bugs in a sandbox, files engineering-grade GitHub issues, and keeps the ticket
updated through resolution — escalating only as far as it needs to, with a human gate where it matters.

> Standalone service that integrates with **stock Chatwoot** (Agent Bot + webhooks) — it does **not**
> fork Chatwoot. Single-tenant: one company per deployment.
>
> **License:** source-available, not open source. Free for personal/noncommercial use under
> [PolyForm Noncommercial 1.0.0](LICENSE); commercial use needs a [commercial license](COMMERCIAL-LICENSE.md).

It boots with nothing configured and gets smarter as you connect more — see the
[capability ladder](docs/capability-ladder.md). The steps below take a fresh clone from zero to a
working agent.

---

## Requirements

- **Node ≥ 20** and **[pnpm](https://pnpm.io/installation)** (`npm install -g pnpm`)
- A **Chatwoot** instance (self-hosted or Cloud), a **GitHub** repo, and an **LLM provider** key
  (Anthropic / OpenAI / Bedrock / DeepSeek / any OpenAI-compatible or local model)
- Nothing else for local use — `pnpm start --tunnel` (Step 5) brings up a public URL automatically
  (downloads `cloudflared` on first run, no account), so Chatwoot/GitHub can reach you with no tunnel to install

---

## Setup — step by step

### Step 1 — Get the code

```sh
git clone https://github.com/design-smith/helpuit.git
cd helpuit
```

### Step 2 — Install dependencies

```sh
pnpm install
```

### Step 3 — Run the first-run bootstrap

```sh
pnpm setup
```

This one-time wizard prepares everything the app needs to boot. It:

- generates a strong **`HELPUIT_ENCRYPTION_KEY`** (seals the secret vault) — and never overwrites an
  existing strong one, since rotating it would make stored secrets unreadable;
- generates a stable **`HELPUIT_ADMIN_TOKEN`** for logging into the console;
- asks for your **public URL**, **database** (press Enter for a local SQLite file), **`NODE_ENV`**, and **port**;
- writes your **`.env`** (backing up any previous one) and seeds a valid **`helpuit.config.yaml`**.

**Copy the admin token it prints at the end — you'll log in with it in Step 6.** Re-running `pnpm setup`
is safe and idempotent. For Docker/CI, use `pnpm setup --yes` (reads everything from the environment).

### Step 4 — Build the operator console

```sh
pnpm --filter @helpuit/web build
```

The server serves the built console from `apps/web/dist`. Rebuild after pulling UI changes. (For
hot-reload while developing the UI, see [Development](#development).)

### Step 5 — Start the server

**Locally**, start with the tunnel so Chatwoot and GitHub can reach you:

```sh
pnpm start --tunnel
```

This opens a Cloudflare quick tunnel (downloads `cloudflared` on first run — no account, no login), sets
it as your public URL automatically, and prints it. **Open the console at that printed URL.** Keep the
process running to keep the tunnel up.

> Plain `pnpm start` also works if you don't need inbound webhooks yet. When **deployed**, you don't use
> a tunnel at all — set `HELPUIT_PUBLIC_URL` to your real domain and run `pnpm start`. Same app, one knob.

### Step 6 — Log into the console

Open the URL from Step 5 (the **tunnel URL** if you used `--tunnel`, otherwise **http://localhost:3000**)
and sign in with the **admin token** from Step 3. You'll land on the **Setup checklist** — the home
screen that walks you through the remaining connectors, each with a one-click **Test**. The next steps
are done entirely here, no file editing.

### Step 7 — Connect GitHub (your codebase)

In the console → **Connections → GitHub**. This is what grounds answers in your code and files issues —
two ways to connect:

- **Personal access token (simplest, best for local):** paste a token, **Test connection**. No callback
  or public URL needed — reading code and filing issues are outbound API calls.
- **GitHub App:** a smoother multi-repo flow, but it needs a reachable **public URL** for its callback +
  webhook, so start with `pnpm start --tunnel` first. Note: a quick-tunnel URL changes each run, which
  breaks an App's baked-in URLs — for local, prefer the token.

### Step 8 — Connect Chatwoot

In **Connections → Chatwoot**: paste your Chatwoot URL + API token, click **Validate & prefill** to
pull your account/inbox, then **Auto-setup** to create the Agent Bot + webhook for you.

> If you started with `pnpm start --tunnel`, Helpuit automatically re-points this webhook to the current
> tunnel URL on every start — so a connected inbox keeps delivering even though the tunnel URL changes.

### Step 9 — Choose your LLM provider

In **Connections → LLM** (or Configuration → Models): pick a provider, set its API key, and **Test LLM**.
You can mix providers per pipeline tier (e.g. a cheap model for high-volume guidance, a stronger one
for reasoning).

### Step 10 — Set up identity verification

In **Configuration → Identity**: choose how a customer is verified before Helpuit reads their account —
**HMAC** (Chatwoot Identity Validation), **JWT**, or an **endpoint**. Helpuit never trusts a user id
typed in chat; only a verified token.

### Step 11 — Apply changes

When the **Restart required** banner appears, click **Restart now**. Your connections take effect.

### Step 12 — Verify it works

Send a test message through your Chatwoot inbox. Helpuit should reply with a **grounded** answer, and a
real bug should produce an **engineering-grade GitHub issue**. Watch it live on the console dashboard.

### Optional — go further up the ladder

- **Account investigation (L2):** add read-only **query routes** so Helpuit can read a customer's real
  state (never raw SQL; identity always from the verified token).
- **Dynamic reproduction (L3b):** enable Playwright and add sandbox account credentials so Helpuit drives
  your app in a real browser to confirm bugs.

See the [capability ladder](docs/capability-ladder.md) for the full picture.

---

## Minimum config

The bare job — a grounded answer plus a filed issue — needs only these (set them in the console, or as
env vars):

| Secret | Why |
| --- | --- |
| `CHATWOOT_API_TOKEN` | Read and reply to Chatwoot conversations. |
| `GITHUB_TOKEN` | Ground answers in your repo and file issues (or connect a GitHub App instead). |
| `ANTHROPIC_API_KEY` | Your LLM provider's key — powers the agent's reasoning (swap for your provider's key). |
| `IDENTITY_HMAC_SECRET` | Verify the customer before reading their account (or pick JWT/endpoint mode). |

Everything else is optional and adds capability.

---

## Configuration

You rarely edit files after `pnpm setup` — the console (Connections, Configuration, Secrets, Manifest)
is the primary surface. Structural settings apply live or via a one-click restart; secrets are encrypted
at rest and never shown back. Two files back it:

- **`.env`** — secrets + runtime (keys, tokens, `DATABASE_URL`, `NODE_ENV`, port). Written by `pnpm setup`;
  gitignored. Template: [`.env.example`](.env.example).
- **`helpuit.config.yaml`** — product/structural config (Chatwoot inbox, GitHub repo, LLM models,
  reproduction target, query routes, budgets, features). Template: [`helpuit.config.example.yaml`](helpuit.config.example.yaml).

**Precedence:** the console (DB config + encrypted vault) overrides the file/env baseline. With
`DATABASE_URL` unset, Helpuit uses a local SQLite file so your data persists with zero DB setup.
(Postgres is not supported — see [ADR 0001](docs/adr/0001-database-engine.md).)

---

## Development

```sh
pnpm setup                       # first-run bootstrap (Step 3)
pnpm start                       # run the server from source (tsx); auto-loads .env
pnpm start:tunnel                # same, but opens a Cloudflare tunnel + wires HELPUIT_PUBLIC_URL (= pnpm start --tunnel)
pnpm --filter @helpuit/web dev   # operator console with hot-reload on :5173 (proxies /admin → :3000)
pnpm test                        # full unit + integration suite (real collaborators, no mocks)
pnpm test:smoke                  # boots the real server process and probes /healthz, /readyz
pnpm test:browser                # real-Chromium reproduction tests (Playwright)
pnpm typecheck                   # root (Node) typecheck
```

This is a pnpm/TypeScript monorepo: `apps/server` (Fastify API + webhook intake + worker), `apps/web`
(React + Vite operator console), and `packages/*` (the support-engineer pipeline, config, crypto, db,
and integrations) composed by `@helpuit/composition`. Stack: TypeScript/Node (ESM), Fastify, Zod,
Drizzle ORM (libsql/SQLite), Playwright, Vitest. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Deploy

For a production deploy (Docker, TLS/reverse proxy, backups, the admin API, metrics, scaling), follow
**[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)**. In containers, run the bootstrap non-interactively with
`pnpm setup --yes` (or provide the env vars directly) so the same flow applies.

---

## License

Helpuit is **source-available, not open source**, under [PolyForm Noncommercial 1.0.0](LICENSE):

- ✅ **Free** for personal projects, research, education, and other **noncommercial** use — including
  reading, running, and modifying the source.
- ❌ **Commercial/business use requires a separate [commercial license](COMMERCIAL-LICENSE.md).**

Contributions are welcome under a CLA so the project can stay dual-licensed — see
[CONTRIBUTING.md](CONTRIBUTING.md).
