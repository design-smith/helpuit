# Wave 5

One package on the critical path.

---

## P20 — Static investigation + classification (L3a)

### 42. Static Code Investigator — AFK
**What:** Read the suspected feature's code (manifest + retrieval) and try to spot the defect by inspection → hypothesis + suspected files + confidence. No browser.
**Acceptance:**
- [ ] Produces a hypothesis and a list of suspected files/components
- [ ] Emits a confidence value
- [ ] Runs without launching the app
**Blocked by:** 23, 24

### 43. Classification engine — AFK
**What:** Produce one of the explicit outcomes — user_error, permission_or_config_issue, account_data_issue, docs_gap, known_bug, new_bug (suspected until dynamic repro confirms), cannot_reproduce, needs_founder — plus confidence.
**Acceptance:**
- [ ] Every investigation ends with exactly one classification + confidence
- [ ] Irreversible categories route to needs_founder
**Blocked by:** 42, 34

### 44. Orchestrator L2→L3a progression — AFK
**What:** Escalate from account investigation to static code investigation when account state doesn't explain the symptom.
**Acceptance:**
- [ ] Unexplained symptom triggers static investigation
**Blocked by:** 36, 42
