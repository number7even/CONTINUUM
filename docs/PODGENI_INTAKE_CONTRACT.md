PodGeni / Cadence — Campaign Intake Contract

_What to communicate to the PodGeni team so their intake schedules a sealed asset without tripping (or
weakening) the tamper-proof wall. Wave 1, PodGeni side._

---

## 0. The one rule that governs everything
**The seal lives in Continuum. You REFERENCE it — you never re-implement it.** The tamper-proof
guarantee is a cryptographic `contentHash` that re-derives to a human's sealed decision. Do **not**
re-express it as a Firebase/Supabase security rule — rules protect billing (mutable config); the hash
chain is the moat (immutable, re-derivable, auditable). If you re-implement it, CROOMA loses its wedge.

---

## 1. What you receive — the sealed bundle
`campaignHandoff(approvedDraftId)` (Continuum/AMF side) emits exactly this on a sealed, approved,
untampered asset — and **refuses** to emit for anything else:

```jsonc
{
  "ok": true,
  "decisionId": "…",            // the type='decision' Observation id (the P9 witness)
  "decisionProject": "amf",     // which Continuum project the decision lives in
  "contentHash": "sha256:…",    // binds the EXACT approved asset (re-derivable)
  "verdict": "accept",          // the human decision
  "operator": "riaan-k",        // WHO leapt — scrub-exempt provenance
  "sealedAt": "2026-…Z",        // when
  "asset": { "id": "…", "slug": "voicecosmos", "brief": { … } },
  "sourceChain": [              // self-contained, cross-project chain of custody
    { "role": "decision", "id": "…", "project": "amf" },
    { "role": "draft",    "id": "…" },
    { "role": "signal",   "id": "…", "project": "…", "sourceId": "googlenews", "url": "https://…", "title": "…" }
  ],
  "chainUnbroken": true
}
```

If `ok` is `false`, the bundle carries a `reason` (unsealed / seal-doesn't-bind / tampered) — **do not
schedule it.**

---

## 2. What your intake MUST enforce (the wall — mirror ours)
Before `createCampaign` schedules anything:

1. **Reject `ok:false`.** No bundle, no schedule.
2. **Re-derive the `contentHash`** over the exact asset you're about to schedule, through the *same*
   canonical hash Continuum used (`sha256` of the canonical JSON of `asset.brief`). If it ≠
   `bundle.contentHash` → **the asset was altered after approval → REJECT.**
3. **Confirm the `decisionId` resolves** to a real `type='decision'` Observation in Continuum whose
   `metadata.subject.contentHash === bundle.contentHash` (i.e. the seal binds *this* asset). Via the
   Continuum MCP/HTTP surface (`continuum_get_observations`), tenant-scoped. → else REJECT.

   **Seam-1 REST payload contract (live + live-fire-proven 2026-08-08 — the exact wire shape):**
   ```
   GET https://api.continuum.rest/api/observation/{decisionId}
   Authorization: Bearer <your tenant RS256 JWT>     # minted on-target; JWKS is public at
                                                     # /.well-known/jwks.json (shared bearer is RETIRED)
   → 200 (seal found in YOUR tenant):
   {
     "id": "<decisionId>", "type": "decision", "sourceId": "authorship",
     "timestamp": "…", "refs": ["…"],
     "contentHash": "<sha256>",                     // top-level convenience copy
     "subject": { "contentHash": "<sha256>" },      // ← THE gate field: compare to your re-derived hash
     "verdict": "accept", "operator": "<human who leapt>"
   }                                                 // NEVER contains raw content (P1)
   → 401 bad/absent token · 404 unknown id OR another tenant's id → in every non-200 case: FAIL CLOSED.
   ```
   Source of truth: `packages/mcp-server/src/http.ts` (`GET /api/observation/:id`). Fields beyond
   these do not exist — do not wait for them.
4. **Store the `decisionId` + `contentHash` as the asset's immutable provenance stamp** — the
   scheduler's "immutable provenance" IS this witness. Reference; never recompute a new seal.

> **Test to pass (your side, mirroring verify-campaign-handoff):** a sealed bundle schedules; an
> unsealed one is refused; a post-approval edit to the asset is refused (hash no longer re-derives).

---

## 3. The primitive — gate on the RIGHT field
- ✅ Gate on **`decisionId` + `contentHash`** (from the `type='decision'` Observation).
- ❌ Do **NOT** gate on `StateEntry.acceptedBy`. That field is reserved for product-state milestones
  (deployments), not content drafts. If you expect `acceptedBy`, you will **reject every AMF asset.**

---

## 4. The Creative Genome — `sourceId` = Continuum id (1:1)
Your Genome's stable `sourceId` tags **must be the Continuum Observation ids** from `sourceChain`, not
new ids you mint. That makes the chain of custody walk unbroken:
```
published post → decisionId (P9 approval) → draft id → signal id → origin (sourceId + url)
```
When you measure engagement on a post, you can walk straight back to the exact source insight.

---

## 5. The learning-loop return (Wave 2 — the Continuum half is BUILT + gate-green)
When you detect which asset/style drove engagement, send it to Continuum as an **engagement-telemetry
event** and Continuum turns it into a `ground_truth` Observation (tenant-scoped, `refs: [decisionId,
signalId]`) that `content-matcher.mjs` `feedbackWeight()` re-weights the 6-D ranker with — so tomorrow's
drafts lean toward what worked. Don't build a parallel analytics store; feed the brain.

The Continuum-side ingest is real and proven, not a promise: **`apps/amf/worker/telemetry-sync.mjs`**
(shape in `contracts.mjs` → `GenomeTelemetry` + `engagementReward`). Its `--smoke` gate proves the FULL
loop against a fixture — telemetry → `ground_truth` → the same signal's rank measurably rises (fb 1→1.3)
— and it stays gated on `PODGENI_TELEMETRY_URL` + `PODGENI_TELEMETRY_KEY` until your half lands (P4/P6:
wired, proven our-side, writes nothing live without the key).

**Direction (do not build a POST client): Continuum PULLS.** You **expose** the endpoint below and
serve events from it; `telemetry-sync.mjs` polls it on a schedule. There is **no** Continuum intake
route to POST to — a push client fires at a non-existent path.

**Seam-2 REST payload contract (the exact wire shape `telemetry-sync.mjs` calls):**
```
GET {your-base}/api/genome/engagement?tenant_id=<workspace_id>&since=<ISO8601>&limit=40
x-telemetry-key: <the shared scoped key>          # header auth — reject requests without it
→ 200: either a bare JSON array of events, or { "events": [...] }
       ({ "telemetry": [...] } / { "items": [...] } also accepted — pick ONE and stay stable)
```
Query params: `tenant_id` (note: NOT `tenant`), `since` (return events after this timestamp —
enables incremental polling), `limit`. Idempotency: stable per-event `id` — Continuum upserts, so
re-serving an event is safe; renaming its `id` double-counts it.

**Event shape** (serve one event per asset, the moment you have measured engagement):
```jsonc
{
  "id": "<stable per-event id>",        // idempotency key
  "decisionId": "<from sourceChain>",   // → refs (the seal this asset ran under)
  "signalId":   "<from sourceChain>",   // → refs (the origin news article)
  "score": 0.0,                          // OPTIONAL normalized [0,1]; wins over raw metrics
  "impressions": 5000, "engagements": 600, "conversions": 4,   // else reward derives from these
  "summary": "what the asset was about", // carries the terms the ranker matches on
  "style": "testimonial",                // the Creative Genome variant that ran (what we learn about)
  "product": "voicecosmos", "tenant_id": "<workspace_id>", "asset_id": "<yours>"
}
```
Reward maps into the SAME `0.2..1.0` band as a human HITL decision (a `score` wins; else
`engagements/impressions` vs an 0.08 target rate; any conversion pins to 1.0) — a transparent heuristic,
not a claimed model. No measurable signal → reward `null` → nothing written (no noise in the brain).

---

## 6. Identity & transport
- **Tenant:** `workspace_id === Continuum tenantId`. Pass it on every call. One workspace = one brain.
- **Auth:** a scoped Continuum JWT (via `provision-tenant`) or the shared bearer — tenant-scoped either way.
- **Transport:** read the bundle + verify the decision via Continuum's MCP/HTTP endpoint (one
  authoritative source of truth), not a copied artifact.

---

## 7. What NOT to do (the failure modes)
- ❌ Re-implement the seal as a Firebase/Supabase rule. (Weakens the moat to mutable config.)
- ❌ Gate on `acceptedBy`. (Rejects every asset.)
- ❌ Mint your own `sourceId`s. (Breaks the chain of custody.)
- ❌ Schedule on `ok:false` or a hash mismatch. (Publishes an unauthorized/tampered asset.)
- ❌ Auto-publish a draft that was never human-approved. (Violates P9 — the leap is the human's.)

---

## 8. Definition of done (PodGeni side, Wave 1)
Given one **founder-approved** asset's bundle: `createCampaign` schedules it, stamps the `decisionId` +
`contentHash` as provenance, refuses an unsealed/tampered variant, and the scheduled post's `sourceId`
walks back to the origin news article. When that runs green in the pod-geni repo, Wave 1 is
end-to-end — and CROOMA's tamper-proof USP is verifiable across both halves, not just ours.
