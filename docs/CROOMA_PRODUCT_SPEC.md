<!--
  CROOMA & the CONTINUUM ecosystem — Product + Architecture Spec (alignment draft, rev 2)
  Rev 2 corrects rev 1's category error: CROOMA is NOT the umbrella — it is a distinct product
  surface (Continuum Visual Ops). The ecosystem is HUB-AND-SPOKE: CONTINUUM is the brain; CROOMA
  and Cadence are separate consumer products that plug in. (Decision: Option B, 2026-07-25.)

  Discipline: the Honest Odometer. Every capability is tagged
    ✅ VERIFIED  — proven on disk in THIS repo (gate-backed, gate named)
    🟡 REPORTED  — a real capability in a SEPARATE repo/deployment (crooma.cloud / pod-geni), not verifiable here
    🔴 VISION    — designed / intended / not yet built anywhere
  If it isn't tagged, it isn't a claim.

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# CROOMA & the CONTINUUM Ecosystem

_Product + architecture spec · rev 2 (hub-and-spoke) · 2026-07-25_

---

## Read first — naming & topology

Rev 1 called CROOMA "the collective." **Wrong.** The corrected topology is **hub-and-spoke**:

```
        crooma.cloud                          pod-geni-web
   (Next.js 14 · Supabase · Vercel)     (React · Firebase)
   ┌───────────────────────────┐        ┌───────────────────────────┐
   │  CROOMA / CVO  🟡          │        │  Cadence / PODGENI  🟡     │
   │  Continuum Visual Ops      │        │  Campaign Engine           │
   │  Assets·Galleries·Workflows│        │  produce·distribute·measure│
   │  ·Portals·PIM              │        │  (Creative Genome)         │
   │  ▸ flagship: studioMunich  │        └────────────┬──────────────┘
   └────────────┬──────────────┘                     │
                │   Continuum Adapter Seam            │  campaignHandoff seam
                │   (Source/Sink · tenant-scoped)     │  (AMF → schedule)
                ▼                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  CONTINUUM  —  the AI brain + trust engine  (the HUB)   ✅        │
   │  continuum.rest · multi-tenant isolation · canonical Observation │
   │  model · MCP tools · Truth + Authorship ledgers · privacy        │
   │  choke-point · AMF (autonomous content factory)                  │
   └─────────────────────────────────────────────────────────────────┘
```

| Thing | What it is | Role |
|---|---|---|
| **CONTINUUM** (continuum.rest) | the AI brain + trust engine + AMF | **HUB** — the platform every product plugs into |
| **CROOMA / CVO** (crooma.cloud) | voice-native Visual Ops: DAM, proofing, workflows, governance, commerce | **SPOKE** — a consumer product surface |
| **Cadence / PODGENI** (pod-geni) | the Campaign Engine: produce → distribute → measure | **SPOKE** — a consumer product surface |
| **StudioMunich** (studiomunich.digital) | consented digital-talent marketplace | **CROOMA's flagship vertical** (on CROOMA's PIM) **AND** the AMF's rights **supplier** (VAULT) — a separate legal entity either way |
| The 14 portfolio brands | voicecosmos, sekago, … | **tenants** served across the spokes |

**Decision (Option B, 2026-07-25):** CROOMA and Cadence are **two distinct products** on CONTINUUM,
each with its own adapter seam — **not** one merged product. Deeply integrated at the brain (shared
Observation graph → provenance walks across both), cleanly decoupled at the surface (independent
stacks, deployments, personas, billing, liability).

---

# PART 1 — EXECUTIVE SUMMARY

## CROOMA in one line
> **Continuum Visual Ops** — a voice-native visual-collaboration + asset-ops + commerce platform:
> *picdrop + a website builder + NotebookLM*, evolving into an **operating system for selling.**

It runs a guided operational loop — ingest assets → AI generation → human approval → storefront
assembly → performance measurement — for **photographers, creative agencies, and hospitality brands**
who share brand assets and specs with suppliers. Its flagship vertical is **studioMunich.digital**, a
consented digital-talent marketplace where brands license digital faces and voices.

## The moat
Generic AI tools are black boxes that fail at **governance**. CROOMA's moat is **trusted brand
governance + actionable automation + closed-loop optimization**, and — because it rides the CONTINUUM
brain — client selections/annotations don't die in email threads; they become **searchable,
summarizable knowledge** with **rights handling, auditability, and tamper-proof provenance**. Premium
clients value operational control + auditability over raw generation speed. That control is the wedge.

## Why hub-and-spoke wins
CONTINUUM being the shared brain means the "operating system for selling" continuity is delivered by
**data**, not by a monolith: a gallery proofed in CROOMA and a campaign scheduled in Cadence hang off
the **same Observation ids**, so provenance walks across both products — while each stays independently
shippable and liability-isolated.

## Honest-odometer caveat (P4)
CONTINUUM (the hub) + AMF are **✅ verified on disk** (41 gates). CROOMA and Cadence are **real but
separately-deployed products** (🟡) — their internals are not verifiable from this repo. The adapter
seams that marry them are the work; one (campaignHandoff, Cadence side) is ✅ built here, the rest are
designed. Section 5 is the exact map.

---

# PART 2 — CROOMA (CVO) PRODUCT SPEC  🟡 REPORTED (separate repo)

_Reported from the CROOMA product definition; not gate-verified from this repo._

## 2.1 Tech stack
- **Framework** — Next.js 14 (App Router), strict TypeScript.
- **Styling** — Tailwind CSS, Inter font, clean white-enterprise theme.
- **Data & Auth** — Supabase (Postgres, Row-Level Security, Storage, Auth).
- **Hosting** — Vercel (git auto-deploy from `main`), domain `crooma.cloud`.

## 2.2 Multi-tenancy & content scoping
- **Tenancy anchor** — a **workspace = a tenant**; the rule `workspace.slug === content site_key`
  scopes all content (folders, pages, menus, stories) to the active tenant with no per-table id migration.
- **AI knowledge scope** — strictly `workspace_id (CVO) === workspace_id (CONTINUUM)`: one tenant = one
  perfectly isolated brain. _(this maps 1:1 onto CONTINUUM's verified `openStorage(tenantId)` — §4.)_

## 2.3 The five modules (the end-to-end workflow)
| Module | Job |
|---|---|
| **VisualOps.Assets** (DAM foundation) | source-of-truth: uploads (RAW/MP4/…), metadata, versioning; syncs Google Drive + Photos; CMS (Story Studio w/ browser voice dictation, website publishing) |
| **VisualOps.Galleries** (Proof & Present) | the proofing-loop MVP: clients rank (1st/2nd/3rd), color-flag, annotate (text / freehand / voice); deliver in Presentation mode |
| **VisualOps.Workflows** (Approvals) | review states (draft → approved); a client selection locks a spec + creates an editing handoff |
| **VisualOps.Portals** (Brand governance) | branded access on the tenant's own site; a **recursive share-graph** where onward shares **narrow** permissions (creator → client → contractors) |
| **VisualOps.PIM** (Product info & commerce) | links visual variants to configurable items, catalogs, SKUs, royalty terms — the commerce engine that powers studioMunich's **face+voice SKUs** |

---

# PART 3 — CADENCE / PODGENI (the other spoke)  🟡 REPORTED

Deployed to `pod-geni-web` (React/Firebase) — a separate codebase; internals not verifiable here.
- **`createCampaign`** — server-authoritative; packages an episode's output into a tamper-proof
  campaign; flattened, individually-schedulable asset model w/ per-asset security rules.
- **Scheduler** — publishes on a lexicographic-UTC cadence; stamps immutable provenance.
- **Marketing Calendar** — drag-to-schedule. **Creative Genome** — tags every artifact w/ a stable `sourceId`.
- Reported proof: 41/41 emulator security tests; serving on `pod-geni-web.web.app`.

---

# PART 4 — CONTINUUM (the hub)  ✅ VERIFIED (41 gates) + the adapter seam

## 4.1 The brain + trust engine
- **Multi-tenant isolation** — `openStorage(tenantId)`; cross-tenant retrieval structurally impossible;
  adversarial ids rejected. _(verify-tenant-isolation)_
- **Canonical Observation model** — `sourceId` = origin, `id` = artifact, `refs` = edges. The chain-of-
  custody substrate.
- **Privacy choke-point** — every write deep-scrubs secrets + (tenant mode) guest PII before storage/
  embedding. _(verify-hotel-kb, privacy-smoke)_
- **Authorship (decision) Ledger** — a human P9 approval → immutable `type='decision'` Observation,
  `contentHash` computed scrub→hash→store, tamper-detectable; operator = scrub-exempt provenance.
  _(verify-decision-seal, 14/14)_
- **Truth Ledger** — multi-signature A·V·T·H verdicts. _(verify-truth-ledger)_
- **AMF** — ingest → 6-D rank → story-freshness dedup → draft → P9 seal. Live queue collapsed **301→66**.
  _(verify-dedup, verify-matcher-dedup, verify-decision-seal)_
- **Concierge provisioning** — `provision-tenant` mints a scoped RS256 JWT the engine validates.
  _(verify-tenant-jwt, verify-aria-live-loop)_

## 4.2 The Continuum Adapter Seam — CROOMA ↔ CONTINUUM
CROOMA is not a bespoke AI product; it rides CONTINUUM through the **same primitives ARIA uses.** No new
plumbing — a clean integration seam:

| CROOMA's spec | CONTINUUM primitive (✅ verified) |
|---|---|
| `workspace_id (CVO) === workspace_id (CONTINUUM)` | `openStorage(tenantId)` structural isolation |
| **Source Adapter** — a gallery selection/annotation → `observation {workspace_id, gallery, asset, actor, kind, payload, ts}` | the canonical Observation model + the adapter pattern, through the privacy choke-point |
| **Sink Adapter** — digests + semantic search back into CVO | MCP `continuum_get_digest` / `continuum_search_docs` / `continuum_ask_context` |
| **VoiceCosmos agent** — voice-native queries + actions ("export the selects") | an MCP client over the tenant-scoped JWT |

## 4.3 The campaignHandoff seam — AMF → Cadence  ✅ VERIFIED (CONTINUUM side)
The AMF→Campaign path (Cadence's, not CROOMA's): `campaignHandoff(approvedDraftId)` emits a sealed,
self-contained provenance bundle `{ decisionId, decisionProject, contentHash, verdict, operator,
sealedAt, asset, sourceChain }`. The wall: exports **only** a sealed, approved, untampered asset;
the `sourceChain` walks decision → draft → source signal → origin URL **across projects**.
_(verify-campaign-handoff, 8/8)._ Cadence's intake rejection is proven in the pod-geni repo against
this contract — 🟡 until then.

> **Locked primitive:** the seal is the `type='decision'` **`contentHash` + `decisionId`**, **NOT**
> `StateEntry.acceptedBy` (reserved for product-state milestones). Gate on the former or reject every asset.

---

# PART 5 — Honest odometer

| Capability | State | Evidence |
|---|---|---|
| CONTINUUM hub: isolation, privacy, ledgers, provenance, AMF | ✅ VERIFIED | 41 gates in `make smoke` |
| Decision seal = tamper-proof human approval | ✅ VERIFIED | verify-decision-seal (14/14) |
| Operator = scrub-exempt provenance (secrets still scrub) | ✅ VERIFIED | verify-decision-seal Part C |
| AMF dedup: live queue 301 → 66; no re-dupe | ✅ VERIFIED | dedup.mjs / verify-matcher-dedup |
| campaignHandoff export + wall (Cadence seam, CONTINUUM side) | ✅ VERIFIED | verify-campaign-handoff (8/8) |
| CROOMA (CVO) product — 5 modules, crooma.cloud | 🟡 REPORTED | separate repo (Next/Supabase/Vercel) |
| Cadence (createCampaign, scheduler, Genome) | 🟡 REPORTED | separate repo; 41/41 emulator; pod-geni live |
| Continuum Adapter Seam — CROOMA Source/Sink live wire | 🔴 VISION | maps to verified primitives; not wired |
| Cadence intake rejection of unsealed assets | 🟡 cross-repo | gates on the published contract; not provable here |
| studioMunich digital-talent commerce (PIM SKUs) | 🟡/🔴 | CROOMA's flagship vertical; VAULT rights supplier gated |
| Autonomous ad-buying (Wave 4) | ⏳ GATED | liability decision, withheld |

---

# PART 6 — Decisions

### 6.0 Product topology — RESOLVED
- **Ecosystem = hub-and-spoke.** CONTINUUM (hub); CROOMA + Cadence (spokes); StudioMunich (separate
  entity / CROOMA vertical / AMF supplier); the 14 brands (tenants).
- **CROOMA vs Cadence = Option B** — two distinct products, own adapter seams, shared brain.
- **The seal stays cryptographic in CONTINUUM** — a `contentHash` referenced by the spokes, **never** a
  Supabase RLS rule or a Firebase rule. RLS/rules protect billing (mutable config); the hash chain is
  the moat (immutable, re-derivable). Each spoke *references* the seal; it does not re-implement it.

### 6.1 Still open
1. **Seam transport** — do the spokes read CONTINUUM via its MCP/HTTP endpoint (one authoritative
   source) or an exported artifact per event? (Recommend MCP/HTTP.)
2. **Project topology for provenance** — one CONTINUUM project per brand/workspace, or shared? Decides
   how the cross-project `sourceChain` is addressed. (CROOMA's `workspace_id === tenantId` implies
   per-workspace.)
3. **DAM ownership** — CROOMA's VisualOps.Assets is a real DAM. Is it the store of record (CONTINUUM
   references its asset ids) or does CONTINUUM hold provenance and CROOMA a view? (Recommend: CROOMA
   owns the bytes; CONTINUUM owns the provenance record — same split as PODGENI.)
4. **Draft self-containment** — the AMF draft doesn't yet stamp its content project; the enqueue path
   should, so `sourceChain` is carried automatically. (Small follow-up.)

---

# PART 7 — Roadmap (Waves)
- **Wave 1 — Marry (in progress):** ✅ campaignHandoff + wall (CONTINUUM side, 8/8). Next: publish the
  intake contract; wire Cadence to gate on `contentHash`; prove ONE end-to-end campaign, unbroken chain,
  on a demo asset. Then build **CROOMA's Source/Sink adapter** (gallery observation → brain → digest).
- **Wave 2 — Close the loop:** engagement (Cadence) + selection/annotation signal (CROOMA) → `ground_truth`
  → the 6-D ranker learns.
- **Wave 3 — Commerce depth:** CROOMA PIM face+voice SKUs; studioMunich licensing through the VAULT contract.
- **Wave 4 — Autonomous amplification (GATED):** the ad-buying swarm — a liability decision behind explicit human authority.

---

_Alignment draft rev 2. Every ✅ is gate-backed here; every 🟡 is a real but separately-deployed product;
every 🔴 is designed and honest about being unbuilt. Hub-and-spoke, Option B, seal stays in CONTINUUM._
