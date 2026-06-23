# PRD — Helpuit: "Fork → Connect → Working" (minimum-config onboarding)

> Status: ready-for-agent · Scope: collapse the path from `git clone` to a *working, grounded*
> autonomous support agent down to connecting three things in the console — and make configuration
> actually take effect. Single-tenant, self-hosted. Builds on the operator console (Phases 1–3).

> Tracker note: this repo has no external issue tracker (issues live in `issues/`, PRDs in
> `docs/prd/`). This PRD is the publishable artifact; the `ready-for-agent` status is recorded above
> per repo convention.

## Problem Statement

I forked Helpuit to self-host an AI support engineer for my product. I want to do the **minimum**
configuration to get it doing the bare job: answer a real customer's question grounded in my actual
product, and file an engineering-grade GitHub issue when it's a bug.

Instead, getting there takes ~16 manual steps spread across four docs and two hand-edited config
files — and, worse, **even after I configure everything correctly, the agent is hollow.** The shipped
server (`apps/server/src/main.ts`) builds the orchestrator with only `{ db }`, so:

- The `features:` I curate in config are parsed and then **thrown away** — static code investigation
  (L3a) and code-grounded answers never turn on.
- "Reads your docs" grounds on an **empty index** — there is no docs-ingestion path at all.
- The manifest **auto-draft from my repo** that the docs advertise is fully built but never wired.

On top of that: I can't even reach the console unless I hand-set `HELPUIT_ADMIN_TOKEN` (otherwise
`/admin/*` 404s with no hint); pasting an LLM key tells me to go restart in a terminal; my
integrations (Chatwoot/GitHub/identity) are only validated when a real customer message arrives —
so I discover misconfiguration hours later, silently. The net experience is: a lot of setup work,
and a generic chatbot at the end of it.

## Solution

A **connect-first onboarding** experience over a pipeline that actually runs:

- **Configuration takes effect.** Wire the dormant modules so curating features / connecting a repo /
  adding docs *turns capabilities on*. Auto-draft the feature manifest from the connected repo (or
  seed it from `config.features`), ingest docs, and wire reproduction behind its existing toggle.
- **You can always get in.** Auto-generate and print an admin token on first boot; never silently
  404 the console. Boot is never blocked by unset variables.
- **The console guides you.** The home screen is a readiness checklist until the agent is ready —
  "Connect GitHub · Connect Chatwoot · Pick an LLM" — each with live status and a link to fix it.
- **Connectors validate, auto-setup, and self-test.** Chatwoot auto-creates its Agent Bot + webhook;
  LLM/identity/GitHub each have a one-click Test. No more silent, deferred failures.
- **One-click apply.** A "Restart now" action applies secret/restart-class changes without a terminal.
- **One mental model + sane defaults.** UI-first config; files become optional/advanced; secrets
  grouped by feature and shown only when relevant.

After this, the bare job is: `docker compose up` → open the console (token printed) → connect GitHub,
Chatwoot, and an LLM in the checklist → click Apply. Grounded L1 answers and GitHub escalation work.
Account reads and docs are optional next rungs on a capability ladder; nothing is required to boot.

## User Stories

**First boot & access**
1. As a self-hoster, I want the server to boot with nothing configured, so that I can start it before I've gathered any secrets.
2. As a self-hoster, I want an admin token auto-generated and printed once at first boot when I haven't set one, so that I can reach the console without reading the docs.
3. As a self-hoster, I want the startup logs to summarize what is set, unset, and working, so that I know the server's state at a glance.
4. As a self-hoster, I want the admin console to never silently 404, so that I'm never locked out without explanation.
5. As a self-hoster, I want a clear path to rotate the admin token later, so that I can secure my deployment.

**Knowing what to do next (readiness)**
6. As a new operator, I want the console home to show a setup checklist until the agent is ready, so that I know exactly what to configure and in what order.
7. As an operator, I want each checklist item to show live status (done / blocked / optional), so that I can see progress.
8. As an operator, I want each unmet item to link directly to where I fix it, so that I don't hunt across pages.
9. As an operator, I want a single readiness signal ("ready to answer customers: yes/no") with the specific blockers, so that I can trust whether it's live.
10. As an operator, I want the home to flip from checklist to operational dashboard once the agent is ready, so that the UI matches my stage.
11. As an operator, I want optional capabilities (account reads, docs, reproduction) shown as a capability ladder, so that I understand what each connection unlocks.

**Connecting GitHub**
12. As an operator, I want to connect my GitHub repo via the App flow (already built), so that issue filing and code reading use scoped, short-lived tokens.
13. As an operator, I want a one-click "Test GitHub" check, so that I know the repo is reachable before a customer message arrives.
14. As an operator, I want connecting my repo to auto-draft a feature manifest from the codebase, so that I don't hand-author it.
15. As an operator, I want to review and edit the auto-drafted manifest in the console, so that I can correct the heuristics.

**Connecting Chatwoot**
16. As an operator, I want to enter my Chatwoot URL + token and click "Validate & auto-setup", so that I don't manually create the Agent Bot and webhook in Chatwoot's UI.
17. As an operator, I want Helpuit to verify the Chatwoot token and prefill my account and inbox, so that I don't copy IDs by hand.
18. As an operator, I want a "Test Chatwoot" check, so that I can confirm replies will post before going live.
19. As an operator, I want a clear, documented way to pass the verified customer token into the Chatwoot conversation, so that account-aware support actually works.

**Choosing an LLM**
20. As an operator, I want to pick a provider and paste a key in the console, so that I don't edit env files.
21. As an operator, I want a "Test LLM" check that makes a real call, so that I catch a bad/blank key immediately.
22. As an operator, I want to run a local/OpenAI-compatible model, so that I can stay fully offline if I choose.

**The agent actually working (grounding)**
23. As an operator, I want L1 answers grounded in my product docs, so that customers get accurate, specific help.
24. As an operator, I want to ingest docs (from repo paths/globs, and by pasting/uploading), so that grounding has real content.
25. As an operator, I want L1 answers grounded in my real source code (via the manifest), so that answers reflect how the product behaves.
26. As an operator, I want suspected bugs to escalate and file an engineering-grade GitHub issue, so that engineering can act.
27. As an operator, I want editing my features/docs to visibly change the agent's behavior, so that my configuration is never dead.
28. As an operator, I want dynamic reproduction to run when I enable it, so that confirmed bugs carry evidence.
29. As a customer, I want answers that cite the real feature/code behind my complaint, so that I trust the support.

**Account data (L2)**
30. As an operator, I want a scaffold/preset for read-only account query routes (headline: Supabase), so that I don't design the integration from scratch.
31. As an operator, I want a Supabase JWT identity preset (just the JWKS URL), so that customer auth "just works".
32. As an operator, I want a one-click "Test identity" check, so that I confirm token verification before launch.
33. As an operator, I want account reads to be scoped to the verified user only, so that cross-customer access is impossible (preserve existing invariant).

**Applying changes**
34. As an operator, I want a "Restart now" button in the restart-required banner, so that I apply secret changes without a terminal.
35. As an operator, I want the banner to list exactly which pending changes need a restart, so that I know what's about to apply.
36. As an operator, I want structural changes that can apply live to do so without a restart, so that I'm not restarting unnecessarily.

**One config mental model**
37. As an operator, I want to configure the bare job entirely in the UI, so that I never edit a file.
38. As an operator, I want one obvious place per setting, so that "where do I set X?" has a single answer.
39. As an operator, I want secrets grouped by the feature that uses them with "used by" context, so that I'm not overwhelmed by a flat list.
40. As an operator, I want feature-gated secrets (sandbox, query routes) hidden until I enable that feature, so that I only see what's relevant.
41. As an operator, I want a sensible default database (a SQLite file) and a clear message if I paste an unsupported URL, so that I don't hit a cryptic footgun.
42. As an operator, I want to import my existing `.env`/`yaml` once into the UI store, so that forking from files is still easy.

**Docs & trust**
43. As a new user, I want the README quick-start to actually end at a working, grounded agent, so that "quick start" isn't misleading.
44. As a new user, I want a "minimum config" section listing only what's truly required, so that I'm not guessing.
45. As a self-hoster, I want my existing deployment to keep working unchanged if I don't connect anything new, so that the upgrade is safe.

## Implementation Decisions

**Guiding principle:** wire and reuse the dormant deep modules before building new ones. The
orchestrator already accepts `{ docs, manifest }` and the escalation pipeline already accepts a
`ReproductionRunner` — most of this is connection, not new machinery.

**New / modified deep modules (small interface, deep implementation, testable in isolation):**

- **ManifestProvisioner** (composition) — `provision(): Promise<FeatureManifest | undefined>`. Loads
  a confirmed manifest from `DrizzleManifestStore`; if none, seeds from `config.features` when present,
  else auto-drafts via the existing `HeuristicManifestBuilder` over a `GitHubRepoSource`; persists the
  result. Wired into `main.ts` and passed to `buildOrchestrator`. Turns on L3a + L1 code-grounding.
- **DocsIngestor** (new) — `ingest(): Promise<Doc[]>`. Pulls markdown from configured repo paths/globs
  via `GitHubRepoSource` and accepts pasted/uploaded text; output feeds `InMemoryDocsIndex` (interface
  unchanged, so an embeddings-backed index can replace it later). Wired into `main.ts` `{ docs }`.
- **Reproduction wiring** — construct `DynamicReproducer` (+ sandbox pool) and adapt it to the
  pipeline's `ReproductionRunner`, passed to `EscalationPipeline` only when `policy.playwrightEnabled`.
- **ReadinessService** (new deep module) — `readiness(): Promise<{ ready, blockers[], warnings[] }>`.
  Composes the supervisor's existing `missingSecrets` + `structuralIssues` with connector health.
  Exposed at `GET /admin/readiness`.
- **ChatwootProvisioner** (new, mirrors the GitHub connect service) — `validate()` / `autoSetup()`:
  verify the token via Chatwoot REST, create the Agent Bot + webhook, prefill account/inbox.
- **ConnectorTester** (new) — `test(target)` for github / chatwoot / llm / identity → `{ ok, detail }`.
  Reuses existing clients (`HttpChatwootClient`, the model router, identity verifiers + JWKS).
- **AdminTokenBootstrap** (main.ts startup) — generate + persist (vault) + print once when unset.
- **Restart action** — `POST /admin/config/restart` triggers a graceful process exit for a
  supervisor (`restart: unless-stopped` / systemd) to restart; surfaced from the banner.
- **Identity-in-console** — move identity config (mode + JWKS/secret/endpoint) into the config-store +
  vault so it's editable and testable in the UI (currently env/yaml only). Includes a Supabase preset.

**Architectural decisions:**
- Reuse over rebuild: `HeuristicManifestBuilder`, `GitHubRepoSource`, `DrizzleManifestStore`,
  `DynamicReproducer`, the supervisor's `effective()` readiness data, `GitHubAppAuth`.
- UI-first config is the source of truth (DB config-store + encrypted vault); files become an
  import-once/advanced path. Document precedence in one place.
- Capability ladder, not all-or-nothing: each connection independently raises capability; missing
  capabilities degrade gracefully (existing orchestrator behavior).
- Default `DATABASE_URL` to a SQLite file; keep the explicit, friendly rejection of `postgres://`
  until the Postgres track lands (out of scope here).
- Preserve the security invariants: verified-identity-only account reads, column allowlists, redaction
  gate, secrets never returned in plaintext.

**API contracts (additions):** `GET /admin/readiness`; Chatwoot `validate`/`auto-setup` +
`POST .../test` per connector; `POST /admin/config/restart`; identity config + test endpoints.

## Testing Decisions

A good test exercises observable behavior through public interfaces (real collaborators, not mocks of
internals) and survives refactors — matching this repo's established style.

**Modules to test:**
- **ManifestProvisioner** — seeds from `config.features`; auto-drafts from a fake `RepoSource`;
  persists/loads; the orchestrator receives a manifest (L3a/code-grounding turn on).
- **DocsIngestor** — ingests from a fake repo source + pasted text; an L1 answer becomes grounded.
- **ReadinessService** — reflects missing secrets/structural issues and connector health into
  blockers/warnings; `ready` flips correctly.
- **ChatwootProvisioner** — against a fake Chatwoot REST server (node:http stub): token validation,
  bot + webhook creation, inbox/account prefill; failure surfaces clearly.
- **ConnectorTester** — green/red for each target with injected fakes (no real network).
- **AdminTokenBootstrap** — generates + persists + would-print on empty env; reuses an existing token.
- **Restart action** — route triggers a clean, single exit signal (no real process kill in tests).
- **Reproduction wiring** — pipeline invokes the runner only when the toggle is on.

**Prior art to follow:** `packages/github/src/github.test.ts` and `composition/src/github-connect.test.ts`
(fake-fetch / node:http stub servers), `apps/server/src/{admin-api,config-api,ops-api}.test.ts`
(`buildServer` + real `fetch`/inject), `packages/runtime-config/src/supervisor.test.ts` (real DB +
holder), `packages/db/src/*.test.ts` (`createDb(':memory:')`).

## Out of Scope

- Multi-tenant operation.
- A Helpuit-native customer chat widget (Chatwoot remains the customer-facing front end).
- Postgres/Supabase for Helpuit's **own** persistence (separate track; SQLite stays the default).
- **Hosting** the customer's account-data endpoints — we ship a scaffold/preset; the operator hosts it.
- Embeddings-backed docs retrieval (the `DocsIndex` interface allows it later; v1 uses the existing
  token-overlap index).
- Full live hot-swap of every config section (the hybrid live/restart model from the console phase
  stands; this PRD only adds a one-click restart, not new live-apply coverage beyond what's safe).

## Further Notes

- This is the natural completion of the operator console (Phases 1–3): that work made everything
  *manageable in the UI*; this work makes the bare job *achievable in the UI with effect*.
- The single highest-leverage item is Epic 0 (wiring the pipeline) — without it, every other
  improvement still lands the user on a generic chatbot. Sequence: P0 (Epic 0 + admin bootstrap) →
  P1 (readiness/checklist + connectors + one-click restart) → P2 (config collapse + Supabase/L2 +
  token hand-off + docs).
- The live GitHub App click-through and the Chatwoot auto-setup both require a public `HELPUIT_PUBLIC_URL`
  and a reachable Chatwoot; fully-local operation needs local Chatwoot + a local model.
- Regression guard: default `auth: 'pat'` / unconnected paths must remain unchanged, the app must
  still boot with everything unset, and the existing test suite must stay green.
