<!--
  PodGeni / Cadence — Campaign Intake Contract. What the PodGeni team must build to consume a sealed
  AMF asset and schedule it without breaking the tamper-proof guarantee. This is the OTHER half of the
  campaignHandoff seam (the CONTINUUM half is ✅ verified — verify-campaign-handoff, 8/8).

  Source of truth for the bundle shape: apps/amf/worker/campaign-handoff.mjs (campaignHandoff()).
  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# PodGeni / Cadence — Campaign Intake Contract

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

## 5. The learning-loop return (Wave 2, but design for it now)
When you detect which asset/style drove engagement, write it back to Continuum as a **`ground_truth`
Observation** (tenant-scoped, `refs: [decisionId, signalId]`). Continuum's `content-matcher.mjs`
`feedbackWeight()` already reads co-located `ground_truth` and re-weights the 6-D ranker — so
tomorrow's drafts lean toward what worked. Don't build a parallel analytics store; feed the brain.

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
