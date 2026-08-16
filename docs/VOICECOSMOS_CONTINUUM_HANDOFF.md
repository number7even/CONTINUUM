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

## 2. Identity — the one rule that carries everything

**One property = one workspace = one Continuum tenant: `property_id === workspace_id ===
tenantId`, 1:1, zero translation** (same law as Crooma's `workspace_id` and StudioMunich's
`studio_id`). Every call carries the tenant JWT + `X-Continuum-Project`. A property's ARIA
can never read another property's memory — not by policy, by 404.

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
