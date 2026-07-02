# Multi-helpdesk — Zendesk · Intercom · Freshdesk · HubSpot

> Status: ready-for-agent

Add four more support platforms alongside Chatwoot so the same investigation engine can sit on any of them, **multiple connections at once**. The existing `ChatwootClient` (`sendReply` / `sendPrivateNote` / `getMessages`) and the pure `parseInboundMessage` already are the seam — we generalize them, we do **not** build a new gateway. Chatwoot is refactored into the first adapter and must not change behavior.

**Decisions locked** (chosen for <3-minute, API-key-simple, local-first setup):
- **Zendesk → Support/tickets** (API token; auto-create webhook+trigger). Messaging/Sunshine deferred (plan-gated, multi-step).
- **Freshdesk → ticketing via API key + polling** (no webhook, no tunnel). Freshchat deferred.
- **HubSpot → private-app token + polling** on the existing connected inbox. Custom Channels / public-OAuth deferred (heavier + plan-gated).
- **Intercom → access token + native webhook** (reuse the existing tunnel).
- **L2 (account reads) is OFF by default** for weak-identity platforms (HubSpot, Freshdesk-email): identity there is channel-trust or self-asserted, so account-reads stay opt-in with step-up. L1 answers + escalation work out of the box.

**Ponytail cuts (do not re-add):** no `ConversationPlatform`/gateway package (reuse `SupportClient`); no capability-negotiation framework (all four chosen variants support private notes today); provisioning is `validate()` + docs, **not** full auto-setup (except Zendesk's webhook, which the API makes trivial); identity reuses the existing HMAC/JWT/endpoint verifiers.

**House rules for every issue:** TDD red→green with real collaborators (`:memory:` DB, real `node:http` stub servers per the existing `chatwoot`/`github-connect` tests; fakes only at the LLM seam); full suite + typecheck green after each issue; the live Chatwoot path stays green throughout; identity is only ever a verified token, never chat-asserted; every new adapter is additive behind its own connection toggle.

---

### 1. Generalize the intake pipe on Chatwoot — AFK

**What:** Promote the Chatwoot-specific client to a platform-agnostic `SupportClient` (`sendReply` / `sendPrivateNote` / `getMessages`) and make the orchestrator, composition, server intake, and lifecycle-sync consume it through a **connection registry** instead of a hard-wired client. Widen the conversation identifier from a numeric Chatwoot id to a **platform-namespaced string** and add a `platform` / `connectionId` dimension across contracts, ticketing, the control store, and the DB (idempotent migration + backfill). Config gains a `platforms[]` list → an in-memory `Map<connectionId, adapter>`; each adapter exposes `{ parse, verify, client, validate }`. The server exposes one generic `/webhooks/:connectionId` that resolves the adapter, verifies the signature, parses, and enqueues through the **existing** idempotency + rate-limit path. Chatwoot is re-expressed as adapter #1 with zero behavior change.

**Acceptance:**
- [ ] `SupportClient` interface + per-adapter `{parse, verify, client, validate}` shape defined; Chatwoot implements it with no behavior change
- [ ] `conversationId` is a platform-namespaced string end-to-end (contracts, orchestrator, ticketing, control store, DB); the migration is idempotent and backfills existing rows with `platform = chatwoot`
- [ ] `/webhooks/:connectionId` resolves the adapter from the registry and verifies → parses → enqueues via the existing idempotency + rate-limit path; the previous `/webhooks/chatwoot` keeps working (alias)
- [ ] Two connections configured at once resolve independently (test with two Chatwoot connections)
- [ ] Full existing Vitest suite + typecheck green; Chatwoot intake, reply, and lifecycle-sync are unchanged

**Blocked by:** None — can start immediately

---

### 2. Polling ingestion worker — AFK

**What:** A generic polling inbound path for adapters with no (or undesirable) webhooks. Reuse the existing queue/`Worker`: for each poll-enabled connection, an interval lists messages since a persisted per-connection cursor, drops non-customer messages via the adapter's `parse`, and enqueues through the **same** idempotency + rate-limit path as the webhook route.

**Acceptance:**
- [ ] A poll loop drives the same enqueue path as the webhook route (proven with a fake poll-adapter over the in-memory queue)
- [ ] Per-connection cursor persists and advances; a restart resumes without reprocessing (idempotency dedupes overlap)
- [ ] Poll interval + enable are per-connection config; absent/disabled = no polling, no wasted calls
- [ ] `ponytail:` comment marks the naive "since-timestamp" cursor and names the server-side-delta upgrade path
- [ ] Suite + typecheck green

**Blocked by:** Issue 1

---

### 3. Intercom adapter — AFK

**What:** An Intercom connection end-to-end. Access-token auth (internal app); native webhook on `conversation.user.created` / `conversation.user.replied`; verify `X-Hub-Signature` (HMAC-SHA1 over the raw body, keyed with the app client secret); loop-safety on `author.type` (act only on `user`/`lead`, ignore `admin`/`bot`/`team` and our own admin id); public reply via `POST /conversations/{id}/reply` `message_type: comment`, private note via `message_type: note`; verified identity from Intercom Identity Verification (`user_hash`/JWT) resolved on `external_id`; region-aware base URL; explicit pinned `Intercom-Version` header.

**Acceptance:**
- [ ] Inbound webhook verified against the raw body and parsed; admin/bot/own messages ignored (loop-safety test)
- [ ] Public reply and private note both post correctly against a fake Intercom HTTP server
- [ ] Verified identity resolves via the existing verifier from `external_id`; unverified falls through the existing access gate
- [ ] `validate()` confirms the token; setup (Dev-Hub app token + webhook topics) documented
- [ ] L1 answer works end-to-end on an Intercom connection in the harness; suite + typecheck green

**Blocked by:** Issue 1

---

### 4. Zendesk Support adapter — AFK

**What:** A Zendesk Support (ticketing) connection end-to-end. API-token auth (`email/token`); on connect, auto-create a Webhook + Trigger (`conditional_ticket_events`) via the Webhooks API; verify `X-Zendesk-Webhook-Signature` (HMAC-SHA256 over `timestamp + body`); loop-safety via `comment.author.is_staff` + a public-comment condition; public reply = ticket update with `comment { public: true }`, private note = `{ public: false }`, both attributed to a dedicated machine-agent `author_id`; identity from the verified ticket requester.

**Acceptance:**
- [ ] Connect auto-creates the webhook + trigger; `validate()` confirms token + subdomain
- [ ] Webhook signature verified; staff/own comments ignored (loop-safety test)
- [ ] Public reply and private note post (two calls) attributed to the bot agent, against a fake Zendesk HTTP server
- [ ] Identity resolves from the requester; L1 works end-to-end on a Zendesk connection; suite + typecheck green

**Blocked by:** Issue 1

---

### 5. Freshdesk adapter (poll) — AFK

**What:** A Freshdesk ticketing connection end-to-end via **polling** (no webhook). API-key Basic auth; poll tickets/conversations for new customer replies; loop-safety via `incoming === true && private === false && user_id !== botAgentId`; public reply `POST /tickets/{id}/reply`, private note `POST /tickets/{id}/notes`; identity by server-side re-fetch `GET /tickets/{id}?include=requester` → requester email/id (channel-trust → lower confidence). L2 gated off by default for this connection.

**Acceptance:**
- [ ] Poll path lists new customer replies and enqueues; agent/private/own messages ignored (loop-safety test over a fake Freshdesk server)
- [ ] Public reply + private note post correctly, attributed to the bot agent
- [ ] Identity is re-fetched server-side (never taken from an inbound payload); L2 account reads disabled by default for this connection
- [ ] `validate()` confirms the key; setup (agent API key, no webhook needed) documented
- [ ] L1 works end-to-end; suite + typecheck green

**Blocked by:** Issues 1, 2

---

### 6. HubSpot adapter (poll) — AFK

**What:** A HubSpot Conversations connection end-to-end via **polling** with a private-app token. Poll threads/messages (the beta thin-payload webhook is intentionally not used); loop-safety via `direction === INCOMING` **and** sender actor is `V-` (visitor/contact), skipping our own `I-{appId}` and agent `A-`; public reply `type: MESSAGE`, private note `type: COMMENT`, sent on a connected channel (`channelId` / `channelAccountId`); verified identity via Visitor-Identification **correlation** — trust only a `{ourUserId → email → contactId}` mapping recorded at token-mint time, never the thread's asserted email. L2 OFF by default.

**Acceptance:**
- [ ] Poll path fetches message bodies and applies `direction` + actor loop-safety (test over a fake HubSpot server)
- [ ] Public reply posts on a connected channel; private note posts as `COMMENT`, with a `ponytail:` comment naming the switch to the CRM Notes API for `HELP_DESK` threads after 2026-09-23
- [ ] Identity resolves only via the recorded verified mapping; a thread whose email we did not verify does **not** unlock L2 (test); L2 disabled by default
- [ ] `validate()` confirms the private-app token + scopes; setup (private app, scopes, connected channel) documented
- [ ] L1 works end-to-end; suite + typecheck green

**Blocked by:** Issues 1, 2

---

### 7. Console — multi-connection Connections UI — AFK

**What:** Extend the operator console so an operator can add, list, test, toggle, and disconnect **multiple** helpdesk connections over the `platforms[]` registry, reusing the existing neobrutalism Connections cards and the connect-button → setup-popup pattern. Adapters already work from `helpuit.config.yaml` + secrets; this is the UI surface over the same registry + `validate()`.

**Acceptance:**
- [ ] Connections page lists every configured helpdesk connection with per-connection Test (`validate()`), on/off toggle, and disconnect
- [ ] Adding a connection writes to the config store + encrypted vault (per-connection secrets) with the same live/restart semantics as existing connectors
- [ ] Per-platform setup steps surface via the existing connect → popup pattern (API key / token instructions)
- [ ] Suite + typecheck green; the existing single-Chatwoot flow still works

**Blocked by:** Issue 1
