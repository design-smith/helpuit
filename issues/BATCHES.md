# Helpuit — Issue Batches & Build Plan

> No git repo or issue tracker yet — issues are tracked locally in this folder.
> 88 granular issues, grouped into 25 cohesive **work packages** (a "do in one go" unit),
> layered into 7 **waves**. Everything inside a wave is mutually independent → build in parallel.
> All blockers of a wave live in earlier waves.

## Legend
- **AFK** — implementable & mergeable without human interaction.
- **HITL** — needs a human decision/review (design, threshold tuning, founder-config UX, tone).
- **⟵ N** — blocked by issue N.

## Waves (each row = packages that run in parallel)

### Wave 1 — Foundations (all independent)
- **P01 Chatwoot wire** — issues 1–3
- **P02 Feature manifest** — issues 18–24
- **P03 Redaction gate** — issues 52–54
- **P04 Sandbox infrastructure** — issues 60–63
- **P05 Budget / model / rate-limit rails** — issues 81–85

### Wave 2 — depends only on W1
- **P06 Investigation store** — issues 4–6
- **P07 Identity** — issues 9–13
- **P08 Docs guidance** — issues 14–17
- **P09 Dedup signature + match** — issues 37–40

### Wave 3
- **P10 Dashboard panel** — issues 7–8
- **P11 Code-grounded guidance** — issue 25
- **P12 L1 self-assessment** — issues 26–28
- **P13 Query routes / data access** — issues 29–33
- **P14 Ticketing** — issue 49
- **P15 Async boundary** — issues 45–48
- **P16 Output rail + audit** — issues 86–87

### Wave 4
- **P17 Account investigation** — issues 34–36
- **P18 Known-issue short-circuit** — issue 41
- **P19 Metrics** — issue 88

### Wave 5
- **P20 Static investigation + classification** — issues 42–44

### Wave 6
- **P21 Dynamic reproduction** — issues 64–67
- **P22 Escalation / issue filing** — issues 50,51,55–59

### Wave 7
- **P23 Repro rails** — issues 68–72
- **P24 Repro orchestration** — issues 73–74
- **P25 Lifecycle sync** — issues 75–80

## Critical path
P01 → P06/P08 → P13 → P17 → P20 → P21 → P24/P25

## HITL issues
22 (manifest review), 27 (L1 thresholds), 58 (escalation message tone), 72 (repro-env/prod config).

## Files
- `wave-1.md` … `wave-7.md` — packages + granular issues (full template, checkboxes).
- `wave-1-assignments.md` — Wave 1 split into parallel developer tracks.
- Design rationale lives in agent memory: `helpuit-product-design`, `automation-maximalist-preference`.

## Progress tracker

Tick a package when all its issues are merged. (Per-issue checkboxes live in the wave files.)

**Foundation:** `[x]` monorepo scaffold · `[x]` `@helpuit/contracts` (InvestigationId, Artifact, Classification, RedactionStatus, Investigation). Whole repo green: **135 tests, typecheck clean.** Orchestrator uses a single `replyAndAudit` path.

**Spine:** `[x]` `@helpuit/orchestrator` — full depth: intake → identity gate → create → known-issue short-circuit | guidance → **L1→L2 account** → **L2→L3a static + classify** → **L3a→L4 escalate (reproduce + file issue + ticket + status)** | needs_escalation → reply-through-rail → audit. **11 integration tests, four levels deep.**

**Loop closed:** `@helpuit/lifecycle-sync` syncs GitHub issue events back to every linked ticket; an auto-mode `completed` close fans the "try again" message out to all affected customers.

### Wave 1 — Foundations
- [~] P01 Chatwoot wire (1–3) — `@helpuit/chatwoot`: webhook parse + echo + client interface/fake green (7 tests). **Pending creds:** live Fastify route + `HttpChatwootClient` against a real Chatwoot.
- [~] P02 Feature manifest (18–24) — `@helpuit/feature-manifest`: resolver + store + heuristic builder green (5 tests). **Pending:** GitHub MCP `RepoSource`, LLM re-rank, founder review UI.
- [x] P03 Redaction gate (52–54) — `@helpuit/redaction`, 16 tests green.
- [~] P04 Sandbox infrastructure (60–63) — `@helpuit/sandbox`: lease/queue + pool + container interface/fake green (7 tests). **Pending integration:** `DockerContainerRunner` against a real daemon.
- [x] P05 Budget / model / rate-limit rails (81–85) — `@helpuit/budget`, 11 tests green.

`[~]` = core logic built & unit-tested; live adapter (creds/integration) pending.

### Wave 2 — TDD, all green
- [x] P06 Investigation store (4–6) — `@helpuit/investigation-store`: repository (create/get/transitions/classify) green (7 tests). *create-on-inbound wiring is Wave 3 orchestration.*
- [x] P07 Identity (9–13) — `@helpuit/identity`: resolver + extractToken + gateAccess green (8 tests).
- [~] P08 Docs guidance (14–17) — `@helpuit/guidance`: docs index + agent green (5 tests). **Pending:** real `GuidanceModel` (Claude) adapter; reply-wiring is Wave 3.
- [~] P09 Dedup signature + match (37–40) — `@helpuit/dedup`: signature + classify + knownIssueCheck green (6 tests). **Pending:** real `IssueSearch` (GitHub MCP) adapter.

### Wave 3 — spine + core green; 3 packages deferred
- [ ] P10 Dashboard panel (7–8) — **deferred to Wave 3 cont.** (view-model + iframe)
- [ ] P11 Code-grounded guidance (25) — **deferred to Wave 3 cont.** (manifest+code context for the guidance model)
- [x] P12 L1 self-assessment (26–28) — `@helpuit/assessment`: assessGuidance + detectPushback (5 tests)
- [x] P13 Query routes / data access (29–33) — `@helpuit/query-routes`: catalog + identity-bound client + sensitive-column guard (6 tests)
- [x] P14 Ticketing (49) — `@helpuit/ticketing`: ticket↔investigation, many-tickets→one-issue (3 tests)
- [ ] P15 Async boundary (45–48) — **deferred to Wave 3 cont.** (>10-min notice + detach + post-back)
- [x] P16 Output rail + audit (86–87) — `@helpuit/output-rail` (4 tests) + `@helpuit/audit` (2 tests)

### Wave 4 — all green
- [x] P17 Account investigation (34–36) — `@helpuit/account-investigation` (3 tests) + orchestrator L1→L2 progression (issue 36, +2 orchestrator tests)
- [x] P18 Known-issue short-circuit (41) — covered by the orchestrator spine; *real dedup→orchestrator wiring (signature derivation) pending live adapters*
- [x] P19 Metrics (88) — `@helpuit/metrics`: by-classification / by-level / known-issue counts (3 tests)

### Wave 5 — all green
- [x] P20 Static investigation + classification (42–44):
  - [x] 42 `@helpuit/static-investigation` — resolve feature → retrieve code → hypothesis/files/confidence (2 tests)
  - [x] 43 `@helpuit/classification` — evidence → 1 of 8 outcomes, precedence-ordered (5 tests)
  - [x] 44 orchestrator L2→L3a progression (+1 orchestrator test)

### Wave 6 — core green
- [x] P21 Dynamic reproduction (64–67) — `@helpuit/reproduction`: lease sandbox + container → drive browser → evidence → reproduced, always cleans up (abortability). 3 tests. **Pending:** real Playwright `BrowserDriver`.
- [x] P22 Escalation / issue filing (50,51,55–59) — `@helpuit/escalation`: draftIssue + EscalationAgent (create / link-on-open-match / draft-when-autopublish-off) + customer message (58). 4 tests. **Pending:** real `IssueTracker` (GitHub MCP); ticket-status wiring (59) lands with orchestrator L3a→L4 in Wave 7.

### Wave 7 — all green (finale)
- [x] P23 Repro rails (68–72) — `@helpuit/reproduction` policy: caps + Playwright toggle + irreversible/abortability block (5 tests)
- [x] P24 Repro orchestration (73–74) — orchestrator L3a→L3b→L4 via an `EscalationPort` (+1 orchestrator test, 11 total)
- [x] P25 Lifecycle sync (75–80) — `@helpuit/lifecycle-sync`: event parse + state machine + close-reason gating + fan-out (7 tests)

**Milestone — end of Wave 4:** shippable assistant (guidance + account investigation + known-issue short-circuit), no reproduction yet.
