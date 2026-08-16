# The Three-Layer Engine — KAIZAN · VoiceCosmos · CONTINUUM

_Confirmed marketing/architecture copy, audited claim-by-claim against the codebase and
live infrastructure on 2026-08-16. House rule applies to marketing like everything else:
**every claim below carries a receipt or a tag.** Receipts appendix at the end._

---

## The one-paragraph pitch

By separating the **business rules** (KAIZAN, a versioned playbook library), the
**workforce** (VoiceCosmos, AI agents + human craftsmen), and the **verifiable truth
ledger** (CONTINUUM, tenant-isolated memory with cryptographic proof), we operate a
unified, industry-agnostic engine. Launching a winery, an F1 paddock, or a boutique hotel
doesn't require a software rewrite — it requires applying a different playbook to the same
pre-built architecture. ~25 industry playbooks are already authored and versioned.

```
     KAIZAN  (git playbook canon — github.com/number7even/kaizan)
               │  compiles into roles, verbs, gates   [compiler: roadmap;
               ▼                                       founder-driven today]
     VoiceCosmos  (active agents + humans, HITL discipline)
          │            ▲
          │ (MCP/REST) │ (Progressive Disclosure L0→L3)
          ▼            │
     CONTINUUM  (isolated per-tenant SQLite/RuVector memory + seals)
```

## I. Identity — the tenant routing anchor ✅

One property = one canonical ID: VoiceCosmos `workspace_id` ≡ CONTINUUM `tenantId`, 1:1,
zero translation. Every agent call carries the tenant's RS256 JWT (validated against the
engine's public JWKS at `/.well-known/jwks.json`) plus `X-Continuum-Project`. The engine
scopes every query to that tenant's path-isolated store
(`$CONTINUUM_DATA_DIR/<tenantId>/`). Cross-tenant leakage is **structurally impossible** —
separate database files on disk, wrong-tenant reads return 404 by construction.

## II. Ingestion — the privacy choke-point ✅ engine · 🟡 VC wiring

Agent activity (calls, bookings, files) compiles into canonical Observation payloads sent
over MCP. Before ANY record reaches the database or the vector index, it passes the single
write choke-point: an 11-pattern scrub (cards, JWTs, API keys, guest PII → `[REDACTED:
<label>]`). Only scrubbed data can exist in memory — a KB written directly would embed raw
PII, which is why the spine owns ingestion. _(Engine + `hotel-kb` adapter: built ✅.
VoiceCosmos-side event hooks: integration checklist VC-1..4, in progress 🟡.)_

## III. Verification — "verify-then-dissolve" ✅

Agents are prone to claiming "done" to satisfy the prompt. Here, an agent **cannot** flip
a task to DONE. Every task carries a `verifyCommand` — a file check, DB query, or curl
probe — executed in a local shell under strict timeouts (30s CLI / 120s MCP). Exit 0 is
the only path to green. "Done" is a passing command, not an assertion.

## IV. The human gate (P9) + JIT verification ✅ (live-fire proven)

High-stakes actions (refunds, contracts, publishing) are structurally blocked from
autonomous execution — no auto-approve toggle exists. A human's Accept in the review
lifecycle writes an immutable `type='decision'` Observation carrying a cryptographic
`contentHash` re-derived from the exact approved brief, with the operator's name as
scrub-exempt provenance. Immediately before any real-world execution, the scheduler
re-verifies against the live engine (`GET /api/observation/:id`) — unsealed, tampered,
wrong-verdict, or unreachable ⇒ **fail closed, abort.** _(The Pulse return-path that
feeds approvals is in code; a visual Kanban cockpit for it is 🔴 roadmap.)_

## V. The closed loop (the moat) — ✅ built · 🟡 awaiting live fuel

```
 1. COMPILE  KAIZAN playbooks → agent behaviors, gates, SLAs
 2. EXECUTE  VoiceCosmos agents run the flows; humans hold judgment slots
 3. PROVE    CONTINUUM stamps outcomes via deterministic exit codes + seals
 4. MEASURE  every distributed asset carries its Observation ID (1:1 chain of custody)
 5. LEARN    engagement telemetry returns as ground_truth → re-weights the 6-D ranker
```

Agents propose tirelessly; humans seal; sealed bundles execute fail-closed; telemetry
walks back to its origin ID; rewards re-weight tomorrow's proposals (bounded 0.8–1.3 — a
nudge, never an override of the human gate). _Every stage is built and gate-proven; the
loop runs on live fuel the moment the first partner telemetry endpoint hands over
credentials (armed, tripwired)._

## The closing claim

Every agent decision, every human approval, and every system action is bound to a single
append-only, hash-chained, re-runnable record. We don't ask customers to trust the AI —
we hand them the ledger.

---

## Appendix — receipts (why this copy is allowed to exist)

| Claim | Receipt |
|---|---|
| JWT mode, public JWKS, tenant-scoped 404 | live-fire probe 2026-08-08, witness `jit-probe-wave1-001` |
| 11-pattern scrub at `upsertObservation` | `observation.ts` + privacy smoke (13 checks) |
| `hotel-kb` ingestion adapter | `packages/core/src/hotel-kb.ts` (built) |
| verifyCommand exit-0 discipline | `cli/index.ts:949` (30s) · `tools/validate.ts:53` (120s) |
| P9 seal + operator provenance | live seal `b782052e…` (`verdict=accept`, `operator=riaan`) |
| JIT fail-closed endpoint | `GET /api/observation/:id`, hash re-derivation match on the public wire |
| Sealed bundle chain of custody | `campaignHandoff` export, `chainUnbroken:true`, 8/8 gate |
| Ranker re-weight bounds 0.8–1.3 | `feedbackWeight()`, telemetry-sync 10/10 |
| ~25 authored industry playbooks | `github.com/number7even/kaizan` (versioned 2026-08-16) |
| Engine substrate | 44 deterministic gates in `make smoke` |

Corrections applied during confirmation (P4): "sandboxed shell" → local shell w/ timeouts;
Pulse cockpit UI tagged roadmap; LEARN stage tagged awaiting-live-fuel; KAIZAN compiler
tagged roadmap (compilation founder-driven today).

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
