# Capability ladder

Helpuit boots with **nothing** configured and gets more capable as you connect more.
Each rung is independent — connect only what you need. Configure everything in the console
(no file editing); a one-click **Restart now** applies anything that needs it.

## The ladder

| Connect (in the console) | Unlocks | Tier |
| --- | --- | --- |
| **Nothing** | The app boots, the operator console is reachable (admin token printed at first boot), and the Setup checklist tells you exactly what's left. | — |
| **An LLM provider + key** | The agent can reason and reply. *Test LLM* makes a real completion call. | — |
| **Chatwoot** (URL + token → validate, auto-setup bot + webhook) | The agent reads and replies to real customer conversations. | intake |
| **GitHub** (App or token) + a **feature manifest** (auto-drafted from your repo, editable in the console) | **L1 grounding in your real source code**, **L3a static investigation** (resolve the feature, read its code, form a hypothesis), and **L4 escalation** (dedupe, file a redacted GitHub issue, link duplicates). | L1 / L3a / L4 |
| **Docs** (paste/upload, or point at repo markdown) | **L1 grounding in your product docs** alongside the code. | L1 |
| **Account data** (read-only query routes — e.g. the Supabase Edge Function scaffold) + **customer identity** (HMAC / JWT / endpoint, with the Chatwoot token hand-off) | **L2 account investigation**: the agent reads the *verified* customer's real account state through founder-approved, column-allowlisted routes (never raw SQL, identity always from a verified token). | L2 |
| **Reproduction** (`playwrightEnabled` + sandbox credentials) | **L3b dynamic reproduction**: drives your app in a real browser as a sandbox account to confirm a suspected bug, capturing evidence. | L3b |

## How escalation climbs

A customer message only goes as far up as it needs to:

**L1 Guidance** (docs + code) → if low-confidence and account data is connected, **L2
account investigation** → if the account doesn't explain it, **L3a static investigation**
→ a suspected bug optionally **L3b reproduces** → **L4** dedupes and files/links a redacted
GitHub issue, then tells the customer.

Cross-cutting (always on): cost caps, redaction + encryption, retention, observability,
the async queue, and founder takeover.

## Minimum to do the bare job

A grounded answer plus a filed issue needs only: **Chatwoot**, **GitHub**, an **LLM key**,
and **customer identity** — see the [README quick start](../README.md#minimum-config).
Everything above L1 is an optional rung.
