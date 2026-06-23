# Wave 3

Seven packages, mutually independent — build in parallel.

---

## P10 — Dashboard panel

### 7. Dashboard App iframe shell — AFK
**What:** Register a Chatwoot Dashboard App; iframe shell loads inside the conversation view.
**Acceptance:**
- [ ] Panel appears in the agent's conversation view
**Blocked by:** 3

### 8. Panel renders investigation record — AFK
**What:** Panel fetches and displays the investigation (status, level, classification).
**Acceptance:**
- [ ] Panel shows live investigation state for the open conversation
**Blocked by:** 7, 6

---

## P11 — Code-grounded guidance

### 25. Guidance uses manifest + code — AFK
**What:** Guidance agent retrieves via manifest first, then targeted code, to answer with product/code understanding.
**Acceptance:**
- [ ] Answers reflect how the feature actually works per the code
- [ ] Falls back to docs when code retrieval is empty
**Blocked by:** 16, 23, 24

---

## P12 — L1 self-assessment

### 26. Confidence scoring surfaced — AFK
**What:** Surface the guidance agent's confidence as a usable signal.
**Acceptance:**
- [ ] Confidence available to the orchestrator
**Blocked by:** 16

### 27. L1 exit-condition thresholds — HITL
**What:** Decide resolve-vs-escalate thresholds for guidance (needs human tuning).
**Acceptance:**
- [ ] Threshold policy defined and configurable
- [ ] Low-confidence guidance flags for escalation
**Blocked by:** 26

### 28. Customer-pushback signal — AFK
**What:** Detect "still broken" pushback and treat it as a strong escalation signal.
**Acceptance:**
- [ ] Pushback accelerates escalation decision
**Blocked by:** 27

---

## P13 — Query routes / data access

### 29. Query-route catalog schema — AFK
**What:** Schema for the founder-declared catalog of allowed query routes (route, allowed tables/columns, params).
**Acceptance:**
- [ ] Catalog entries stored with column allowlist and param spec
**Blocked by:** None

### 30. Config UI: define a query route — AFK
**What:** Agent-guided settings panel to define a read-only query route.
**Acceptance:**
- [ ] Founder can create/edit a route (columns, logic, param slot)
**Blocked by:** 29

### 31. Query Route Client — AFK
**What:** Call a route with structured params; validate against the catalog; return rows. No SQL composed by the agent.
**Acceptance:**
- [ ] Calls a configured route and returns rows
- [ ] Rejects table/column not in the catalog
**Blocked by:** 29

### 32. User-ID binding to verified identity — AFK
**What:** Bind the route's user param to the verified identity; never to chat text.
**Acceptance:**
- [ ] Param sourced from verified token only
- [ ] Self-asserted ids in chat are ignored
**Blocked by:** 31, 9

### 33. Sensitive-column guard warning — AFK
**What:** Warn the founder against whitelisting plaintext-sensitive columns during config.
**Acceptance:**
- [ ] Config UI flags likely-sensitive columns
**Blocked by:** 30

---

## P14 — Ticketing

### 49. Ticket creation + ticket↔investigation link — AFK
**What:** Create a Chatwoot ticket and link it to an investigation.
**Acceptance:**
- [ ] Ticket created and linked to its investigation
- [ ] Link supports many tickets → one (future) issue
**Blocked by:** 4

---

## P15 — Async boundary

### 45. Async job runner — AFK
**What:** Detach an investigation to a background worker.
**Acceptance:**
- [ ] Work continues after the synchronous chat turn ends
**Blocked by:** 6

### 46. Post-back into the open conversation — AFK
**What:** Background results post into the same (kept-open) conversation.
**Acceptance:**
- [ ] Async result appears as a new message in the original conversation
- [ ] Conversation stays open through the gap
**Blocked by:** 45, 3

### 47. ">10 min" notice — AFK
**What:** When work is estimated to exceed ~10 min (or is queued), tell the customer they can leave and will be notified.
**Acceptance:**
- [ ] Long/queued work triggers the "you can leave" message
**Blocked by:** 46

### 48. Out-of-band notify — AFK
**What:** Re-reach the customer via Chatwoot's native channel notification on async reply.
**Acceptance:**
- [ ] Customer is notified out-of-band when results land
**Blocked by:** 46

---

## P16 — Output rail + audit

### 86. Customer-facing output rail filter — AFK
**What:** Customer-facing messages contain product language only — strip code, SQL, file paths, internal reasoning.
**Acceptance:**
- [ ] Internal detail never reaches a customer message
- [ ] Internal detail still allowed in private notes/issues
**Blocked by:** 16

### 87. Per-investigation audit log — AFK
**What:** Log every customer-facing message and every action per investigation.
**Acceptance:**
- [ ] Full message + action trail retrievable per investigation
**Blocked by:** 6
