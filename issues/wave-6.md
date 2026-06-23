# Wave 6

Two packages, mutually independent — build in parallel.

---

## P21 — Dynamic reproduction (L3b)

### 64. Playwright harness in container — AFK
**What:** In an ephemeral container, log in as a sandbox account and navigate to a route via Playwright.
**Acceptance:**
- [ ] Logs in as sandbox account and reaches a target route
- [ ] Runs inside the container lifecycle (killable)
**Blocked by:** 62, 60

### 65. State recreation — AFK
**What:** Apply the customer's safe state (plan/flags/role) to the sandbox account before repro. Never impersonate the customer.
**Acceptance:**
- [ ] Sandbox reflects the relevant customer state
- [ ] No customer impersonation / real customer login
**Blocked by:** 64, 34

### 66. Dynamic Reproducer — AFK
**What:** Drive steps to test the static-investigation hypothesis → reproduced / not result.
**Acceptance:**
- [ ] Executes a reproduction attempt against the hypothesis
- [ ] Returns a clear reproduced / not-reproduced result
**Blocked by:** 64, 42

### 67. Evidence capture — AFK
**What:** Capture screenshot, console log, and HAR during the repro.
**Acceptance:**
- [ ] Artifacts captured and attached to the reproduction attempt
**Blocked by:** 66

---

## P22 — Escalation / issue filing (L4)

### 50. Safe-summary builder — AFK
**What:** Build `safe_user_summary` from findings — the only user-derived content allowed to leave Helpuit.
**Acceptance:**
- [ ] Produces a PII-free summary of account-state findings
**Blocked by:** 34

### 51. Escalation agent drafts issue body — AFK
**What:** Draft an engineering-grade issue: title, summary, impact, repro steps, expected/actual, suspected files, severity, labels, linked ticket.
**Acceptance:**
- [ ] Draft contains all required sections
- [ ] References the safe summary, not raw PII
**Blocked by:** 43, 50

### 55. GitHub issue create via MCP — AFK
**What:** Create a new GitHub issue from the draft via GitHub MCP.
**Acceptance:**
- [ ] New issue created with the drafted body + labels
**Blocked by:** 51, 54

### 56. Link path (open-match → no new issue) — AFK
**What:** On an open-match (dedup), comment evidence on the existing issue and link the ticket instead of creating a new issue. Closed-match → create new (regression).
**Acceptance:**
- [ ] Open match links + comments, no duplicate issue
- [ ] Closed match creates a new issue
**Blocked by:** 55, 39

### 57. Autopublish toggle — AFK
**What:** Founder setting: auto-file issues vs draft-for-approval.
**Acceptance:**
- [ ] Auto mode files immediately; draft mode holds for approval
**Blocked by:** 55

### 58. Customer escalation message templates + tone — HITL
**What:** Wording/tone for the "this is escalated, we'll update you" customer message.
**Acceptance:**
- [ ] Approved templates exist and are used
**Blocked by:** 49, 55

### 59. Ticket status = escalated + private note — AFK
**What:** Set the ticket to escalated and post a private note with the issue link.
**Acceptance:**
- [ ] Ticket status updated; private note references the issue
**Blocked by:** 49, 55
