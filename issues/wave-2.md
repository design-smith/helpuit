# Wave 2 — depends only on Wave 1

All four packages are mutually independent — build in parallel.

---

## P06 — Investigation store

### 4. `helpuit_investigations` schema + repository — AFK
**What:** Schema and repository for the investigation record (status, level, classification, confidence, timestamps).
**Acceptance:**
- [ ] Create/read/update an investigation
- [ ] Fields for status, current level, classification, confidence
**Blocked by:** None (within wave)

### 5. Create investigation row on inbound — AFK
**What:** On an inbound customer message, create an investigation row and set initial status/level.
**Acceptance:**
- [ ] New inbound message creates exactly one investigation
- [ ] Reply references the investigation id
**Blocked by:** 3, 4

### 6. Persist status/level transitions — AFK
**What:** Update the investigation as it progresses (level changes, status changes).
**Acceptance:**
- [ ] Transitions are persisted and queryable
**Blocked by:** 5

---

## P07 — Identity

### 9. Identity Resolver — AFK
**What:** Module that turns a passed token into a verified identity or none.
**Acceptance:**
- [ ] Valid token → verified identity (user/account id)
- [ ] Invalid/missing token → none
**Blocked by:** None (within wave)

### 10. Extract token from conversation context — AFK
**What:** Read the auth token from the inbound conversation context (e.g. contact custom attribute).
**Acceptance:**
- [ ] Token extracted from inbound payload when present
**Blocked by:** 3

### 11. Access gate — AFK
**What:** Invalid/missing token → "please log in" reply; valid → proceed.
**Acceptance:**
- [ ] Unauthenticated user gets the login prompt, no further processing
- [ ] Authenticated user proceeds
**Blocked by:** 9, 10

### 12. Allow-anonymous toggle — AFK
**What:** Founder setting to allow non-logged-in users to use the assistant.
**Acceptance:**
- [ ] Toggle stored and readable; default = deny
**Blocked by:** None

### 13. Anonymous mode honors toggle — AFK
**What:** With anonymous allowed, permit guidance but keep account-investigation off (no verified identity).
**Acceptance:**
- [ ] Anonymous allowed → guidance works
- [ ] Account-investigation path remains disabled for anonymous
**Blocked by:** 11, 12

---

## P08 — Docs guidance (L1)

### 14. Docs ingestion + index — AFK
**What:** Ingest a provided docs set (chunk + embed + store).
**Acceptance:**
- [ ] Docs ingested and indexed
**Blocked by:** None

### 15. Docs retrieval — AFK
**What:** Query the index for relevant doc chunks.
**Acceptance:**
- [ ] Query returns relevant chunks
**Blocked by:** 14

### 16. Guidance agent (docs) — AFK
**What:** Agent that takes (complaint, retrieved docs) → answer + confidence.
**Acceptance:**
- [ ] Produces a grounded answer with a confidence value
**Blocked by:** 15

### 17. Wire guidance into reply — AFK
**What:** Replace the canned echo reply with the guidance agent's answer.
**Acceptance:**
- [ ] Customer receives a real docs-grounded answer end-to-end
**Blocked by:** 16, 3

---

## P09 — Dedup signature + match

### 37. Bug Signature module — AFK
**What:** Compute a bug signature from context (feature + route + failing endpoint + error class).
**Acceptance:**
- [ ] Deterministic signature for equivalent contexts
**Blocked by:** None

### 38. GitHub issue search via MCP — AFK
**What:** Search existing GitHub issues for a signature match via GitHub MCP.
**Acceptance:**
- [ ] Returns candidate issues for a signature
**Blocked by:** 37

### 39. Match classifier — AFK
**What:** Classify a match as open / closed / none.
**Acceptance:**
- [ ] Correctly distinguishes open vs closed vs no match
**Blocked by:** 38

### 40. Intake known-issue check hook — AFK
**What:** Run signature + match at intake, before spending on guidance.
**Acceptance:**
- [ ] Intake produces a match verdict before deeper processing
**Blocked by:** 39
