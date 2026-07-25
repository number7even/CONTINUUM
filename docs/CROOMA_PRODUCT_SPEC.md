<!--
  CROOMA — Product + Architecture Spec (rev 3 — the amalgamation)
  rev 3 supersedes rev 2's "hub-and-spoke / two spokes" framing. Source of truth:
  docs/PRODUCT_AMALGAMATION.md (Decision 2026-07-25) + docs/STUDIOMUNICH_RELATIONSHIP.md.

  THE MODEL (locked): Crooma is ONE product (parent shell). PodGeni (incl. the Cadence campaign
  features) is a MODULE inside it. Continuum AMF is the SPINE every module rides — not a module the
  user picks. StudioMunich is a SEPARATE peer product (integration only, not a fold-in).

  Discipline: the Honest Odometer.
    ✅ VERIFIED — proven on disk in THIS repo (gate-backed, gate named)
    🟡 REPORTED — real, but in a SEPARATE repo/deployment (continuum-visual-ops / studiomunich-main), not verifiable here
    🔴 VISION   — designed / intended / not yet built anywhere
  If it isn't tagged, it isn't a claim.

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# CROOMA — Product + Architecture Spec

_rev 3 · the amalgamation (one product) · 2026-07-25_

---

## The model (locked — `docs/PRODUCT_AMALGAMATION.md`)

**Crooma, PodGeni, and Continuum AMF amalgamate into a single product: Crooma.** One brand, one login,
one billing ledger, one tenant model (`workspace_id`), one AI knowledge scope per tenant. StudioMunich
stays a separate product — integration, not fold-in.

```
   crooma.cloud  ──  CROOMA  (ONE product · one login · one workspace_id · one billing ledger)
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  MODULES (user-selectable):                                               │
   │    Assets · Galleries · Workflows · Portals · PodGeni                     │
   │    └ PodGeni = podcast/audio  +  Cadence campaign (produce · distribute · │
   │      measure · Creative Genome)                                           │
   ├──────────────────────────────────────────────────────────────────────────┤
   │  Continuum AMF  ──  the SPINE (NOT a module the user picks)          ✅    │
   │    knowledge · observations · digests · semantic search · voice ·         │
   │    the P9 decision seal · multi-tenant isolation · the AMF content factory│
   └──────────────────────────────────────────────────────────────────────────┘
                    │  integration seam (Galleries PR #45 · workspace_id := studio_id · shared brain)
                    ▼
   studiomunich.digital  ──  StudioMunich  (SEPARATE peer product)        🟡
   own repo · own Supabase · own auth / billing / tenancy (studio_id)
```

| Thing | What it is | Role |
|---|---|---|
| **Crooma** (crooma.cloud, repo `continuum-visual-ops`, Supabase `mpjlyfrzwrlwgzqquwjx`) | the unified visual-ops + content product | **the product** (shell + modules) |
| **Assets / Galleries / Workflows / Portals / PodGeni** | the five modules | **modules** inside Crooma |
| **Continuum AMF** (this repo) | brain / orchestration / data spine + content factory | **the spine** every module rides |
| **StudioMunich** (studiomunich.digital, repo `studiomunich-main`, Supabase `jjdjifkadyqykaamsirr`) | consented digital-talent / AI-production studio | **separate peer product** — integration only |
| The 14 portfolio brands | voicecosmos, sekago, … | **tenants** (`workspace_id`) |

---

# PART 1 — EXECUTIVE SUMMARY

## Crooma in one line
> **Crooma** — a voice-native visual-collaboration + asset-ops + content product: *picdrop + a website
> builder + NotebookLM*, evolving into an **operating system for selling.** One product, five modules,
> one AI brain (Continuum AMF) underneath.

Guided operational loop — ingest assets → AI generation → human approval → storefront assembly →
performance measurement — for **photographers, creative agencies, and hospitality brands.** It
**integrates** with **StudioMunich** (a separate, live peer product), bringing its Galleries proofing
into SM and cross-upgrading customers between the two.

## The moat (architecture, not features)
Generic AI tools are black boxes that fail at **governance.** Crooma's moat is **trusted brand
governance + actionable automation + closed-loop optimization**, and — because every module rides the
same Continuum brain — client selections/annotations don't die in email threads; they become
**searchable, summarizable knowledge** with **rights handling, auditability, and tamper-proof
provenance.** Premium clients value operational control + auditability over raw generation speed.

The wedge is a sequence no competitor can bolt on later, because it's the *spine*, not a feature:
**Produce (AMF) → Seal (the P9 decision, cryptographic) → Distribute (PodGeni/Cadence, provenance-
stamped) → Measure (Creative Genome, `sourceId` = Continuum id) → Learn (engagement → the 6-D ranker).**

## Honest-odometer caveat (P4)
The **Continuum AMF spine** (this repo) is ✅ verified — 41 gates. The **Crooma product shell + modules**
live in a **separate repo** (`continuum-visual-ops`) and are 🟡 REPORTED — not verifiable here. **StudioMunich**
is a separate live product (🟡). The seams that marry them are the work; one (campaignHandoff) is ✅ built
here. §5 is the exact map.

---

# PART 2 — CROOMA (the product)  🟡 REPORTED (repo `continuum-visual-ops`)

## 2.1 Tech stack & unification
- **Stack** — Next.js 14 (App Router, strict TS) · Tailwind (Inter, white-enterprise) · Supabase
  (Postgres, RLS, Storage, Auth) · Vercel (`crooma.cloud`).
- **One product** (per PRODUCT_AMALGAMATION.md): one brand, one login/auth across every module, one
  credit/billing ledger, one tenant model (`workspace_id`), one AI knowledge scope per tenant (Assets,
  Galleries, PodGeni all feed + query the same Continuum brain for that tenant).
- **Tenancy anchor** — `workspace.slug === content site_key`; scopes all content per tenant with no
  per-table id migration. And strictly `workspace_id (Crooma) === tenantId (Continuum)` → the AI moat.

## 2.2 The five modules
| Module | What it is | Status (per amalgamation doc) |
|---|---|---|
| **Assets** | DAM — folders, media, versioning, metadata; PIM (variants → SKUs, royalty terms); Google Drive/Photos sync; CMS (Story Studio, voice dictation, publishing) | built (Crooma repo) |
| **Galleries** | client proofing & presentation — rank (1st/2nd/3rd), color-flag, annotate (text/freehand/voice); Presentation mode | built |
| **Workflows** | approvals / routing — review states (draft → approved); a selection locks a spec + creates a handoff | roadmap |
| **Portals** | client & supplier portals; recursive share-graph (onward shares **narrow** permissions: creator → client → contractor) | roadmap |
| **PodGeni** | podcast/audio generation **+ the Cadence campaign features** (createCampaign, scheduler, Marketing Calendar, Creative Genome — produce · distribute · measure) | **to integrate** (repo/scope confirmed folding in) |

> **PodGeni scope (confirmed 2026-07-25):** PodGeni **encompasses the Cadence campaign features.** So the
> content produce→distribute→measure loop is a Crooma module, riding the AMF spine. (`campaignHandoff` —
> §5.3 — is therefore an **intra-Crooma** boundary: AMF spine → PodGeni module scheduling.)

---

# PART 3 — Continuum AMF — the SPINE  ✅ VERIFIED (41 gates)

Not a module the user picks — the layer **every** module rides: knowledge, observations, digests,
semantic search, voice, the P9 seal, isolation, the AMF content factory.

- **Multi-tenant isolation** — `openStorage(workspace_id)`; cross-tenant retrieval structurally
  impossible; adversarial ids rejected. _(verify-tenant-isolation)_
- **Canonical Observation model** — `sourceId` = origin, `id` = artifact, `refs` = edges. The
  chain-of-custody substrate the modules share.
- **Privacy choke-point** — every write deep-scrubs secrets + (tenant mode) guest PII before storage/
  embedding. _(verify-hotel-kb, privacy-smoke)_
- **Authorship (decision) Ledger** — a human P9 approval → immutable `type='decision'` Observation;
  `contentHash` scrub→hash→store; tamper-detectable; operator = scrub-exempt provenance.
  _(verify-decision-seal, 14/14)_
- **AMF content factory** — ingest → 6-D rank → story-freshness dedup → draft → P9 seal. Live queue
  collapsed **301→66**. _(verify-dedup, verify-matcher-dedup)_
- **The adapter seam (Source/Sink)** — how modules feed + query the brain:
  | Crooma module action | Continuum primitive (✅) |
  |---|---|
  | `workspace_id === tenantId` | `openStorage(tenantId)` isolation |
  | **Source** — a gallery selection/annotation → `observation {workspace_id, gallery, asset, actor, kind, payload, ts}` | Observation model + adapter pattern, through the privacy choke-point |
  | **Sink** — digests + semantic search back into the module | MCP `continuum_get_digest` / `search_docs` / `ask_context` |
  | **VoiceCosmos agent** — voice queries + actions ("export the selects") | MCP client over the tenant-scoped JWT |
- **Concierge provisioning** — `provision-tenant` mints a scoped RS256 JWT the engine validates.
  _(verify-tenant-jwt, verify-aria-live-loop)_

---

# PART 4 — StudioMunich × Crooma — the peer relationship  🟡 REPORTED

_Source: `docs/STUDIOMUNICH_RELATIONSHIP.md`. **Two separate products that integrate** — Crooma is not
inside SM; SM is not a Crooma module; SM is explicitly out of the amalgamation._

## 4.1 Two products, side by side
| | **Crooma** | **StudioMunich** |
|---|---|---|
| What | Visual-ops + content: Assets·Galleries·Workflows·Portals·PodGeni | consented digital-talent / AI-production studio |
| Domain | `crooma.cloud` | `studiomunich.digital` (**live**) |
| Repo | `continuum-visual-ops` | `studiomunich-main` |
| Supabase | `mpjlyfrzwrlwgzqquwjx` | `jjdjifkadyqykaamsirr` |
| Tenant key | `workspace_id` | `studio_id` (`studios.id`, `owner_id → auth.users`) |
| Spine | Continuum AMF | its own stack |

Each keeps its **own** auth, tenancy, billing, and data. Neither depends on the other to run.

## 4.2 The integration seam
1. **Galleries into SM (integration, not merge).** Crooma's Galleries is merged **into** StudioMunich as
   an additive, `studio_id`-scoped, feature-flagged layer — 4 sibling tables (`gallery_share`,
   `gallery_participant`, `gallery_selection`, `gallery_annotation`), owner `/dashboard/galleries` +
   client `/g/<token>`. Delivered by **PR #45** (`crooma-galleries-code` → SM `main`), worked in a
   separate worktree (`studiomunich-crooma`).
2. **Bidirectional cross-upgrade.** SM ⇄ Crooma customers upgrade across. One commercial bridge, not one codebase.
3. **Shared brain, mapped identities.** `workspace_id := studio_id` at the adapter (identity, no
   translation) — one tenant, one knowledge scope across the seam. SM already emits Continuum
   observations keyed by `studio_id`; they light up once `CONTINUUM_URL` is set.

## 4.3 Rules of engagement (non-negotiable)
- **studiomunich.digital is LIVE** — changes reach it only via SM-reviewed PRs behind feature flags,
  never a direct push to SM `main`. **DDL is founder-applied** (additive sibling tables only). **One
  terminal = one repo + one branch + one worktree** — Crooma's SM work lives in `studiomunich-crooma`;
  the SM team owns `studiomunich-main`; handoffs by PR.

---

# PART 5 — The seams

## 5.1 Internal (within Crooma) — modules on the spine
Every module reads/writes the Continuum AMF spine via the Source/Sink adapter (§3). One `workspace_id`
= one knowledge scope, so Assets, Galleries, and PodGeni share a coherent AI context for that tenant.

## 5.2 External — StudioMunich integration (§4).

## 5.3 The campaignHandoff boundary  ✅ VERIFIED (CONTINUUM side)
Now an **intra-Crooma** module boundary (AMF spine → PodGeni scheduling): `campaignHandoff(approvedDraftId)`
emits a sealed, self-contained provenance bundle `{ decisionId, decisionProject, contentHash, verdict,
operator, sealedAt, asset, sourceChain }`. The wall: exports **only** a sealed, approved, untampered
asset; the `sourceChain` walks decision → draft → source signal → origin URL across projects.
_(verify-campaign-handoff, 8/8)._

> **Locked primitive:** the seal is the `type='decision'` **`contentHash` + `decisionId`**, **NOT**
> `StateEntry.acceptedBy` (reserved for product-state milestones). Gate on the former or reject every asset.

---

# PART 6 — Honest odometer

| Capability | State | Evidence |
|---|---|---|
| Continuum AMF spine: isolation, privacy, ledgers, provenance, factory | ✅ VERIFIED | 41 gates in `make smoke` |
| Decision seal = tamper-proof human approval | ✅ VERIFIED | verify-decision-seal (14/14) |
| Operator = scrub-exempt provenance (secrets still scrub) | ✅ VERIFIED | verify-decision-seal Part C |
| AMF dedup: live queue 301 → 66; no re-dupe | ✅ VERIFIED | dedup.mjs / verify-matcher-dedup |
| campaignHandoff export + wall (intra-Crooma AMF→PodGeni boundary) | ✅ VERIFIED | verify-campaign-handoff (8/8) |
| Crooma product shell + modules (Assets/Galleries/Workflows/Portals) | 🟡 REPORTED | repo continuum-visual-ops (Next/Supabase/Vercel) |
| PodGeni module fold-in (incl. Cadence campaign features) | 🟡 to integrate | scope confirmed; fold last (sequencing §7) |
| Continuum adapter seam — Crooma Source/Sink live wire | 🔴 VISION | maps to verified primitives; not wired |
| StudioMunich integration (Galleries → SM, cross-upgrade, shared brain) | 🟡 REPORTED | SM live; PR #45 flagged; `workspace_id := studio_id` |
| Autonomous ad-buying (Wave 4) | ⏳ GATED | liability decision, withheld |

---

# PART 7 — Decisions & sequencing

### 7.0 Amalgamation — RESOLVED (`docs/PRODUCT_AMALGAMATION.md`, 2026-07-25)
- **Crooma = one product.** PodGeni (incl. Cadence) is a **module**; Continuum AMF is the **spine**;
  StudioMunich is a **separate peer** (integration only). Option B (two products) is **void**.
- **The seal stays cryptographic in Continuum** — a `contentHash` referenced by the product, **never** a
  Supabase RLS / Firebase rule. RLS protects billing (mutable config); the hash chain is the moat.

### 7.1 Sequencing (brand-first, backend-later — per the amalgamation doc)
1. **Shell** — one Crooma brand + one nav listing the modules, on the agreed tenant model. No risky data moves.
2. **Auth** — unify to a single login across modules.
3. **Billing** — unify to one credit/billing ledger.
4. **PodGeni data** — fold in **last**, once scope is locked.
Continuum AMF stays the spine throughout → each step additive + reversible.

### 7.2 Still open
1. **Seam transport** — modules read Continuum via its MCP/HTTP endpoint (one authoritative source) or
   an exported artifact per event? (Recommend MCP/HTTP.)
2. **Project topology for provenance** — one Continuum project per `workspace_id` (implied by the
   identity mapping) — confirm.
3. **DAM ownership** — Crooma's Assets owns the bytes; Continuum owns the provenance record (recommended split).

---

# PART 8 — Roadmap (Waves)
- **Wave 1 — prove the spine loop (in progress):** ✅ campaignHandoff + wall (8/8). Next: prove ONE
  end-to-end campaign, unbroken chain, on a demo asset; wire Crooma's Source/Sink adapter (gallery
  observation → brain → digest).
- **Wave 2 — close the loop:** engagement (PodGeni/Cadence) + selection/annotation signal (Galleries) →
  `ground_truth` → the 6-D ranker learns.
- **Wave 3 — fold + commerce:** PodGeni data fold-in; Assets/PIM face+voice SKUs; StudioMunich licensing via VAULT.
- **Wave 4 — autonomous amplification (GATED):** the ad-buying swarm — a liability decision behind explicit human authority.

---

_rev 3. Every ✅ is gate-backed here; every 🟡 is a real but separately-deployed product/module; every 🔴
is designed and honest about being unbuilt. One Crooma product · modules on the Continuum AMF spine ·
StudioMunich a separate peer._
