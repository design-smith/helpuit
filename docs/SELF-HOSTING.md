# Self-hosting Helpuit

Helpuit is **single-tenant**: one deployment per company. It runs as a single container (the
async worker runs in-process). State lives in a SQLite database on a persistent volume.

> **Licensing:** self-hosting for **personal/noncommercial** use is free under
> [PolyForm Noncommercial 1.0.0](../LICENSE). **Business use needs a commercial license** —
> see [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md).

## 1. Prerequisites

- Docker + Docker Compose (or Node 24 + pnpm for a bare-metal run).
- A **Chatwoot** instance you can add an Agent Bot + webhook to.
- A **GitHub** repo (issues + contents access) and a token.
- An **LLM provider** key (Anthropic / OpenAI / Bedrock / DeepSeek) or a local
  OpenAI-compatible endpoint.

## 2. Configure

```sh
cp .env.example .env                                 # secrets + runtime — every var is documented inline
cp helpuit.config.example.yaml helpuit.config.yaml   # structure: Chatwoot/GitHub/identity/queryRoutes/features/models/policy
```

Key things to set:

- **Secrets** in `.env`: `CHATWOOT_API_TOKEN`, `GITHUB_TOKEN`, the identity secret for your
  chosen mode, your LLM provider key(s), and — recommended — `HELPUIT_ENCRYPTION_KEY`
  (`openssl rand -base64 48`) and `HELPUIT_ADMIN_TOKEN` (`openssl rand -hex 32`).
- **Structure** in `helpuit.config.yaml`: your Chatwoot account/inbox, GitHub owner/repo and
  production branch, the identity mode, your read-only query routes, your feature manifest,
  and the model per tier.

Helpuit refuses to start with an invalid config and reports **every** problem at once.

## 3. Run

```sh
docker compose up -d
docker compose logs -f helpuit
curl localhost:3000/healthz     # {"status":"ok"}
curl localhost:3000/readyz      # 200 when the DB is reachable
```

The compose file mounts `helpuit.config.yaml` read-only, loads `.env`, and persists the
database on the `helpuit-data` volume (`DATABASE_URL=file:/data/helpuit.db`).

**Bare metal** (no Docker): `pnpm install && pnpm start` with the same env + a
`helpuit.config.yaml` in the working directory (or set `HELPUIT_CONFIG_PATH`).

## 4. Wire up Chatwoot + GitHub

- **Chatwoot:** add an Agent Bot, point its webhook at `https://<your-host>/webhooks/chatwoot`.
- **GitHub:** add a webhook to your repo → `https://<your-host>/webhooks/github`, content type
  `application/json`, secret = `GITHUB_WEBHOOK_SECRET`, events: Issues (+ Pull requests).
  This drives lifecycle sync (issue closed → customer told).

## 5. TLS / reverse proxy

Helpuit serves plain HTTP on `PORT` (default 3000). **Terminate TLS in front of it** with a
reverse proxy (Caddy, nginx, Traefik) — Chatwoot and GitHub webhooks require HTTPS. Example
(Caddy):

```
helpuit.example.com {
    reverse_proxy localhost:3000
}
```

Expose only `/webhooks/*` publicly; keep `/admin/*` and `/metrics` restricted to your
network or behind proxy auth (the admin API additionally requires `HELPUIT_ADMIN_TOKEN`).

## 6. Operate

**Dashboard / takeover** (requires `HELPUIT_ADMIN_TOKEN`):

```sh
curl -H "authorization: Bearer $TOKEN" localhost:3000/admin/overview
curl -X POST -H "authorization: Bearer $TOKEN" localhost:3000/admin/conversations/<id>/pause
curl -X POST -H "authorization: Bearer $TOKEN" localhost:3000/admin/conversations/<id>/resume
```

Pausing makes Helpuit stay silent on that conversation so you can handle it by hand.

**Metrics:** scrape `GET /metrics` (Prometheus) — outcomes, webhooks, LLM tokens/latency, plus
process metrics in production.

**Alerts:** set `HELPUIT_ALERT_WEBHOOK_URL` to a Slack-compatible webhook to get budget /
repro-failure / escalation-spike alerts (else they go to the logs). Thresholds are the
`alerts` block in `helpuit.config.yaml`.

**Budget:** `HELPUIT_BUDGET_PER_DAY` / `_PER_MONTH` cap LLM spend; when a cap trips, Helpuit
stops and hands the conversation to you.

**Retention:** `HELPUIT_RETENTION_DAYS` (default 90; `0` = keep forever) purges old
investigations and their evidence/audit/etc. on startup and daily.

## 7. Backups & upgrades

- **Backup** the `helpuit-data` volume (the SQLite file). Evidence content is encrypted with
  `HELPUIT_ENCRYPTION_KEY` — **keep that key stable and backed up**, or sealed data becomes
  unreadable.
- **Upgrade:** pull the new image, `docker compose up -d`. Migrations are idempotent and run
  at startup.

## 8. Scaling notes

Single-tenant scale is one process. The job queue's claim is atomic (conditional UPDATE), so
multiple worker processes against one database are already safe if you later split the worker
out — no queue changes required. For higher volume, the planned Postgres dialect replaces the
SQLite file.
