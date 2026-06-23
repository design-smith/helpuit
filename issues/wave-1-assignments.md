# Wave 1 — Parallel Developer Assignments

Wave 1 has **5 fully independent packages** with zero cross-dependencies — they can start
simultaneously on day one with no coordination. One track per developer/agent. Full issue
detail in `wave-1.md`.

---

## Track A — Chatwoot wire (P01)
**Issues:** 1, 2, 3
**Goal:** Prove the Chatwoot integration seam end-to-end (webhook in → canned reply out).
**Touches:** webhook receiver, Agent Bot reply client.
**External deps:** a Chatwoot instance + Agent Bot API token.
**Done when:** a customer message in Chatwoot produces a bot reply in the same conversation.
**Note:** unblocks the most downstream work (Waves 2–3) — prioritize finishing first.

## Track B — Feature manifest (P02)
**Issues:** 18, 19, 20, 21, 22 (HITL), 23, 24
**Goal:** Auto-draft a founder-confirmed, self-refreshing feature manifest from the repo.
**Touches:** manifest schema/storage, prod-branch config, GitHub MCP builder, resolver, code retrieval, review UI.
**External deps:** GitHub MCP access + a target repo.
**Done when:** a complaint resolves to feature/routes/components and returns targeted code.
**Note:** issue 22 (review UI) needs founder UX judgment — HITL.

## Track C — Redaction gate (P03)
**Issues:** 52, 53, 54
**Goal:** Nothing un-redacted can leave Helpuit.
**Touches:** HAR scrubbing, PII scrub + redaction status, export guard.
**External deps:** none — buildable against fixtures.
**Done when:** an un-redacted artifact cannot be exported; a redacted one passes.

## Track D — Sandbox infrastructure (P04)
**Issues:** 60, 61, 62, 63
**Goal:** Lockable, queued, containerized sandbox accounts for reproduction.
**Touches:** account config, lease/queue, container lifecycle, account pool.
**External deps:** a container runtime; sandbox account credentials (secrets).
**Done when:** leases serialize per account (default 1/role), containers spin/teardown/kill, pool scales concurrency.

## Track E — Budget / model / rate-limit rails (P05)
**Issues:** 81, 82, 83, 84, 85
**Goal:** Cost is bounded and transparent; abuse is throttled.
**Touches:** spend tracking, budget caps config, graceful degradation, model-tiering tooltip, per-user rate limiting.
**External deps:** none.
**Done when:** hitting a cap halts spend + hands to founder; per-user complaint volume is throttled.

---

## Coordination notes
- **No shared files or interfaces across tracks** in Wave 1 — by design.
- The only soft contracts to agree on up front: the **investigation id** shape (Track A emits it, others consume it later) and the **artifact** shape (Track C and Track D both produce/consume artifacts in later waves). Stub these as simple types now; they firm up in Wave 2+.
- Track A is on the critical path → assign your fastest developer there.
- Tracks C, D, E have no downstream pressure until Waves 6–7 → fine to staff lighter.
