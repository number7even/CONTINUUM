# VoiceCosmos ↔ CONTINUUM — the Role Handoff

_What the VoiceCosmos terminal must understand about CONTINUUM's role, and the exact
integration requirements. Same discipline as the Crooma/PodGeni handoffs: every ✅ names a
receipt; requirements carry owners. Companions: `ENTERPRISE-PROVISIONING-RUNBOOK.md`
(onboarding mechanics), `INDUSTRY_01_MOTORSPORT_STRATEGY.md` (the industry-pack thesis),
`CROOMA_INTEGRATION_LAUNCH_HANDBOOK.md` (the verification surface in depth)._

---

## 1. The role, in one paragraph

**VoiceCosmos is the industry runtime; CONTINUUM is the trust + memory spine underneath
it — never a module, never optional.** VoiceCosmos owns the agents (ARIA, SAGE, NOVA,
ORION, VEGA, LUMI), the runnable verbs, the SOPs, the HITL rules, and every guest-facing
surface. CONTINUUM owns four things VoiceCosmos must never rebuild: **(a) tenant-isolated
memory** (one property = one knowledge scope, cross-tenant structurally impossible),
**(b) the privacy choke-point** (guest PII scrubbed at write-time, by construction),
**(c) provenance + seals** (every fact citable to a stable Observation ID; every human
approval a cryptographic `type='decision'` record), and **(d) the verification surface**
(fail-closed, re-runnable checks that make "done" a proof, not an assertion). VoiceCosmos
makes the property talk; CONTINUUM makes it *trustworthy and unable to forget or lie*.

## 2. Identity — CORRECTED 2026-08-17 after VC-terminal schema audit

The original 1:1 "property = tenant" rule **contradicted the live VC schema** (verified
VC-side: 3,899 tenants; 34 properties across 15 tenants, max 14 per tenant; `tenant_id`
is the anchor across 77 tables; `workspace_id` does not exist there). Corrected rule:

- **The shared anchor is `tenant_id`:** VoiceCosmos `tenant_id` ≡ CONTINUUM `tenantId`,
  1:1, zero translation. (`workspace_id` is Crooma's name for the same slot — vocabulary,
  not a second scheme.) Every call carries the tenant JWT + `X-Continuum-Project`.
- **✅ ID-1 — LOCKED 2026-08-17 (founder, via VC-terminal session): the CONTINUUM tenant
  is the VC ORG (`tenant_id`), with `property_id` as first-class scoping metadata** on
  every Observation, filtered at retrieval. VC-1 (the tenant map) is unblocked on this
  basis. Recorded in `ARCHITECTURE.md §14`. Original decision framing kept below for the
  record: is the CONTINUUM tenant
  the VC **org** (`tenant_id`) or the **property**? **Engine recommendation: the org.**
  Rationale: the org is the legal/billing/liability boundary (matching Crooma's workspace
  and SM's studio); structural 404-isolation should separate *legal entities*, while
  **`property_id` becomes first-class scoping metadata** stamped on every Observation
  (hotel-kb ingest, ops events, seals) and filtered at retrieval — the same
  intra-tenant-scoping layer as the deferred role-loadouts. Cross-property visibility
  inside one org is then the org's policy choice, not a security hole. Alternative
  (tenant-per-property) forfeits group-level agents (a 14-property GM view would require
  14 tokens) and mints ~4k stores for ~34 active properties. **No VC-1 map is built until
  ID-1 is locked** — the VC terminal is right that building the map first builds the
  wrong map. Minting strategy either way: on activation, never pre-mint the long tail.

## 3. The live surface (✅ deployed, live-fire receipts)

- Engine: `https://api.continuum.rest` — JWT mode (RS256, per-tenant `tenant` claim),
  public JWKS at `/.well-known/jwks.json`. Shared bearer is retired.
- Tokens: minted **on-target** per property via `provision-tenant` (runbook §3) —
  founder-executed, delivered out-of-band, stored server-side only. One property = one token.
- Full client path: MCP over `/sse` (tools/resources/prompts). Scheduler-grade path:
  `GET /api/observation/:id` — seal projection only, 401/404 fail-closed (live-fire proven
  2026-08-08, witness `jit-probe-wave1-001`).

## 4. What flows INTO the brain (VoiceCosmos → CONTINUUM)

1. **Property knowledge** via the **`hotel-kb` adapter — already built in `packages/core`
   (✅):** PMS/property data, FAQs, policies → canonical Observations through
   `upsertObservation()`. Guest email/phone/card/passport/IBAN are redacted at the
   choke-point **before** embedding (`CONTINUUM_PRIVACY_PII=1` is MANDATORY on every
   VoiceCosmos tenant). Stable IDs make re-ingest idempotent. **Rule: VoiceCosmos never
   writes to a KB store directly — CONTINUUM owns ingestion,** because a directly-written
   KB would embed raw PII and carry no provenance (the adapter's own header says exactly this).
2. **Operational events** (bookings, recoveries, escalations) as Observations — the
   property's append-only operational memory, feeding digests and briefings.
3. **HITL decisions** — every human approval that gates money/publish/policy actions lands
   as a sealed `type='decision'` Observation with `operator` provenance. VoiceCosmos's
   existing HITL line ("voice proposes; approve is a human click; `approved_by_human`
   DB-enforced") maps 1:1 onto P9 seals — same law, now cryptographic.

### 4.1 The scrub boundary — RULING (2026-08-17, after cross-terminal review)

**CONTINUUM is the audit-and-memory spine, NOT the operational system of record.** The
choke-point scrubs **what enters the spine** (observations, KB content, anything that gets
stored or embedded). It does **not** reach into the runtime's operational tables — a front
desk must see who is in room 304; arrival boards, rosters, and reservation panels are the
runtime's SoR and display real names. A compiled pack that writes `[REDACTED:NAME]` into
an operational table has misplaced the boundary (an advisor-drafted spec did exactly this;
it was never engine canon and is refused).

Corollaries, binding:
- **Personal names are NOT a scrub pattern and must never become one.** The engine's
  patterns are secrets (11, always-on) + the opt-in guest-PII tier: **email, phone, card,
  passport, IBAN — exactly, nothing more** (`hotel-kb` header is the contract). A
  name-regex eats "Grand Ballroom" and "Signature Massage"; NER is wrong often enough to
  matter; and **over-redaction is silent damage** — nothing goes red, the KB just stops
  being able to answer. If name-minimization in *embedded* content is ever wanted, it is
  a deliberate future design (pseudonymization with a tenant-scoped lookup), not a
  pattern to sneak into the filter.
- **`property_id` is metadata, not a column, and nullable by meaning** (ID-1): an
  org-wide observation (a policy covering all properties) simply has no `property_id` in
  its metadata. Any draft schema making it a NOT NULL column contradicts ID-1.
- **Verification history is append-only** (Engine Obligations §1.5): one row per
  *execution*, never one row per task — a re-run must never overwrite its predecessor.

## 5. What flows OUT of the brain (CONTINUUM → VoiceCosmos)

1. **Grounded answers with citations:** ARIA retrieval follows Progressive Disclosure —
   Layer-1 search → Layer-2 timeline → Layer-3 fetch by explicit ID — and every guest-facing
   factual claim carries its Observation ID internally. No citation, no claim ("Library
   Truth": the agent answers from the property's verified KB, or says it doesn't know).
2. **Session briefings** (`continuum://session/briefing`) — the property's warm-start
   state for any agent session.
3. **Seal verification** — before any gated action executes, re-verify the decision
   against the live surface and **fail closed** (the Crooma wall pattern: gate on
   `decisionId` + hash, never on names, never on a cached copy).

### 5.1 The read path — BFF rule (RULING 2026-08-18)

**Browser panels never talk to the engine, and never hold the tenant JWT.** The read path
is: *panel (HTTP-only session cookie) → VC's own BFF routes (Next.js server — holds the
tenant JWT server-side, validates the user session, enforces the user's `property_id`
scope) → engine.* Shipping a tenant token into any browser context is a contract
violation on sight — it is also exactly the storage-API drift the projection guard fails
builds for. Precedent: the Brain console already works this way (`/api/ask` /
`/api/observation` are its own server routes).

**Cold start is a prerequisite, not a footnote:** a freshly minted tenant graph is empty;
the first `hotel-kb` ingestion run (from VC-1's source inventory) must land before any
panel projects, or the projection is an explicit absence-card by design.

**Two engine build items, sequenced post-Wave-1 (tripwired todos):**
1. `record_observation` — the generic event-ingest MCP tool (schema-free payload through
   the choke-point). Its Observation `type` is minted in the spine's contract anchor when
   the tool lands — never pre-specified in blueprints (§II.7 discipline).
2. The **Claim-Render Gate library** — engine-authored, VC-deployed (the ContinuumGate.js
   precedent): one implementation of certainty-grammar, consumed at the BFF/panel layer.
   Truth-semantics must never fork across teams.

## 6. The rules VoiceCosmos inherits (non-negotiable)

- **Honesty ledger discipline** — VoiceCosmos already lives this (`voiceos-ops`: runnable
  vs ⚪ CATALOG, "never claim a capability the code does not have"). CONTINUUM is the same
  law applied to *facts and memory*: odometer tags, verify-then-dissolve, receipts.
- **P9:** no auto-approve, ever; the leap is the human's. **P1:** tokens/secrets never in
  chat, argv, or client bundles. **P6:** every automation safely endable. **§II.10:** the
  permanent scraping ban binds all VoiceCosmos ingestion too — official APIs and compliant
  feeds only.
- **Never mint identity:** ids come from CONTINUUM Observations; don't invent parallel ids
  or side-channel stores. One brain per tenant, no shadow memory.

## 7. Requirements checklist (owners, like the Wave-1 handover)

- [ ] **VC-1 (VoiceCosmos):** produce the property→tenant map (slug per property) and the
  inventory of data sources for `hotel-kb` ingestion (PMS export, FAQs, policies).
- [ ] **VC-2 (VoiceCosmos):** wire agent retrieval to the MCP surface (search → timeline →
  fetch) and adopt the citation discipline in ARIA's answer path.
- [ ] **VC-3 (VoiceCosmos):** route every HITL approval through a seal write; verify seals
  before gated actions execute (fail closed).
- [ ] **VC-4 (VoiceCosmos):** set `CONTINUUM_PRIVACY_PII=1` on every tenant environment —
  a launch-blocking requirement, not a preference.
- [ ] **F (Founder):** mint per-property tenants on-target (runbook §3), deliver tokens
  out-of-band.
- [ ] **E (Engine):** verification-only, as ever — first live property ingest gets the same
  countersign treatment as every other seam (re-run the ingest idempotently, probe a cited
  answer back to its Observation ID).

## 8. What is deliberately NOT in this handoff (sequenced, not forgotten)

Role-scoped loadouts (front-desk sees only front-desk SOPs), the Industry Pack compiler,
and the spoken ARIA briefing (Voice Mediator persona) are 🔴 V1.5+ — parked behind Wave-1/2
closure per the standing rule. **Today's integration is: tenancy + hotel-kb ingest +
grounded retrieval + seals.** That alone replaces "session amnesia + hallucinated policy
answers + unaudited approvals" — the whole reason this spine exists.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
