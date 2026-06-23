# Wave 7

Three packages, mutually independent — build in parallel.

---

## P23 — Repro rails

### 68. Repro caps — AFK
**What:** Enforce max steps, wall-clock, retries, and per-repro token/$ budget.
**Acceptance:**
- [ ] Hitting any cap stops the repro and classifies cannot_reproduce
**Blocked by:** 66

### 69. Abortability precondition — AFK
**What:** Never initiate an operation that can't be cleanly stopped or undone.
**Acceptance:**
- [ ] Non-abortable operations are blocked before starting
**Blocked by:** 66

### 70. Irreversible-feature block — AFK
**What:** Skip repro and escalate for features with irreversible side effects (payments, deletion, real emails).
**Acceptance:**
- [ ] Irreversible-feature repro is blocked and escalated with available evidence
**Blocked by:** 66

### 71. Playwright allow/disallow toggle — AFK
**What:** Founder setting to enable/disable dynamic reproduction entirely.
**Acceptance:**
- [ ] Disabled → no Playwright runs; investigation escalates instead
**Blocked by:** 66

### 72. Repro-env config — HITL
**What:** Founder chooses reproduction environment(s); default = production.
**Acceptance:**
- [ ] Environment selectable; defaults to prod
- [ ] Sandbox runs hard-walled from real side effects
**Blocked by:** 66

---

## P24 — Repro orchestration

### 73. Orchestrator L3a→L3b progression — AFK
**What:** When static investigation is inconclusive, escalate to dynamic reproduction.
**Acceptance:**
- [ ] Inconclusive static result triggers dynamic repro (if enabled)
**Blocked by:** 44, 66

### 74. Repro result → classification/escalation feed — AFK
**What:** Feed the reproduction result into classification and escalation; reproduced = high confidence, autonomous = lower confidence.
**Acceptance:**
- [ ] Reproduction outcome updates classification + confidence
- [ ] Result flows into the escalation package
**Blocked by:** 66, 43

---

## P25 — Lifecycle sync

### 75. GitHub webhook ingestion — AFK
**What:** Receive GitHub issue/PR webhook events.
**Acceptance:**
- [ ] Issue opened/assigned/PR-linked/closed events received and parsed
**Blocked by:** None (within wave)

### 76. Sync state machine — AFK
**What:** Map GitHub events → ticket status transitions + private notes (assigned, fix-in-progress, etc.).
**Acceptance:**
- [ ] Each event drives the correct ticket status + private note
**Blocked by:** 75, 49

### 77. Resolution mode toggle — AFK
**What:** Founder setting: manual vs automatic ticket resolution on issue close.
**Acceptance:**
- [ ] Mode stored and honored
**Blocked by:** None (within wave)

### 78. Auto-notify keyed on close-reason — AFK
**What:** Auto "fixed" notification fires only on close-reason `completed`; `not_planned`/duplicate route to the founder.
**Acceptance:**
- [ ] `completed` close → fixed flow; non-fix close → founder
**Blocked by:** 76, 77

### 79. Linked-ticket query — AFK
**What:** Query all tickets linked to a given issue (many-to-one).
**Acceptance:**
- [ ] Returns every ticket linked to an issue
**Blocked by:** 56

### 80. Fix fan-out — AFK
**What:** One issue close → update all linked tickets and draft/send the "try again" message to every linked customer.
**Acceptance:**
- [ ] All linked customers are notified on a single fix
- [ ] Manual mode drafts; auto mode sends
**Blocked by:** 78, 79
