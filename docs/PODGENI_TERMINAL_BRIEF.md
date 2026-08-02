<!--
  PodGeni Terminal Brief — the authoritative mission-order for the PodGeni agent (repo pod-geni, Firestore).
  PodGeni is a MODULE inside Crooma, not a standalone product. Companion docs:
  wire spec → docs/PODGENI_INTAKE_CONTRACT.md · product model → docs/CROOMA_TERMINAL_BRIEF.md ·
  amalgamation decision → docs/PRODUCT_AMALGAMATION.md · cross-repo ledger → docs/CROOMA_COORDINATION.md.

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# PodGeni Terminal Brief — Mission Order

_What the PodGeni agent (repo `pod-geni`) must KNOW and BUILD to align with the amalgamation. The wire
details live in `PODGENI_INTAKE_CONTRACT.md`; this brief is authoritative for **PodGeni's identity,
what it stops owning, and what it builds next.**_

> **One paragraph:** PodGeni is no longer a standalone product — it is the **campaign module inside
> Crooma**, riding the **Continuum AMF spine**. It stops owning auth, billing-identity, tenant identity,
> and any seal logic; it inherits them from the shell + spine. `workspace_id === Continuum tenantId ===
> ViWaGo tenant_id`, 1:1, one wallet, one brain. Wave 1 = build the intake wall (consume the sealed
> `campaignHandoff` bundle; gate on `contentHash`+`decisionId`, never `acceptedBy`; verify just-in-time
> and fail closed). Wave 2 = POST engagement telemetry back so the ranker learns. Tag every feature 🟡
> until your own gate proves it.

---

## I. The new reality (what the amalgamation changes about PodGeni)

PodGeni was a product; it is now a **module**. That deletes things from its roadmap — it **inherits**
them instead:

| PodGeni STOPS owning | Inherited from |
|---|---|
| Its own auth / login | the Crooma shell (runbook step 2) |
| Its own billing identity / tiers | the Crooma shell (step 3) — see the unified ledger below |
| Its own tenant-identity scheme | the spine — `workspace_id === tenantId`, 1:1, **no translation** |
| Any seal / tamper logic (Firestore rules) | the spine — reference `decisionId`/`contentHash`, never re-implement |
| A parallel analytics store | the spine — feed `ground_truth` back (§V), don't hoard |

PodGeni stays the **clean, replayable meter** and the campaign/Cadence execution surface. Its Firestore
project→identity collapses onto the `workspace_id` model. Its data folds into Crooma **LAST** (after
shell → auth → billing unify) — never front-loaded.

## II. The invariants PodGeni enforces (Wave 1)

1. **Identity — `workspace_id === Continuum tenantId` (1:1), no translation.** Same key is the IP moat,
   the billing wallet, and the knowledge scope.
2. **The wall.** Before `createCampaign` schedules: reject `ok:false`; **re-derive `contentHash`** over the
   exact asset (`sha256` of the canonical JSON of `asset.brief`) and compare to `bundle.contentHash`;
   confirm `decisionId` resolves to a `type='decision'` Observation whose `metadata.subject.contentHash
   === bundle.contentHash`. **Gate on `decisionId`+`contentHash`, NEVER on `acceptedBy`.**
3. **Verify just-in-time, fail closed.** Re-verify against the live engine **immediately before** the
   publishing API, and abort on failure OR unreachable engine. Two real surfaces (pick one):
   - MCP: `continuum_get_observations([decisionId])` over the authenticated `/sse` transport; or
   - REST: **`GET /api/observation/:id`** (tenant-scoped, read-only, returns the seal projection; `401`
     unauth, `404` unknown/cross-tenant). Built + gate-proven spine-side. Simpler for a scheduler with no MCP client.
4. **Reference the seal; never recompute one.** Stamp `decisionId`+`contentHash` as the scheduled asset's
   immutable provenance. The seal is a Continuum record — never re-express it as a Firestore/Supabase rule.
5. **Don't mint identity.** The published post's `sourceId` **is** the Continuum Observation id from
   `sourceChain` (`post → decisionId → draft → signal → origin`). New ids sever the Creative Genome.
6. **P9 — never auto-publish.** No "auto-approve" toggle. Publish consumes an already-sealed bundle or
   requires the human leap.

## III. The unified credits ledger — PodGeni's boundary (aligned with the committed schema)

PodGeni's `credit_ledgers/{workspaceId}` Firestore meter is the **local, replayable** side; the
**authoritative master** is Crooma/Supabase (event-sourced). This is architecturally sound and stays
inside the model: **RLS/Supabase protects billing (mutable config); the hash chain is the moat (immutable).**
The two never collide — billing is not the seal.

- Every debit is **one immutable, deterministically-keyed entry** (`render:cmpA:as1` / `amf:op_8f3d`) —
  no double-charge, balance = sum(entries). ✅ (matches B6.)
- `ref.sourceId` on **both** pipelines (render + AMF cognitive) is a **Continuum Observation id** — so cost
  joins the Creative Genome (which insight cost what, and via §V telemetry, what it earned). ✅
- Immutable entries → the Phase-4 fold is a **consolidation (replay), not a migration**. ✅

**Blocking dependency PodGeni is right to hold on:** the **AMF-usage sync contract** (how the Continuum
spine reports cognitive usage — `llm_tokens` / `tts_characters` / `search_requests`, keyed by
`workspace_id`, `ref: operationId + observationId` — so PodGeni can debit). This is a **Continuum-side
deliverable, currently 🟡 (strawman, uncommitted)** — tracked in `CROOMA_COORDINATION.md`. Do **not** wire
metering code against a strawman; wait for the committed, gate-proven contract. Holding is the correct call.

## IV. Definition of Done — PodGeni's own Wave-1 gate (the Odometer, made concrete)

Every feature in `pod-geni` is **🟡 REPORTED or 🔴 VISION until a re-runnable gate proves it ✅ VERIFIED.**
Wave 1 closes on the PodGeni side when a gate (mirroring `verify-campaign-handoff.mjs`) proves, given one
**founder-approved** bundle: `createCampaign` schedules it + stamps `decisionId`+`contentHash`; an unsealed
or tampered variant is **refused**; the scheduled post's `sourceId` walks back to the origin article.
Until that exit-0 gate exists in the repo, PodGeni's intake is a claim, not a fact.

## V. What PodGeni owes the loop (Wave 2)

Once you measure engagement, **POST an engagement-telemetry event** back per `PODGENI_INTAKE_CONTRACT.md`
§5 — `refs:[decisionId, signalId]` from the `sourceChain`, one event per asset. The Continuum half is
built + gate-green (`telemetry-sync.mjs`); the loop only closes when PodGeni emits. Reward derives
spine-side (a transparent heuristic, not a claimed model). Feed the brain; don't build a parallel store.

## VI. Do NOT (the failure modes)
- ❌ Re-implement the seal as a Firestore/Supabase rule. ❌ Gate on `acceptedBy`. ❌ Mint your own
  `sourceId`s. ❌ Schedule on `ok:false` or a hash mismatch. ❌ Auto-publish an unapproved draft (P9).
- ❌ Build your own auth / billing-identity / tenant scheme (inherit them). ❌ Wire metering against the
  uncommitted AMF-usage strawman. ❌ Fold PodGeni data before shell/auth/billing unify.
