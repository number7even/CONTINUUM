# The Tenant Feature Catalog — what a Brain actually comes with

_The deep dive for onboarding, sales, and the upsell ladder: every capability a tenant's
Brain ships with, derived from the **24 live tool modules** in `packages/mcp-server/src/tools/`
(audited 2026-08-11) plus the 4 resources and 2 prompts — not from a roadmap. **Access
honesty:** every feature below is ✅ live on the engine *today* for any tenant using an
AI client over MCP (Claude, Cursor, ARIA); the **web-shell surfaces** for non-technical
staff are the 🔴 build (BFF + tenant brain page + panels). Same engine, two doors — one
door is open now._

---

## Pillar 1 — Memory & Knowledge (the core moat)

| Feature | Tools | What the tenant gets |
|---|---|---|
| Sovereign knowledge base | `hotel-kb` (core adapter), choke-point | Their manuals/rooms/policies as citable, PII-scrubbed, idempotently-refreshable records in files only they can reach |
| Search → context → fetch | `search_docs`, `timeline`, `get_observations` | Progressive Disclosure: answers grounded in *their* corpus with Observation-ID citations — "the AI that can say which page" |
| Ask with grounding | `ask_context`, `codebase_context` | Question in, cited answer out, scope-limited to their tenant |
| Living documents | `documents` (create/get/list/search/update + **templates**) | A doc system *inside the brain*: SOPs, briefs, runbooks — versioned as observations, searchable with everything else |
| The universe | `graph` (+ the Brain UI) | Their whole operation as an explorable 3D graph — the demo that closes deals |

## Pillar 2 — The Task System (verify-then-dissolve — nobody else has this)

| Feature | Tools | What the tenant gets |
|---|---|---|
| Proof-gated todos | `create_todo`, `update_todo`, `get_todos` | Tasks that **cannot be marked done by assertion**: each carries a `verifyCommand`; done = the check exits 0. "Did housekeeping actually close the audit?" becomes a re-runnable fact |
| Dependency DAG | `blockedBy[]` on every todo | Real operational sequencing — downstream tasks auto-gate on upstream proof |
| What's next | `next_tasks` | The engine answers "what should this team do now" from the live pipeline, not a stale board |
| Auto-resolution | tripwire pattern | Todos with witnesses close *themselves* when reality changes — the system notices completion |

## Pillar 3 — Decisions, Approvals & Provenance (the liability shield)

| Feature | Tools | What the tenant gets |
|---|---|---|
| Sealed approvals (P9) | `record_decision` | Every human sign-off becomes a cryptographic record: verdict + operator + contentHash binding the exact artifact approved. Who approved the refund/the post/the exception — provable forever |
| Attestation | `attest` | "I witnessed X" as a first-class, timestamped, scrubbed record |
| Claims with receipts | `open_claim`, `validate` | Structured claims that carry their own verification command — the anti-"someone said it's handled" |
| Tamper-evident history | `record_checkpoint`, `snapshots`, `get_state` | Hash-chained state ledger: the org's history cannot be quietly rewritten; corrections are new records |
| Right to forget | `delete_observation` | The one sanctioned mutation — incident response / GDPR erasure, logged as an act |

## Pillar 4 — Brand & Voice Integrity (the publish gate)

| Feature | Tools | What the tenant gets |
|---|---|---|
| Brand DNA on record | `record_brand_dna` | The org's positioning, promises, and non-negotiables as canonical records |
| Publish identity gate | `check_brand` | Anything about to ship is checked against prior commitments — surfaces contradictions with citations *before* they're public. (This gate cleared your first sealed post) |

## Pillar 5 — Rhythm & Learning (the compounding layer)

| Feature | Tools | What the tenant gets |
|---|---|---|
| Daily digest | `get_digest` | What happened, distilled, per tenant |
| Warm starts | `continuum://session/briefing` (+ `session_start` prompt) | Every agent session opens already knowing the org's state — session amnesia is structurally gone |
| Session review | `session_review` | What a work session actually did, as records |
| Kaizen ledger | `kaizen_record` | Continuous-improvement entries as first-class memory — the org learns on purpose, and it's auditable |
| The reward loop | `ground_truth` → `feedbackWeight` | Usage and outcomes re-weight what surfaces (Wave-2 machinery; arming) |

## The tiering skeleton (commercial layer — price the pillars, not the tools)

- **Every tenant, day one:** Pillar 1 + the DAM (the "brain + library" base promise).
- **Operations tier:** Pillar 2 + 3 (proof-gated tasks, sealed approvals, the audit ledger)
  — sold to whoever owns liability.
- **Brand tier:** Pillar 4 + AMF content loop (drafts → their P9 queue → rendered assets).
- **Intelligence tier:** Pillar 5 learning + voice (the Mediator, when it lands) + the
  universe on their own subdomain.

_Rule that binds the catalog (Engine Obligations): sell capability with receipts; anything
whose receipt doesn't exist yet is sold as roadmap, tagged, or not sold at all._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
