# Wave 1 — Foundations

All five packages are mutually independent — build in parallel.

---

## P01 — Chatwoot wire

### 1. Chatwoot webhook receiver — AFK
**What:** Endpoint that receives Chatwoot inbound-message webhook events, validates the signature, and logs the payload.
**Acceptance:**
- [ ] Valid signed webhook is accepted and parsed; invalid signature is rejected
- [ ] Inbound message events are recognized and logged
**Blocked by:** None — can start immediately

### 2. Agent Bot reply client — AFK
**What:** Client that posts a message back to a Chatwoot conversation via the Agent Bot API.
**Acceptance:**
- [ ] Can post a public reply to a conversation by id
- [ ] Can post a private note to a conversation
**Blocked by:** None — can start immediately

### 3. Echo end-to-end — AFK
**What:** An inbound customer message triggers a canned reply back into the same conversation.
**Acceptance:**
- [ ] Customer message in Chatwoot produces a canned bot reply in that conversation
- [ ] Demoable end-to-end through stock Chatwoot
**Blocked by:** 1, 2

---

## P02 — Feature manifest

### 18. Manifest schema + storage — AFK
**What:** Persisted model for the feature manifest (feature → routes → components → endpoints → docs links → sandbox role).
**Acceptance:**
- [ ] Manifest can be written and read back
- [ ] Schema supports per-feature routes/components/endpoints
**Blocked by:** None

### 19. Founder config: declare production branch — AFK
**What:** Setting where the founder declares which branch/ref is the live/production code.
**Acceptance:**
- [ ] Production branch/ref is stored and readable
- [ ] Defaults are sane and editable
**Blocked by:** None

### 20. Manifest builder via GitHub MCP — AFK
**What:** Read the repo at the declared production branch via GitHub MCP and auto-draft the manifest.
**Acceptance:**
- [ ] Produces a draft manifest of features/routes/components from the repo
- [ ] Uses the production branch from issue 19
**Blocked by:** 18, 19

### 21. Manifest re-index trigger — AFK
**What:** Mechanism to re-build the manifest on demand / on a refresh signal.
**Acceptance:**
- [ ] Manifest can be regenerated without losing founder edits where possible
**Blocked by:** 20

### 22. Manifest review UI — HITL
**What:** Settings panel where the founder reviews, edits, and confirms the drafted manifest.
**Acceptance:**
- [ ] Drafted manifest is listed and editable
- [ ] Founder confirmation is persisted
**Blocked by:** 20

### 23. Manifest resolver — AFK
**What:** Given a complaint, resolve the relevant feature + routes + components.
**Acceptance:**
- [ ] Returns the best-matching feature(s) for a complaint
- [ ] Returns associated routes/components
**Blocked by:** 20

### 24. Code retrieval within a feature — AFK
**What:** Retrieve the relevant source files for a resolved feature via GitHub MCP.
**Acceptance:**
- [ ] Returns targeted code for a given feature, scoped to its files
**Blocked by:** 23

---

## P03 — Redaction gate

### 52. HAR token/cookie stripping — AFK
**What:** Strip auth headers, cookies, and tokens from HAR artifacts.
**Acceptance:**
- [ ] Auth headers/cookies/tokens removed from a sample HAR
**Blocked by:** None

### 53. PII/findings scrub + redaction status — AFK
**What:** Scrub PII from findings/artifacts; track a `pending → redacted` status.
**Acceptance:**
- [ ] PII fields scrubbed from findings
- [ ] Artifact carries a redaction status
**Blocked by:** 52

### 54. Export guard — AFK
**What:** Block any artifact from being attached/exported until it is `redacted`.
**Acceptance:**
- [ ] Un-redacted artifact cannot be exported
- [ ] Redacted artifact passes
**Blocked by:** 53

---

## P04 — Sandbox infrastructure

### 60. Sandbox account config — AFK
**What:** Founder config for per-role sandbox accounts (credentials via secrets).
**Acceptance:**
- [ ] Per-role accounts stored with secret references
**Blocked by:** None

### 61. Sandbox lease/queue — AFK
**What:** A sandbox account is a lockable resource; default 1 per role; others queue.
**Acceptance:**
- [ ] Lease acquire/release works; second request queues
**Blocked by:** 60

### 62. Container lifecycle — AFK
**What:** Spin up / tear down / kill an ephemeral reproduction container.
**Acceptance:**
- [ ] Container can be created, torn down, and force-killed (abort)
**Blocked by:** None

### 63. Account pool for parallelism — AFK
**What:** Founder can provision N accounts per role to increase repro concurrency.
**Acceptance:**
- [ ] Pool size configurable; concurrent leases up to pool size
**Blocked by:** 61

---

## P05 — Budget / model / rate-limit rails

### 81. Spend tracking — AFK
**What:** Track token/compute spend per investigation and per day/month.
**Acceptance:**
- [ ] Spend accrues per investigation and per period
**Blocked by:** None

### 82. Founder budget caps config — AFK
**What:** Settings for per-investigation and per-day/month budget ceilings.
**Acceptance:**
- [ ] Caps stored and readable
**Blocked by:** None

### 83. Graceful degradation on cap hit — AFK
**What:** When a cap is hit, stop work and hand off to the founder rather than grinding.
**Acceptance:**
- [ ] Reaching a cap halts further spend and raises a founder hand-off
**Blocked by:** 81, 82

### 84. Model selection + tiering tooltip — AFK
**What:** Founder picks model(s); surface a recommended quality/cost-balanced tiering as a tooltip.
**Acceptance:**
- [ ] Model choice stored
- [ ] Recommendation tooltip reflects the chosen model
**Blocked by:** None

### 85. Per-user rate limiting — AFK
**What:** Limit complaint volume per user to blunt spam/abuse.
**Acceptance:**
- [ ] Excess requests from one user are throttled
**Blocked by:** None
