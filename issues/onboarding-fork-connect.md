# Issues — "Fork → Connect → Working" onboarding

> Status: ready-for-agent · Source PRD: [docs/prd/fork-connect-working.md](../docs/prd/fork-connect-working.md)
> Tracker note: no external tracker configured; issues live here (per repo convention, like `wave-*.md`).
> Each issue below is an independently-grabbable AFK vertical slice with a stable id (FCW-NN).
> All slices are **AFK**.

## Index

**P0 — config takes effect + you can always get in**
- FCW-01 Admin-token auto-bootstrap
- FCW-02 Manifest provisioner: seed from `config.features` → orchestrator
- FCW-03 Auto-draft manifest from the connected repo
- FCW-04 Docs ingestion (paste/upload) → L1 grounding
- FCW-05 Docs ingestion from repo paths/globs
- FCW-06 Reproduction runner wired behind the `playwrightEnabled` toggle

**P1 — guided setup, real connectors, one-click apply**
- FCW-07 Readiness model + `GET /admin/readiness`
- FCW-08 Setup-checklist home screen
- FCW-09 LLM connector + Test
- FCW-10 Identity config in the console
- FCW-11 Identity Test + Supabase JWT preset
- FCW-12 Chatwoot validate + prefill (token check)
- FCW-13 Chatwoot auto-setup (Agent Bot + webhook)
- FCW-14 GitHub "Test connection" check
- FCW-15 One-click restart

**P2 — reduce surface area + long tail**
- FCW-16 SQLite default + friendly DATABASE_URL message
- FCW-17 Secrets grouped + conditional + "used by"
- FCW-18 Manifest review/edit UI
- FCW-19 Query-route Supabase Edge Function scaffold
- FCW-20 Customer-token hand-off helper for Chatwoot
- FCW-21 Docs: quick-start to a working agent + minimum-config + capability ladder

---

## FCW-01 · Admin-token auto-bootstrap  ✅ DONE

**What to build.** On boot, if `HELPUIT_ADMIN_TOKEN` is unset, generate a token, persist it (encrypted vault), and print it once to stdout in a clear banner. The admin surface must never silently 404 from a missing token — the console is always reachable.

**Acceptance criteria.**
- [x] Fresh boot with no admin token set → a token is generated, persisted, and printed once. _(`resolveAdminToken`; real-process smoke verifies the printed banner.)_
- [x] Logging in with the printed token works; the printed value is stable across restarts. _(smoke: printed token → `/admin/login` 200 + cookie; unit: reuse-from-vault across resolves.)_
- [x] A pre-set `HELPUIT_ADMIN_TOKEN` is honored unchanged (no regeneration). _(unit: env precedence, vault untouched.)_
- [x] Startup logs include a concise "set / unset / working" summary. _(missing-secrets warning + admin-console-ready line in `main.ts`.)_
- [x] Test: boot with empty env → token persisted + auth works; boot with token set → reused. _(3 unit tests with a real `:memory:` DB + real `SecretBox` + real crypto; 1 real-process smoke test. No mocks.)_

**Implementation:** `resolveAdminToken` (deep module, `@helpuit/composition`) — env wins → vault reuse → generate + persist; `main.ts` always registers the admin console with the resolved token and prints a one-time banner on generation.

**Blocked by.** None — can start immediately.

---

## FCW-02 · Manifest provisioner: seed from `config.features` → orchestrator  ✅ DONE

**What to build.** A `ManifestProvisioner` that loads a confirmed manifest from `DrizzleManifestStore`, and when none exists seeds one from `config.features` (with the production branch as `ref`), persists it, and is passed as `manifest` into `buildOrchestrator` from `main.ts`. This turns on L3a static investigation and L1 code-grounding when features are configured — closing the "config has no effect" gap.

**Acceptance criteria.**
- [x] With `features` configured, the orchestrator receives a manifest (code-grounding + static investigation become reachable). _(`main.ts` provisions + passes `manifest` to `buildOrchestrator`; `compose` wires `StaticCodeInvestigator` + `ManifestCodeContextProvider` when a manifest is present — covered by `compose.test.ts`.)_
- [x] With no features and no stored manifest, behavior is unchanged (degrades gracefully). _(unit cycle 3: returns `undefined`, nothing persisted.)_
- [x] The provisioned manifest is persisted and reused on the next boot. _(unit cycle 1 persists; cycle 2 reuses the confirmed manifest instead of re-seeding.)_
- [x] Test: provisioner seeds from config features and the orchestrator is built with a manifest (real `:memory:` DB). _(3 unit tests with a real `DrizzleManifestStore`; smoke test boots the real process with a feature configured → manifest active, no crash. No mocks.)_

**Implementation:** `ManifestProvisioner` (deep module, `@helpuit/composition`) — confirmed-store wins → seed from `config.features` → else degrade; wired in `main.ts` ahead of `buildOrch` so the supervisor's rebuilds keep the manifest. Added `@helpuit/feature-manifest` to composition deps.

**Blocked by.** None — can start immediately.

---

## FCW-03 · Auto-draft manifest from the connected repo  ✅ DONE

**What to build.** When no manifest/features exist, draft one from the connected repo using the existing `HeuristicManifestBuilder` over a `GitHubRepoSource`, persist it, and surface it for review. Reuse the dormant builder; do not rebuild heuristics.

**Acceptance criteria.**
- [x] With a repo connected and no manifest/features, a manifest is auto-drafted from the repo file listing and persisted. _(unit: a real `GitHubRepoSource` over a real `node:http` git-tree server → `HeuristicManifestBuilder` drafts features → `DrizzleManifestStore` round-trips them.)_
- [x] The drafted manifest flows to the orchestrator (same path as FCW-02). _(`provisionManifest` factory → `main.ts` → `buildOrch`; precedence: confirmed store → config.features → auto-draft.)_
- [x] No repo → no crash. _(unit: real `GitHubRepoSource` at a closed port → real failed fetch → degrades to `undefined`, nothing persisted; smoke: real process boots with no features + unreachable GitHub → auto-draft degrades, healthz/readyz green.)_

**Implementation:** extended `ManifestProvisioner` with an optional `builder` (try/catch degrade); added the `provisionManifest` factory; extracted `githubOptionsFromConfig` (shared PAT/App auth, now used by `compose` too). **No mocks** — real `GitHubRepoSource` + real HTTP throughout (the acceptance note's "fake RepoSource" was satisfied with a real source over a stub server).

**Blocked by.** FCW-02.

---

## FCW-04 · Docs ingestion (paste/upload) → L1 grounding  ✅ DONE

**What to build.** A `DocsIngestor` path plus an admin endpoint to add docs by pasting/uploading text; ingested docs feed `InMemoryDocsIndex` and are passed as `docs` into `buildOrchestrator`. This gives L1 real grounding content (today the index is empty).

**Acceptance criteria.**
- [x] An operator can add a doc via the admin API; it is ingested into the index. _(`POST /admin/docs` → `DocsService.add` persists + ingests into the live index; real-HTTP test asserts the SAME index L1 reads from now retrieves it; real-process smoke pastes a doc and lists it.)_
- [x] An L1 answer grounds on the added doc (sources reflect it). _(unit: a real `GuidanceAgent` over `DocsService.index` returns the added doc's id in `sources`; integration: `buildOrchestrator` given the shared index grounds L1 — the doc text reaches the real guidance prompt over real HTTP.)_
- [x] No docs → unchanged behavior (empty index, no crash). _(unit: empty `DocsService` → agent grounds nothing; boot is docs-empty by default; existing `docs?` path of `buildOrchestrator` preserved — all prior compose tests green.)_
- [x] Test: ingest a doc → guidance answer cites it as a source. _(real `:memory:` DB + real `InMemoryDocsIndex` + real `GuidanceAgent`; only the external LLM uses the repo's documented test seam. No mocks of our code.)_

**Implementation:** `DrizzleDocsRepository` (`helpuit_docs` table) persists pasted docs; `DocsService` owns the repo + one LIVE `InMemoryDocsIndex` — `create(db)` warms it from the store at boot (survives restart), `add` persists **and** ingests so a pasted doc grounds immediately with no restart. `buildOrchestrator` gained an optional shared `docsIndex` (preserves `docs?`) so the live index survives config rebuilds. `POST/GET/DELETE /admin/docs` wired through the AdminApi; `main.ts` shares one `DocsService` between the orchestrator and the admin console.

**Blocked by.** None — can start immediately.

---

## FCW-05 · Docs ingestion from repo paths/globs  ✅ DONE

**What to build.** Extend `DocsIngestor` to pull markdown from configured repo paths/globs via `GitHubRepoSource`, so docs grounding can be sourced directly from the connected repo.

**Acceptance criteria.**
- [x] Configured doc paths/globs are fetched from the repo and ingested. _(`RepoDocsLoader`: lists files at the production ref via `GitHubRepoSource`, matches `config.docs.repoPaths` globs (`*`/`**`/`?`), fetches content via `GitHubCodeRetriever`. Unit asserts exact-path + recursive-glob selection, non-markdown excluded, content present.)_
- [x] An L1 answer grounds on repo-sourced docs. _(unit: `provisionDocs` → `DocsService` whose index a real `GuidanceAgent` grounds on — the repo doc's path appears in `sources`.)_
- [x] Test: a fake repo source returns markdown files → they appear as grounding sources. _(satisfied with a **real** `GitHubRepoSource` + `GitHubCodeRetriever` over a real `node:http` git-tree/contents server — no mocks; degrade covered by a real failed fetch to a closed port.)_

**Implementation:** added a non-secret `docs.repoPaths` config section; `RepoDocsLoader` (deep module — glob match + content fetch → `Doc[]`); `DocsService.ingestEphemeral` (ingest into the live index without persisting — repo is source of truth, re-derived each boot); `provisionDocs(config, {db})` factory wires store-backed docs (FCW-04) + repo docs into one live index and is boot-safe (unreachable repo → store-only). `main.ts` now calls `provisionDocs`. Real-process smoke boots with `repoPaths` set + unreachable GitHub → fetch attempted → degrades, healthz/readyz green.

**Blocked by.** FCW-04.

---

## FCW-06 · Reproduction runner wired behind the `playwrightEnabled` toggle  ✅ DONE

**What to build.** Construct a `DynamicReproducer` (+ sandbox pool) and adapt it to the escalation pipeline's `ReproductionRunner`, passed to `EscalationPipeline` only when `policy.playwrightEnabled` is on. A suspected bug then runs reproduction and persists evidence.

**Acceptance criteria.**
- [x] With the toggle on (and sandbox creds present), a `new_bug` escalation invokes reproduction; evidence is persisted to the investigation. _(unit: `buildReproductionRunner` → real `DynamicReproducer` (real `SandboxPool` + `FakeContainerRunner` + an in-test `BrowserDriver`) reproduces and persists an encrypted `reproduction` evidence artifact to the investigation; a second test drives it through a real `EscalationPipeline` with the investigation id threaded.)_
- [x] With the toggle off (default), the pipeline behaves exactly as today (no reproduction). _(unit: `buildReproductionRunner` returns `undefined` when `playwrightEnabled` is false, when there are no sandbox creds, or when no browser driver is available → `EscalationPipeline` runs with no reproduction, exactly as before; real-process smoke boots with `playwrightEnabled: false`.)_
- [x] Test: a fake reproducer is invoked only when enabled; evidence recorded. _(satisfied with a **real** `DynamicReproducer` over real sandbox/container collaborators + a real in-test `BrowserDriver` — the documented browser seam, not a mock; irreversible features (e.g. "refund payment") are gated out via `canReproduce`.)_

**Implementation:** `ReproductionRunnerAdapter` + `buildReproductionRunner(config, {db, browserDriver, containers?})` (composition) — gates on `playwrightEnabled` + sandbox creds + driver, builds a baseline plan, runs `DynamicReproducer`, and persists evidence via `DrizzleEvidenceArtifacts` (best-effort: a browser/container failure degrades to `reproduced:false`, never breaking the escalation). Threaded `investigationId` through `EscalationPort` → `EscalationRequest` → `ReproductionRunner` so evidence ties to the investigation. `compose` builds the runner into `EscalationPipeline`; `main.ts` constructs the real `PlaywrightBrowserDriver` behind the toggle+creds via a guarded lazy import (degrades if Playwright/Chromium is unavailable — never blocks boot). Added `@helpuit/reproduction`+`@helpuit/sandbox` (composition) and `@helpuit/playwright`+`@helpuit/reproduction` (server) deps.

**Blocked by.** None — can start immediately.

> Note: the issue says "off (default)" while the schema default for `playwrightEnabled` is `true`; the effective default is still no-reproduction because it also requires sandbox credentials **and** an available browser driver. The schema default was left unchanged (out of scope) to avoid a config regression.

---

## FCW-07 · Readiness model + `GET /admin/readiness`  ✅ DONE

**What to build.** A `ReadinessService` that composes the supervisor's `missingSecrets` + `structuralIssues` with connector health into `{ ready, blockers[], warnings[] }`, exposed at `GET /admin/readiness`.

**Acceptance criteria.**
- [x] The endpoint returns blockers (required-but-unset) and warnings (optional) and a single `ready` boolean. _(`ReadinessService.evaluate` over the supervisor's `effective()`: required-unset secrets + structural gaps → blockers; optional-unset → warnings. `GET /admin/readiness` returns `{ ready, blockers[], warnings[] }`, gated by the admin token.)_
- [x] `ready` is true only when all blockers clear. _(unit cycle 2: not ready → set the missing secret in the real vault → ready, blockers empty.)_
- [x] Test: with missing required secrets → not ready + blockers listed; once set → ready. _(3 unit tests over a real `ConfigSupervisor` (real DB/vault/stores) + 1 real-server route test + real-process smoke. No mocks.)_

**Implementation:** `ReadinessService` (composition) is a pure transform of the supervisor's `EffectiveView` — `blockers` = required-but-unset secrets + non-secret `structuralIssues` (e.g. "identity.jwksUrl is required …"); `warnings` = optional-unset secrets; `ready` = no blockers. Surfaced as `AdminApi.readiness` (present only when a supervisor is wired) and `GET /admin/readiness`. No `main.ts` change needed — the admin API already receives the supervisor. This is the data behind FCW-08's Setup checklist.

**Blocked by.** None — can start immediately.

---

## FCW-08 · Setup-checklist home screen  ✅ DONE

**What to build.** Make the console home a readiness-driven setup checklist until the agent is ready (Connect GitHub · Connect Chatwoot · Pick LLM · optional Account data · optional Docs), each item with live status and a link to its fix; flip to the operational dashboard once ready.

**Acceptance criteria.**
- [x] A fresh, unconfigured console shows the checklist with accurate per-item status. _(`buildSetupChecklist` maps `/admin/readiness` blockers → a rung per area: GitHub/Chatwoot/LLM/identity `todo` when blocked, a catch-all so no required blocker is lost, optional Account-data/Docs rungs.)_
- [x] Each item links to the page that fixes it. _(github/chatwoot → `/connections`, llm/identity → `/settings`, catch-all → `/secrets`; asserted in tests.)_
- [x] When `readiness.ready` is true, the home shows the operational dashboard instead. _(`selectHome` + `HomePage`: ready → `<DashboardPage/>`, else the checklist; graceful fallback to the dashboard if readiness can't be read.)_
- [x] Component test: checklist renders blockers from `/admin/readiness`; ready state swaps the view. _(5 tests over **real** `Readiness` values — no mocks — covering per-item status, link targets, no-blocker-lost, done-when-cleared, and the ready→dashboard swap.)_

**Implementation:** the real substance lives in a pure `checklist` module (`buildSetupChecklist` + `selectHome`) tested with real values; `SetupChecklist`/`HomePage` (`.tsx`) are thin presentation/glue over it + `useReadiness()`, verified by `tsc` and the production `vite build`. `App` index route now renders `HomePage` (`/dashboard` still routes directly to the dashboard).

> Note on testing: `apps/web` has no React-render harness (no RTL/jsdom) and the suite runs in the node env, so the "component test" was satisfied by testing the readiness→checklist mapping and view-swap decision as pure logic with real data (no mocks), with the JSX covered by typecheck + a clean SPA build. Adding RTL/jsdom would be its own infra slice.

**Blocked by.** FCW-07.

---

## FCW-09 · LLM connector + Test  ✅ DONE

**What to build.** A console connector to pick a provider and set its key, plus a "Test LLM" action that makes a real completion call through the model router and reports green/red. (Local/OpenAI-compatible supported.)

**Acceptance criteria.**
- [x] Operator picks a provider + sets a key in the UI; Test makes a real call and reports success/failure with detail. _(`ModelsCard` provider/model + Secrets for the key; a "Test LLM" button → `POST /admin/test/llm` → `testLlm` makes a real completion through `ModelRouter`; route test proves `ok:true` + token usage against a real OpenAI-compatible stub server.)_
- [x] A blank/invalid key fails the Test clearly (not silently at message time). _(unit + route test: unconfigured provider → `ok:false` with "No API key configured…" via the lenient router's `LazyMissingKeyModel` — no network, no crash.)_
- [x] Test: the connector test path returns ok/err for a fake provider. _(2 unit tests over a **real** `ModelRouter`+`OpenAICompatibleModel` against a real `node:http` server — no mocks — plus a real-server route test.)_

**Implementation:** `testLlm(models)` (composition) makes a real guidance-tier completion and returns `{ ok, provider, detail, usage }`, degrading missing keys to a clear `ok:false`. Added `ConfigController.resolveEffective()` (server-internal, **unmasked** fresh resolve — never serialized to clients) so the Test validates a key the operator **just set in the vault, before the restart that applies it**. Surfaced as `AdminApi.testLlm` + `POST /admin/test/llm` (token-gated, present only when a supervisor is wired). Web: `useTestLlm` + a "Test LLM" row in the Models card (green/red + detail).

**Blocked by.** None — can start immediately.

---

## FCW-10 · Identity config in the console  ✅ DONE

**What to build.** Move identity configuration (mode + JWKS/secret/endpoint fields) into the console (config-store + vault), restart-applied, instead of env/yaml-only.

**Acceptance criteria.**
- [x] Operator can set identity mode + its fields in the UI; values persist and apply on restart. _(`IdentityCard` in Connections: mode (hmac/jwt/endpoint) + user-id claim + conditional JWKS/verify URL → `applyStructural('identity')` (restart-class); the shared secret / verify token → `setSecret` (vault). "Saved — restart to apply".)_
- [x] Existing env/yaml identity config still works (precedence documented). _(unit: no console override → yaml/env identity used. Precedence: console config-store **overrides** yaml (`deepMerge`), vault secret **overrides** env — verified against the real supervisor.)_
- [x] Test: setting identity config in the store yields the expected effective config. _(unit: `applyStructural('identity', {mode:'jwt', jwksUrl})` → `resolveEffective().identity` is jwt + jwksUrl, restart flagged; a vaulted `IDENTITY_HMAC_SECRET` shows up in the effective config over env.)_

**Implementation:** the supervisor already classified `identity` as restart-class, so the backend path existed — locked it with 4 real acceptance tests over a real `ConfigSupervisor`. **Bug found + fixed via TDD:** an invalid restart-class section whose only defect is a *lenient* cross-field gap (e.g. `jwt` with no `jwksUrl`) was silently persisted + restart-flagged (it would fail at runtime after restart). `applyStructural` now rejects any apply that leaves a `${section}.*` structural issue — loud failure at setup, not silent at message time. UI: `IdentityCard` (Connections) over `applyStructural` + `useSetSecret`.

**Blocked by.** None — can start immediately.

---

## FCW-11 · Identity Test + Supabase JWT preset  ✅ DONE

**What to build.** A "Test identity" action (HMAC sample verify / JWKS reachability / endpoint ping) and a Supabase preset that fills JWT mode from just a project JWKS URL.

**Acceptance criteria.**
- [x] Test reports green/red per mode with detail. _(`testIdentity(identity)` → `{ ok, mode, detail }` for hmac/jwt/endpoint; surfaced via `POST /admin/test/identity` and a "Test identity" button in the Identity card.)_
- [x] The Supabase preset configures JWT mode against the Supabase JWKS URL. _(pure `supabaseJwksUrl(ref|url)` → `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`; the card's "Use Supabase preset" fills the JWKS URL in jwt mode — unit-tested.)_
- [x] Test: JWKS reachability + HMAC-sample verification paths return ok/err. _(8 composition unit tests: hmac real-crypto round-trip + tamper-reject (ok) / blank secret (err); jwt against a real `node:http` JWKS server (ok) / unreachable + unset (err); endpoint reachable (ok) / unset (err). Plus a real-server route test against a stub JWKS. **No mocks.**)_

**Implementation:** `testIdentity` (composition) — hmac signs+verifies a sample token with the real `HmacTokenVerifier` (and rejects a tampered one); jwt fetches the JWKS URL and confirms published keys; endpoint POSTs a probe and confirms reachability. Surfaced as `AdminApi.testIdentity` + `POST /admin/test/identity` over the unmasked `resolveEffective()` (so a just-set secret/URL is tested before restart). Web: `useTestIdentity` + Test button + Supabase preset (`supabaseJwksUrl`) in the Identity card.

**Blocked by.** FCW-10.

---

## FCW-12 · Chatwoot validate + prefill (token check)  ✅ DONE

**What to build.** A Chatwoot connector that takes base URL + API token, verifies the token via the Chatwoot REST API, and prefills account/inbox where available — replacing blind form entry.

**Acceptance criteria.**
- [x] Entering URL + token validates the token against Chatwoot and reports green/red. _(`validateChatwoot` calls the real `/api/v1/profile`; a non-2xx (401/403) → clear "token rejected", network error → "could not reach". UI "Validate & prefill" button shows green/red.)_
- [x] Account/inbox are prefilled from the API where available. _(account from `profile.accounts[0]`, inbox from `/api/v1/accounts/:id/inboxes` `payload[0]`; the route returns them and the card sets the Account/Inbox fields.)_
- [x] Test: against a fake Chatwoot REST server, valid/invalid tokens are distinguished and account/inbox prefilled. _(4 composition unit tests + 3 real-server route tests against a **real `node:http` Chatwoot-shaped server** — valid → prefill, wrong token → rejected, unreachable → err. No mocks.)_

**Implementation:** `validateChatwoot({baseUrl, token})` (composition) — stateless, takes the URL+token from the request so the operator validates **before** saving; `AdminApi.validateChatwoot` + `POST /admin/test/chatwoot` (token-gated). Web: `useValidateChatwoot` + a token field and "Validate & prefill" button in the Chatwoot card that fills Account/Inbox from the response.

**Blocked by.** None — can start immediately.

---

## FCW-13 · Chatwoot auto-setup (Agent Bot + webhook)  ✅ DONE

**What to build.** A "Validate & auto-setup" action that creates the Agent Bot and registers the webhook (pointed at `HELPUIT_PUBLIC_URL/webhooks/chatwoot`) via the Chatwoot API, removing the manual Chatwoot-UI steps. Idempotent (don't duplicate an existing bot/webhook).

**Acceptance criteria.**
- [x] Auto-setup creates an Agent Bot + webhook and reports the created identifiers. _(`autoSetupChatwoot` POSTs `/agent_bots` + `/webhooks` (pointed at `${publicUrl}/webhooks/chatwoot`) and returns `agentBotId`/`webhookId` + `created` flags.)_
- [x] Re-running is idempotent (reuses an existing bot/webhook). _(matches an existing bot by name and webhook by URL via GET-before-POST; unit + route test re-run → `created:{false,false}`, same ids, exactly one of each left in the real stub.)_
- [x] Requires `HELPUIT_PUBLIC_URL`; a clear message if it's unset. _(unset → `ok:false` with a "Set HELPUIT_PUBLIC_URL" message, nothing created; publicUrl injected server-side from `config.runtime.publicUrl`.)_
- [x] Test: against a fake Chatwoot API, bot + webhook are created; second run does not duplicate. _(3 composition unit tests + 2 real-server route tests against a **real, stateful `node:http` Chatwoot stub** that persists bots/webhooks. No mocks.)_

**Implementation:** `autoSetupChatwoot({baseUrl, token, accountId, publicUrl})` (composition) — idempotent create-or-reuse of the Agent Bot (by name) and webhook (by URL). `AdminApi.setupChatwoot` (publicUrl from config) + `POST /admin/setup/chatwoot`. Web: `useSetupChatwoot` + an "Auto-setup bot + webhook" button in the Chatwoot card (uses the validated token + prefilled account).

**Blocked by.** FCW-12.

---

## FCW-14 · GitHub "Test connection" check  ✅ DONE

**What to build.** A one-click test on the GitHub connection that verifies the repo is reachable with the current auth (PAT or App installation token) and reports green/red.

**Acceptance criteria.**
- [x] Test reports repo reachability + auth validity with detail. _(`testGitHub` does `GET /repos/{owner}/{repo}` → `ok` + repo full-name, or `ok:false` with the failing status/detail; surfaced via `POST /admin/test/github` + a "Test connection" button in the GitHub card.)_
- [x] Works for both PAT and App-installation auth. _(uses `githubRequest`/`GitHubOptions` — the same credential seam as the orchestrator; unit-tested for static-PAT and for a `getToken` closure (App installation token) that supplies the Bearer header.)_
- [x] Test: against a fake GitHub API, reachable/unreachable are distinguished. _(4 composition unit tests + 2 real-server route tests against a **real `node:http` GitHub stub** — 200 → reachable, 404 → not, blank owner/repo → err. No mocks.)_

**Implementation:** `testGitHub(options)` (composition) over `githubRequest`. `AdminApi.testGitHub` builds options from the fresh unmasked config (`githubOptionsFromConfig(resolveEffective())`) so a just-set token/App key is tested before restart; `POST /admin/test/github` (gated). Web: `useTestGitHub` + "Test connection" in the GitHub card (works in both token + App-connected states).

**Blocked by.** None — can start immediately.

---

## FCW-15 · One-click restart  ✅ DONE

**What to build.** A `POST /admin/config/restart` action that triggers a graceful process exit for a supervisor to restart (Docker `restart: unless-stopped` / systemd), surfaced from the restart-required banner with the specific pending reasons listed.

**Acceptance criteria.**
- [x] The banner lists the specific pending restart reasons. _(AppShell banner maps `restartStatus().reasons` (e.g. `secret:GITHUB_TOKEN`, `config:identity`) into a readable list next to the button.)_
- [x] "Restart now" triggers a clean shutdown that a supervisor restarts; the restart flag clears on next boot. _(`POST /admin/config/restart` → injected `onRestart` → in prod `SIGTERM`-to-self → the existing graceful shutdown (close server, drain worker, `exit 0`); `main.ts` already clears the restart flag at boot.)_
- [x] Test: the route triggers a single clean exit signal (no real process kill in tests). _(3 real-server route tests with an **injected recording `onRestart` closure** — returns `{status:'restarting', reasons}` incl. the pending `secret:GITHUB_TOKEN`; the signal fires exactly once, even when pressed twice; 401 without auth. No real process kill.)_

**Implementation:** `POST /admin/config/restart` (gated; registered only when `onRestart` is wired) fires a single deferred exit signal (so the 200 reaches the client first) and reports the pending reasons from `restartStatus()`. `main.ts` wires `onRestart` to `SIGTERM`-to-self (the existing handler does the graceful shutdown). Web: `useRestartNow` + the restart banner now lists the reasons and offers a "Restart now" button.

**Blocked by.** None — can start immediately.

---

## FCW-16 · SQLite default + friendly DATABASE_URL message  ✅ DONE

**What to build.** Default `DATABASE_URL` to a SQLite file when unset, and replace the raw `postgres://` rejection with a friendly, actionable message (until the Postgres track lands).

**Acceptance criteria.**
- [x] Unset `DATABASE_URL` boots on a sensible default SQLite file. _(`resolveDatabaseUrl(undefined)` → `file:./helpuit.sqlite` (data persists across restarts); `main.ts` now uses it instead of the ephemeral `:memory:` fallback. A real-file boot test opens an on-disk SQLite DB + runs migrations.)_
- [x] A `postgres://` URL yields a clear, actionable message (not a cryptic throw). _(message now names SQLite, tells you to leave `DATABASE_URL` unset for the default file or set a SQLite/libsql url, and notes Postgres is a later track.)_
- [x] Test: default path + postgres-message behavior. _(4 db-package tests: resolver default/passthrough, the postgres rejection message, and a **real on-disk SQLite file** boot+migrate (temp dir, no mocks).)_

**Implementation:** `resolveDatabaseUrl` + `DEFAULT_DATABASE_URL` in `@helpuit/db` (the lib `createDb` default stays `:memory:` for tests; the runtime default file lives in the resolver). `main.ts` calls `createDb(resolveDatabaseUrl(process.env.DATABASE_URL))`.

> Note: a stale `helpuit.sqlite` (dated Jun 19, a prior session) sits in the repo root — pre-existing local dev state, not created by this work and not referenced by any test. Left untouched.

**Blocked by.** None — can start immediately.

---

## FCW-17 · Secrets grouped + conditional + "used by"  ✅ DONE

**What to build.** Reorganize the Secrets page: group by the feature that uses each secret, show "used by" context, and hide feature-gated secrets (sandbox, query-routes) unless that feature is enabled.

**Acceptance criteria.**
- [x] Secrets are grouped by feature with a "used by" line each. _(`groupSecrets` → ordered groups: GitHub, Chatwoot, LLM provider, Customer identity, Reproduction sandboxes, Account data, Operations, Other — each with a one-line "used by"; the page renders a card per group.)_
- [x] Feature-gated secrets are hidden unless their feature is on. _(reproduction `SANDBOX_*` gated on `policy.playwrightEnabled`, account-data `QUERY_ROUTES_*` gated on `queryRoutes` configured — hidden groups don't render even if the catalog marks them required.)_
- [x] Required-but-unset secrets remain prominent. _(the page derives the amber "Required but unset" card from the **visible** (post-gating) secrets, so it never nags about creds for an off feature.)_
- [x] Component test: grouping + conditional visibility render correctly from the catalog. _(3 pure tests over real `SecretCatalogEntry` catalogs — grouping/used-by/Other + hide-when-off + show-when-on; the `.tsx` is verified by `tsc` + a clean SPA build, same approach as FCW-08 given no RTL harness.)_

**Implementation:** pure `groupSecrets(catalog, {reproductionEnabled, accountDataEnabled})` (web) drives the rebuilt `SecretsPage`, which reads the feature flags from the effective config (`policy.playwrightEnabled`, `queryRoutes`).

**Blocked by.** None — can start immediately.

---

## FCW-18 · Manifest review/edit UI  ✅ DONE

**What to build.** A console page to view and edit the (auto-drafted or seeded) feature manifest, so the operator can correct heuristics before it's used.

**Acceptance criteria.**
- [x] The current manifest is viewable; edits persist via the manifest store and take effect (restart or live per the apply model). _(`GET /admin/manifest` loads the confirmed manifest; `PUT` validates + persists via `DrizzleManifestStore` and **flags a restart** (`manifest`) so FCW-15's banner offers "Restart now"; the orchestrator picks it up via `provisionManifest` on next boot.)_
- [x] Invalid edits are rejected with a clear message. _(`validateManifest` returns per-feature errors → `422` + error list; the page also catches client-side JSON parse errors.)_
- [x] Component/API test: load → edit → persist round-trip. _(5 validator unit tests + 2 real-server route tests: empty → PUT valid → GET reflects (normalized) + restart flagged; PUT invalid → 422 + errors + nothing persisted. No mocks.)_

**Implementation:** pure `validateManifest(input)` (composition) normalizes + validates (ref + per-feature key/name required, unique keys, list fields default to `[]`). `AdminApi.getManifest`/`saveManifest` over `DrizzleManifestStore` + `DrizzleRestartFlag`; `GET`/`PUT /admin/manifest`. Web: a **Manifest** page (Settings nav) with a JSON editor → `useManifest`/`useSaveManifest`, showing validation errors and "restart to apply".

**Blocked by.** FCW-02.

---

## FCW-19 · Query-route Supabase Edge Function scaffold  ✅ DONE

**What to build.** Ship a copy-pasteable Supabase Edge Function template (plus docs) implementing read-only account query routes compatible with `HttpRouteExecutor` (verified-user-bound path/param, column allowlist, bearer auth), so L2 setup isn't from-scratch.

**Acceptance criteria.**
- [x] A documented Edge Function template returns rows in the shape `HttpRouteExecutor` expects. _(`supabaseQueryRouteScaffold` emits a Deno function ending in `Response.json(data)` (a row array); a **conformance test** runs a real endpoint built to the template's contract against the **real `HttpRouteExecutor`** and gets rows back.)_
- [x] The template enforces the verified user id (never caller-asserted) + column allowlist. _(function checks the `Bearer` service token, reads `userId` from the query Helpuit binds (not the body), filters requested columns to a baked-in allowlist, and scopes `.eq(userColumn, userId)`; the conformance test proves an over-asked column is dropped and the result is scoped to the sent user.)_
- [x] A worked example wires it via `queryRoutes` config end-to-end. _(the generated `queryRoutes` validates against the **real config schema** via `resolveEffectiveConfig`, and its route def drives the real executor in the conformance test.)_

**Implementation:** `supabaseQueryRouteScaffold(opts)` (composition) → `{ functionTs, configYaml, queryRoutes }` (header comment documents deploy + secret steps). Reachable via `AdminApi.supabaseQueryRouteScaffold` + `POST /admin/scaffold/supabase-query-route` (validates inputs). 3 generator/conformance unit tests + 3 route tests. _(The Deno template can't execute in the Node suite, so correctness is proven via the real executor + a contract-conformant endpoint and real-schema config validation — no mocks.)_ · **Console UI (follow-up):** an "Account data (L2)" card on Connections (table/user-column/allowed-columns → generate → copy the function + config); pure `parseColumnList` helper unit-tested.

**Blocked by.** FCW-11 (Supabase JWT preset) — soft.

---

## FCW-20 · Customer-token hand-off helper for Chatwoot  ✅ DONE

**What to build.** A shipped, documented default for getting the verified customer token into the Chatwoot conversation's `custom_attributes.helpuit_auth_token` — implemented AFK as a small helper/endpoint that sets the attribute via the Chatwoot API (with the widget-side snippet documented). This unblocks L2 account-aware support, today's gating gap.

**Acceptance criteria.**
- [x] A documented, supported path puts the token into the conversation's custom attributes. _(server: `setChatwootAuthToken` POSTs `custom_attributes.helpuit_auth_token` via the Chatwoot REST API, exposed at `POST /admin/chatwoot/set-token` (uses the configured Chatwoot creds); browser: a documented `CHATWOOT_TOKEN_WIDGET_SNIPPET` calling `$chatwoot.setCustomAttributes`.)_
- [x] An end-to-end check shows a token set this way is extracted and verified by the orchestrator. _(composition e2e: set via the helper → read what Chatwoot stored → `extractToken` → real `IdentityResolver`(hmac) → verified `userId`. The route test re-proves the stored token is a valid HMAC token via `node:crypto`.)_
- [x] Test: the helper sets the attribute against a fake Chatwoot API; `extractToken` reads it. _(3 composition tests over a **real stateful `node:http` Chatwoot stub** (set ok, bad-token err, full set→extract→verify) + 2 real-server route tests. No mocks.)_

**Implementation:** `setChatwootAuthToken(target, {conversationId, authToken})` (composition) + `HELPUIT_AUTH_TOKEN_KEY` (matches `extractToken`'s key) + `CHATWOOT_TOKEN_WIDGET_SNIPPET`. `AdminApi.setChatwootAuthToken` (reads `config.chatwoot`) + `POST /admin/chatwoot/set-token` (validates input). · **Console UI (follow-up):** a "Customer token hand-off" card on Connections (set a verified token on a conversation + the documented widget snippet).

**Blocked by.** FCW-12.

---

## FCW-21 · Docs: quick-start to a working agent + minimum-config + capability ladder  ✅ DONE

**What to build.** Rewrite the README quick-start so it ends at a *working, grounded* agent via the in-console flow; add a "minimum config" section (only what's truly required) and a "capability ladder" page (what each connection unlocks).

**Acceptance criteria.**
- [x] Quick-start reaches a grounded answer + a filed issue without file editing. _(README "fork → connect → working": `docker compose up` → printed admin token → console Setup checklist → connect/Test GitHub, Chatwoot (validate + auto-setup), LLM → Restart now → grounded answer + filed issue. Doc-conformance test asserts the printed-token + checklist + grounded flow.)_
- [x] A minimum-config section lists only the required items. _(README "Minimum config" table; backed by `MINIMUM_CONFIG` (`@helpuit/config`), each entry **verified genuinely required** against the real `resolveEffectiveConfig` — no doc fiction.)_
- [x] A capability-ladder doc maps each connection (repo/docs/account) to the capability it unlocks. _(`docs/capability-ladder.md`: connection→capability table (LLM, Chatwoot, GitHub+manifest→L1/L3a/L4, docs→L1, account+identity→L2, reproduction→L3b) + how escalation climbs.)_

**Implementation:** `MINIMUM_CONFIG` constant (config) is the single source of truth, tested for necessity/sufficiency against the resolver; README + `docs/capability-ladder.md` rewritten for the console flow; a doc-conformance test reads the shipped files so they can't drift. Also corrected the stale README "L3b wiring staged" note (it's wired, FCW-06) and the file-editing config guidance (now UI-first). No mocks.

**Blocked by.** Soft-blocked by the build slices above (docs should reflect the shipped flow).
