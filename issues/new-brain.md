# New Brain — Planner · Policy Kernel · Case · Composer

Replaces the fixed-ladder orchestrator with query-dependent routing: an LLM **Planner** emits structured directives, a deterministic **Policy Kernel** validates every one (identity, budget, capability, silo, caps), siloed agents consult, and a **Composer** — the only customer voice — writes every reply from kernel-rebuilt, product-language briefings. Conversation state lives in a per-conversation **Case**. One big-bang cutover at the end (issue 12); until then every issue is additive and the live ladder keeps serving.

Two parallel tracks: the **engine track** (1–7) and the **knowledge track** (8–10), converging in 11 → 12.

House rules for every issue: TDD red→green with real collaborators (`:memory:` DB, real HTTP harness, scripted chat-model fakes only at the LLM seam); full suite + typecheck green after each issue; no behavior change to the live ladder before issue 12.

---

## T1 — Engine track

### 1. Directive contract + Policy Kernel — AFK
**What:** The typed law of the new brain. A zod discriminated-union directive schema (what the Planner may emit), the `ComposerBriefing` type (the ONLY payload the Composer can receive), and a deterministic Policy Kernel that validates directives and audits every decision. From the arbitration (decision-rich shape, trimmed):

```ts
Directive = consult_docs{query} | consult_account{brief} | consult_code{brief}
          | ask_clarifying{question} | offer_consent{offer, issueNumber?}
          | attach_known_issue{issueNumber} | file_ticket | compose_reply{intent}
PlannerOutput = { directives: Directive[1..4], reasoning?, caseNotes? }
ComposerBriefing = { intent, points: string[≤6, ≤600ch], docExtracts[≤3], question?, offer? }
KernelDecision = allow | deny{reason} | force_compose{briefing, reason}
```

Kernel gate order: pause → identity (`consult_account` needs a verified user) → capability wired → budget (governor pre-check, per-case scope) → consent match (`attach`/`file` denied without a matching pending offer) → cap (max 4 directives per message, then `force_compose` built from findings-so-far). The kernel REBUILDS every compose briefing from product-layer findings it holds — planner text is proposal, never pass-through.
**Acceptance:**
- [ ] Schema accepts every valid directive shape and rejects malformed/oversized ones (table-driven)
- [ ] Every kernel gate has an allow and a deny/force case in a decision-table test, using the real budget governor over an in-memory ledger
- [ ] 5th directive in a message becomes forced compose-with-what-we-have
- [ ] `attach_known_issue`/`file_ticket` are denied when no matching pending offer exists
- [ ] Every decision produces an audit entry {directive, verdict, reason}
**Blocked by:** None — can start immediately

### 2. Walking skeleton: plan → validate → execute → compose — AFK
**What:** The engine loop, end-to-end in the test harness: a docs question comes in, the Planner (LLM bridge, house JSON-parse pattern: one retry appending validation errors, then deterministic clarifying-question fallback + audit) emits `consult_docs`; the kernel validates; docs retrieval runs with a cheap-tier sufficiency check; the planner re-plans on the result and emits `compose_reply`; the kernel rebuilds the briefing; the Composer (cheap tier) writes the reply; the existing output rail runs at the send edge. The engine lands as a new class beside the ladder — nothing rewires yet.
**Acceptance:**
- [ ] Harness test: question in → grounded composed reply out, with the directive trail in the audit log
- [ ] Planner parse failure → one retry → fallback clarifying question (never a crash, never raw LLM text to the customer)
- [ ] Re-plan happens after the docs result (scripted planner proves two rounds)
- [ ] Composer input is the typed briefing only — a compile-level test proves technical fields can't reach it
- [ ] Output rail applied to every send
**Blocked by:** 1

### 3. Stateful Case across turns — AFK
**What:** The conversation-scoped memory. The open investigation for a conversation IS the Case: a `case_json` column (additive migration via the existing column-backfill pattern) holding CaseMemory — findings, technical layer, hypotheses, pendingOffer, notes, consultCount, lastAckAt (shape from the arbitration). Reuse-or-create the open investigation per conversation; the engine loads memory before planning and persists after. A clarifying question ends the turn; the customer's next webhook resumes the SAME case with memory intact. Resolved/escalated cases stop matching, so a new message opens a fresh case.
**Acceptance:**
- [ ] Existing DBs upgrade cleanly (backfill test: old-shape table gains the column; fresh DB has it)
- [ ] Two `handleInbound` calls on one conversation share one case; findings from turn 1 are in the planner input of turn 2
- [ ] `ask_clarifying` ends the turn with memory persisted; the answer resumes the case
- [ ] A concluded case is not reused — next message starts a fresh one
- [ ] Console audit view shows the accumulated directive trail for the case with zero console changes
**Blocked by:** 2

### 4. Ack beat (progressive replies) — AFK
**What:** Chat feels alive during deep work. When a validated plan contains any consult directive, the Composer immediately sends a one-line acknowledgment, then the substantive reply follows in the same job after consults finish — two sends, one job, ordered. `lastAckAt` in CaseMemory suppresses duplicate acks when the job queue retries a failed job.
**Acceptance:**
- [ ] Plan with a consult ⇒ ack lands before the findings reply (ordering proven through the real queue/worker)
- [ ] Plan without consults ⇒ no ack, single reply
- [ ] Job retry after a mid-flight failure does not send a second ack
- [ ] Ack is audited
**Blocked by:** 3

### 5. Identity, account & budget gates — AFK
**What:** The safety parity of the old ladder, in kernel terms. Anonymous customer: the planner is told identity is anonymous and plans around it; if it still emits `consult_account`, the kernel denies and the denial feeds the next planning round. Verified customer: the account investigator runs as a consult (its customer-safe summary is the finding). All model calls metered per-case (governor scope = case id); a budget breach anywhere forces a graceful budget-stop compose and `needs_founder`. Founder pause gate remains the first check.
**Acceptance:**
- [ ] Anonymous + `consult_account` ⇒ kernel deny, planner re-plans, customer still gets a docs-grounded or clarifying reply
- [ ] Verified ⇒ account consult runs; only the customer-safe summary enters findings (raw rows never leave the investigator)
- [ ] Tiny budget cap ⇒ budget-stop reply + investigation `needs_founder` (parity with the ladder's behavior)
- [ ] Paused conversation ⇒ engine fully silent
**Blocked by:** 3

### 6. Code Analyst two-layer + briefing silo — AFK
**What:** The strict code silo. The static investigator's model contract extends to emit BOTH layers: technical {hypothesis, suspectedFiles, confidence} and product {explanation, verdict: user_error_or_prerequisite | actual_bug | explains_behavior}. The technical layer lives only in CaseMemory/audit (later: escalation); the kernel builds Composer briefings exclusively from product layers. A `user_error_or_prerequisite` verdict yields a reply that walks the customer through what to do — with zero hint that code was read.
**Acceptance:**
- [ ] Analyst returns both layers; parse fallback degrades to `explains_behavior` at low confidence
- [ ] `consult_code` flows: brief in → two-layer finding in memory → product-language reply out
- [ ] The briefing type cannot carry hypothesis/suspectedFiles/paths (compile-level + runtime test)
- [ ] `user_error_or_prerequisite` produces instructional reply, no ticket offer
**Blocked by:** 3

### 7. Consent-gated ticket filing — AFK
**What:** The "shall I file this for you?" moment. When the analyst concludes `actual_bug`, the planner offers consent; the offer is persisted as `pendingOffer`; the customer's next message is interpreted by the planner (yes/no); on yes the kernel-matched `file_ticket` executes the EXISTING escalation pipeline verbatim — signature dedup, redaction, draft/auto policy, draft store, ticket + issue link, status escalated. On no, the offer clears and the case notes it.
**Acceptance:**
- [ ] `actual_bug` ⇒ consent question sent, pendingOffer persisted, turn ends
- [ ] "Yes" next turn ⇒ escalation pipeline runs (draft appears in the console's Drafts review under autopublish=draft; auto mode files directly), ticket + link created, case escalated
- [ ] "No" ⇒ offer cleared, no escalation, conversation continues
- [ ] `file_ticket` without a pending offer is structurally impossible (kernel deny test)
- [ ] The technical layer (hypothesis/files) reaches the draft body; the customer reply never contains it
**Blocked by:** 6

---

## T2 — Knowledge track (parallel — start immediately)

### 8. Semantic knowledge index — AFK
**What:** Retrieval gets real. An embeddings adapter (OpenAI-compatible `/embeddings`; optional `models.embedding` config — unset means semantic layer off), an embeddings table (id, owner kind/id, chunk seq, text, vector BLOB, model, updated_at — the `model` column forces re-embed on model change), paragraph-pack chunking, and a `SemanticDocsIndex` implementing the existing DocsIndex interface: cosine top-k merged with token-overlap fallback for unembedded docs. One-line swap in the docs service behind config. **This upgrades the LIVE ladder's retrieval immediately — demoable before cutover.** No vector DB, no new deps: Float32Array cosine over SQLite BLOBs.
**Acceptance:**
- [ ] Chunking is deterministic and table-tested; embeddings adapter tested against a real local HTTP fake
- [ ] Ingest/upsert/remove keep the live index consistent; re-import refreshes embeddings (no dupes)
- [ ] Retrieval returns semantically relevant chunks (deterministic fake vectors prove ranking)
- [ ] No embedding key configured ⇒ token-overlap behavior, byte-for-byte today's results
- [ ] Live app answers ground correctly with the semantic index enabled (manual check)
**Blocked by:** None — can start immediately

### 9. Link scraping rides docs ingest — AFK
**What:** Docs from URLs. `'link'` becomes a doc source: posting a URL to the existing docs endpoint scrapes it server-side (plain fetch + ~25-line tag-strip — text-soup is fine for embedding fodder; readability lib is the named upgrade if quality suffers) and imports via the existing source-tagged upsert, so a re-scrape refreshes in place. A daily sweep (existing retention-sweep pattern) re-scrapes all link docs and re-embeds anything missing vectors. Console Documents tab gains a URL input. **Demoable before cutover.**
**Acceptance:**
- [ ] POST a URL ⇒ scraped text lands as a `link` doc, grounded in live answers, listed in the console with its source badge
- [ ] Re-posting/sweeping the same URL updates in place — no duplicates
- [ ] Scrape failures log and skip — never crash boot or the sweep
- [ ] Sweep re-embeds docs whose vectors are missing
**Blocked by:** None — can start immediately

### 10. Issue & case embed sync — AFK
**What:** The known-issue corpus. List open GitHub issues (existing GitHub client seam) and embed title+body into the embeddings table under the issue namespace, at boot + daily (same sweep). Open cases embed their complaint summary on save under the case namespace. Closing an issue removes/expires its rows.
**Acceptance:**
- [ ] Boot + daily sweep embeds all open issues (fake GitHub HTTP seam)
- [ ] Case summaries embed on save; concluded cases drop out of the match pool
- [ ] Closed issues stop matching after the next sweep
- [ ] No embedder configured ⇒ sync is a silent no-op
**Blocked by:** 8

---

## T3 — Convergence

### 11. Known-issue matcher + attach consent — AFK
**What:** "That's a known issue — want me to link you to it?" On each new problem-shaped message, embed the complaint and kNN across issue + case namespaces; a confident hit is confirmed by one cheap-tier yes/no LLM check to kill false positives; the engine short-circuits: acknowledge it's known and being resolved + offer to attach. On consent, create the internal ticket linked to the issue — the existing lifecycle-sync then auto-notifies this customer the moment the fix ships. Degrades to no-match without an embedder.
**Acceptance:**
- [ ] Second customer with the same symptom gets the known-issue acknowledgment + attach offer (harness, deterministic vectors)
- [ ] "Yes" ⇒ ticket + issue link created; closing the issue on GitHub notifies this conversation (existing lifecycle-sync test extended)
- [ ] Low-similarity or LLM-refuted candidates do NOT short-circuit (false-positive guard test)
- [ ] No embedder ⇒ flow silently absent
**Blocked by:** 7, 10

### 12. CUTOVER — engine replaces the ladder — HITL
**What:** The one commit. The engine becomes the Orchestrator behind the unchanged `handleInbound` seam; composition rewires (tier models, governor per-case scope, embeddings, analyst, escalation ports); the ladder body, the old guidance agent + its code-context, the guidance LLM bridge, and the assessment package are DELETED (verify the pushback detector truly has no other consumer first). Founder runs the live smoke and approves.
**Acceptance:**
- [ ] Parity matrix: every old orchestrator outcome (denied · paused · known_issue · guided · account_investigated · static_investigated · escalated · needs_escalation · budget_exceeded) has a covered equivalent test in the engine suite
- [ ] Full suite + typecheck + smoke boot green with the ladder deleted
- [ ] Manual live checklist: docs Q&A with no internal leak · ack-then-answer beat · anonymous account question denied gracefully · bug → consent → draft → publish → GitHub issue · second customer → known-issue attach → close → "fixed" fan-out · link doc grounds an answer · pause silences · tiny budget → needs_founder · no embeddings key → fallback works
- [ ] Rollback story: revert this single commit restores the ladder
**Blocked by:** 1–11

---

## Dependency graph

```
1 → 2 → 3 → {4, 5, 6}        8 → 10
             6 → 7            9 (independent)
{7, 10} → 11
{1..11} → 12 (HITL cutover)
```

---

## Cutover record (Issue 12) — engine replaced the ladder

**Parity matrix** — every ladder outcome has a covered equivalent in the engine suites
(`packages/orchestrator/src/engine.test.ts` = E, `packages/composition/src/compose.test.ts` = C):

| Ladder outcome | Engine equivalent | Covering tests |
|---|---|---|
| `denied` | `denied` (identity gate, pre-case) | E "denies an unverified customer", C "denies an unauthenticated user" |
| `paused` | `paused` (founder takeover, total silence) | E "stays completely silent", C "founder takeover" |
| `known_issue` | `known_issue` (semantic match → consent → attach + link) | E known-issue flow ×4 |
| `guided` | `replied` (consult_docs → composed reply) | E tracer, C "answers a docs question end-to-end" |
| `account_investigated` | `replied` + classification recorded | E verified-account + classification tests, C account ×2 (query routes, Supabase) |
| `static_investigated` | `replied` (consult_code; technical layer stays in case memory) | E consult_code silo test, C consent flow turn 1 |
| `escalated` | `escalated` (consent-gated: offer → yes → pipeline) | E consent tests, C "code analyst → consent → filed" |
| `needs_escalation` | subsumed: planner asks/offers instead of flagging | E fallback + offer tests |
| `budget_exceeded` | `budget_exceeded` (kernel probe + metered throw, → needs_founder) | E both budget paths, C day-cap test |

Deliberate behavior changes at cutover (all locked-ledger decisions, not regressions):
- Escalation is **consent-gated** (offer_consent → yes → file_ticket); the ladder auto-filed.
- LLM integration OFF now yields a graceful canned fallback reply instead of a swallowed crash; still zero provider calls.
- Deleted: ladder `orchestrator.ts`, `@helpuit/assessment` (detectPushback had no consumers), `GuidanceAgent` + `ManifestCodeContextProvider`, `createGuidanceModel` bridge. Code grounding now flows exclusively through the Code Analyst silo.

**Rollback:** revert the cutover commit — the seam (`buildOrchestrator` → `handleInbound`) is unchanged, so the ladder returns wholesale.

**Manual live checklist (founder, before calling it done):**
- [ ] Docs Q&A: ask a documented question → grounded answer, no internal leak (no agent names, no file paths)
- [ ] Ack-then-answer beat visible on a consult-y question
- [ ] Anonymous account question → graceful "log in" style denial (with allowAnonymous off)
- [ ] Bug report → analyst → consent offer → "yes" → draft/publish → GitHub issue exists
- [ ] Second customer, same symptom → known-issue acknowledgment + attach offer → "yes" → close the issue on GitHub → "fixed" fan-out reaches the conversation (needs `models.embedding` configured)
- [ ] Add a link doc in Documents → it grounds an answer
- [ ] Pause a conversation in the console → agent goes silent
- [ ] Set a tiny per-day budget → polite stop + investigation lands in needs_founder
- [ ] Remove the embeddings config → everything still works, known-issue flow silently absent
