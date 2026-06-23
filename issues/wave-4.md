# Wave 4

Three packages, mutually independent — build in parallel.

---

## P17 — Account investigation (L2)

### 34. Account Investigation agent — AFK
**What:** Given a verified userId + feature area, fetch safe findings via query routes and summarize.
**Acceptance:**
- [ ] Produces a safe account-state summary (plan/flags/permissions/recent errors)
- [ ] Uses only verified-identity-bound routes
**Blocked by:** 32

### 35. Fold findings into guidance — AFK
**What:** Incorporate account findings into the customer-facing answer.
**Acceptance:**
- [ ] Answer reflects the customer's actual account state (e.g. "exports off on Basic")
**Blocked by:** 34, 25

### 36. Orchestrator L1→L2 progression — AFK
**What:** Escalate from guidance to account investigation when guidance is insufficient.
**Acceptance:**
- [ ] Insufficient/low-confidence guidance triggers account investigation
**Blocked by:** 27, 34

---

## P18 — Known-issue short-circuit

### 41. Short-circuit on known open issue — AFK
**What:** Confident match to an open issue → tell customer "affecting several users", create a linked ticket, promise a retry notification — skip deeper levels.
**Acceptance:**
- [ ] Confident open-match short-circuits before guidance/repro
- [ ] Customer's ticket is created and linked to the existing issue
- [ ] Uncertain match falls through to normal guidance
**Blocked by:** 40, 49

---

## P19 — Metrics

### 88. Helpuit metrics — AFK
**What:** Dashboard metrics: reproduction success rate, spend vs caps, classification breakdown, escalations, known-issue short-circuits.
**Acceptance:**
- [ ] Reproduction success rate and spend are visible
- [ ] Classification breakdown is visible
**Blocked by:** 87
