<!--
  CROOMA — Product + Architecture Spec (rev 4 — the honest audit edit)
  rev 4 purges five "marketing-vision" status claims that had drifted ahead of the code, and aligns
  every verb to the exact reality on disk. rev 3 (the amalgamation model) is otherwise intact.
  Source of truth: docs/PRODUCT_AMALGAMATION.md (Decision 2026-07-25) + docs/STUDIOMUNICH_RELATIONSHIP.md.

  THE MODEL (locked): Crooma is ONE product (parent shell). PodGeni (incl. the Cadence campaign
  features) is a MODULE inside it. Continuum AMF is the SPINE every module rides — not a module the
  user picks. StudioMunich is a SEPARATE peer product (integration only, not a fold-in).

  Discipline: the Honest Odometer.
    ✅ VERIFIED — proven on disk in THIS repo (gate-backed, gate named)
    🟡 REPORTED — real, but in a SEPARATE repo/deployment (continuum-visual-ops / studiomunich-main),
                  OR built-here-but-GATED on external envs/keys — not a live claim here
    🔴 VISION   — designed / intended / not yet built anywhere
  If it isn't tagged, it isn't a claim.

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# CROOMA — Product + Architecture Spec

_rev 4 · the honest audit edit · 2026-08-06_

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

## The moat (architecture, not features)
Generic AI tools are black boxes that fail at **governance.** Crooma's moat is **trusted brand
governance + actionable automation + closed-loop optimization**, and — because every module rides the
same Continuum brain — client selections/annotations don't die in email threads; they become
**searchable, summarizable knowledge** with **rights handling, auditability, and tamper-proof
provenance.**

The wedge is a sequence no competitor can bolt on later, because it's the *spine*, not a feature:

> **Produce (AMF) → Seal (P9 decision) → Distribute (PodGeni) → Measure (Creative Genome) → Learn (6-D ranker)**

## The in-repo reality (P4 — read this before believing any verb)
- **Produce → Seal** is ✅ **VERIFIED, gate-proven in this repo.** A draft is ranked, deduped, drafted,
  and stops at the human review boundary; the approval writes a tamper-evident `type='decision'` seal.
- **Distribute → Measure → Learn** is 🟡 **GATED.** The code + gates exist here (`campaignHandoff` 8/8,
  the by-id verify endpoint 8/8, `feedbackWeight()`/telemetry 10/10), but the *live* legs wait on
  external environments/keys (a resolvable engine host + real tenant JWT, the rotated handoff token, the
  PodGeni deploy). **It is proven in the repo; it is not spinning in production.** See PART 6.

---

# PART 2 — THE HONEST-AUDIT INVARIANTS (rev 4)

The five status-verb corrections that separate the verified engine from the marketing vision. Each is
grounded in the code path named.

## 2.1 The privacy filter is TWO-TIER (secrets always-on · guest PII opt-in)
Privacy is enforced at the write choke-point (`insertObservation` → `privacyFilter` +
`scrubMetadataDeep`, `packages/core/src/observation.ts`). It is **not** one blanket filter:
- **Tier 1 — Secrets (ALWAYS ON):** 11 patterns scrub high-risk credentials on every write, replacing
  them with `[REDACTED:<label>]` — `openai-key`, `xai-key`, `aws-access-key-id`, `pem-private-key`,
  `jwt`, `gcp-service-account`, `github-token`, `slack-token`, `google-api-key`, `stripe-live-secret`,
  `stripe-live-publishable`.
- **Tier 2 — Guest PII (OPT-IN, OFF BY DEFAULT):** a separate 4-pattern set — `pii-email`,
  `pii-credit-card`, `pii-iban`, `pii-passport` — runs **only** when the operator sets
  **`CONTINUUM_PRIVACY_PII=1`** (the SaaS/tenant deployment sets it; dev leaves it off so local
  git-author emails aren't redacted). **Do not tell a regulated tenant PII is auto-scrubbed — it is a
  switch the deployment must throw.**

## 2.2 The egress model is HYBRID (not "zero-egress")
The engine is **not** blanket zero-egress. Two boundaries:
- **Zero-egress trust layer (local, host CPU):** the privacy filter, the independent Validator (V,
  local llama3.2), and the ARIAN audio engine run fully offline.
- **Egress generation layer:** content drafting (`content-matcher.mjs` → `draftViaLLM`) makes outbound
  HTTPS calls to a provider API (e.g. `api.anthropic.com`). End-to-end local inference is a **V0.5+**
  roadmap target (`ruvllm` / `ruv-FANN`). Say "zero-egress **trust layer**," never "zero-egress engine."

## 2.3 Authorship Ledger vs Checkpoint Chain — two distinct mechanisms, one cryptographic weld
- **Authorship Ledger** — the human P9 approval → an immutable `type='decision'` Observation carrying the
  operator identity + the asset's canonical `contentHash` (`authorship.ts`).
- **Checkpoint Chain** — SHA-256 snapshots of the workspace's physical state (`product_state[]`,
  `checkpoint.ts`).
- **The weld (verified on disk):** `checkpoint.ts` computes the hash as
  `sha256(canonicalStringify({ active, dormant, broken }))` (`:65–66`), and `canonicalStringify`
  **recurses every field** (`:37–46`), so each `StateEntry.acceptedBy` seal (`decisionId` +
  `decisionHash` + `operator` + `at`) is folded into the checkpoint hash (`:56`). `authorship-export.ts`
  re-resolves every `acceptedBy` back to its decision and asserts `contentHash === acceptedBy.decisionHash`.
  **Alter a decision retroactively → the checkpoint hash breaks.**
- **What it proves:** tamper-evident cryptographic **evidence** that a named operator approved a specific
  `contentHash` at a specific time — a foundational record to hand legal counsel, **not** an automated
  legal **determination** of authorship.

## 2.4 "A month of media from a single input" is a 🔴 VISION (target moat)
The coordinated, zero-manual-editing pipeline that turns one 45-min audio/text input into a month of
multi-format B2B assets (PDF lead magnets · LinkedIn posts · 9:16 shorts) is the **target**, not a
verified capability. Today the system compiles **individual** high-signal drafts (`content-matcher.mjs`);
the coordinated multi-format flywheel is **not** a single gate-proven execution.

---

# PART 3 — CROOMA (the product)  🟡 REPORTED (repo `continuum-visual-ops`)

## 3.1 Tech stack & unification
- **Stack** — Next.js 14 (App Router, strict TS) · Tailwind (Inter, white-enterprise) · Supabase
  (Postgres, RLS, Storage, Auth) · Vercel (`crooma.cloud`).
- **One product:** one brand, one login/auth across every module, one credit/billing ledger, one tenant
  model (`workspace_id`), one AI knowledge scope per tenant.
- **Tenancy anchor** — `workspace.slug === content site_key`; strictly `workspace_id (Crooma) ===
  tenantId (Continuum)` → the AI moat.

## 3.2 The five modules
| Module | What it is | Status |
|---|---|---|
| **Assets** | DAM — folders, media, versioning, metadata; PIM; Drive/Photos sync; CMS | 🟡 built (Crooma repo) |
| **Galleries** | client proofing — rank (1st/2nd/3rd), color-flag, annotate; Presentation mode | 🟡 built |
| **Workflows** | approvals / routing — review states; a selection locks a spec + creates a handoff | 🔴 roadmap |
| **Portals** | client & supplier portals; recursive share-graph (onward shares **narrow** permissions) | 🔴 roadmap |
| **PodGeni** | podcast/audio **+ Cadence campaign** (createCampaign, scheduler, Calendar, Creative Genome) | 🟡 to integrate |

> **PodGeni scope:** PodGeni **encompasses the Cadence campaign features** → the produce→distribute→measure
> loop is a Crooma module riding the AMF spine. `campaignHandoff` (§5.3) is an **intra-Crooma** boundary.

---

# PART 4 — Continuum AMF — the SPINE  ✅ VERIFIED (44 gates)

Not a module the user picks — the layer **every** module rides.

- **Multi-tenant isolation** — `openStorage(workspace_id)`; cross-tenant retrieval structurally
  impossible; adversarial ids rejected. _(verify-tenant-isolation)_
- **Canonical Observation model** — `sourceId` = origin, `id` = artifact, `refs` = edges.
- **Privacy choke-point** — two-tier (§2.1): 11 secret patterns always-on; 4 PII patterns opt-in via
  `CONTINUUM_PRIVACY_PII=1`. _(verify-hotel-kb, privacy-smoke)_
- **Authorship (decision) Ledger** — P9 approval → immutable `type='decision'` Observation; scrub→hash→
  store; tamper-detectable; operator = scrub-exempt provenance. Welded into the checkpoint chain (§2.3).
  _(verify-decision-seal, 14/14)_
- **AMF content factory** — ingest → **6-D rank** (relevance × recency × authority × sales × engagement ×
  feedback, per `rankSignals`) → story-freshness dedup → draft → P9 seal. Queue collapsed **301→66**.
  _(verify-dedup, verify-matcher-dedup)_
- **By-id verification endpoint** — `GET /api/observation/:id`: tenant-scoped, read-only seal projection
  for a scheduler's just-in-time fail-closed check (no MCP client needed). _(verify-observation-endpoint, 8/8)_
- **The Source/Sink adapter seam** — how modules feed + query the brain. **🔴 the LIVE wire is Wave 3 —
  not built, and parked until Wave 1 closes** (the primitives below are ✅; the adapter that rides them is not):
  | Crooma module action | Continuum primitive (✅) |
  |---|---|
  | `workspace_id === tenantId` | `openStorage(tenantId)` isolation |
  | **Source** — a gallery selection/annotation → an observation | Observation model + adapter pattern, through the privacy choke-point |
  | **Sink** — digests + semantic search back into the module | MCP `continuum_get_digest` / `search_docs` |
- **Concierge provisioning** — `provision-tenant` mints a scoped RS256 JWT the engine validates.
  _(verify-tenant-jwt, verify-aria-live-loop)_
- **VAULT rights wall** — `studiomunich:<actorId>` requires a verified `X-Rights-Signature`; unsigned /
  forged / takedown → decline → synthetic. _(vault-guard, 9/9)_

---

# PART 5 — StudioMunich × Crooma — the peer relationship  🟡 REPORTED

_Source: `docs/STUDIOMUNICH_RELATIONSHIP.md`. **Two separate products that integrate** — SM is out of the
amalgamation._

## 5.1 Two products, side by side
| | **Crooma** | **StudioMunich** |
|---|---|---|
| What | Visual-ops + content: Assets·Galleries·Workflows·Portals·PodGeni | consented digital-talent / AI-production studio |
| Domain | `crooma.cloud` | `studiomunich.digital` (**live**) |
| Repo | `continuum-visual-ops` | `studiomunich-main` |
| Supabase | `mpjlyfrzwrlwgzqquwjx` | `jjdjifkadyqykaamsirr` |
| Tenant key | `workspace_id` | `studio_id` |
| Spine | Continuum AMF | its own stack |

Each keeps its **own** auth, tenancy, billing, and data. Neither depends on the other to run.

## 5.2 The integration seam
1. **Galleries into SM (integration, not merge)** — additive, `studio_id`-scoped, feature-flagged: 4
   sibling tables, owner `/dashboard/galleries` + client `/g/<token>`. Delivered by **PR #45**
   (`crooma-galleries-code` → SM `main`), worked in the `studiomunich-crooma` worktree.
2. **Bidirectional cross-upgrade** — SM ⇄ Crooma. One commercial bridge, not one codebase.
3. **Shared brain, mapped identities** — `workspace_id := studio_id` at the adapter (identity, no
   translation). SM emits Continuum observations keyed by `studio_id`; they light up once `CONTINUUM_URL` is set.

## 5.3 Rules of engagement (non-negotiable)
- **studiomunich.digital is LIVE** — changes reach it only via SM-reviewed PRs behind feature flags,
  never a direct push to SM `main`. **DDL is founder-applied** (additive sibling tables only). **One
  terminal = one repo + one branch + one worktree.**

---

# PART 6 — The seams

## 6.1 Internal (within Crooma) — modules on the spine
Every module reads/writes the spine via the Source/Sink adapter (§4). One `workspace_id` = one knowledge
scope. **The live adapter is 🔴 Wave 3 (parked).**

## 6.2 External — StudioMunich integration (§5).

## 6.3 The campaignHandoff boundary  ✅ VERIFIED (CONTINUUM side)
An **intra-Crooma** boundary (AMF spine → PodGeni scheduling): `campaignHandoff(approvedDraftId)` emits a
sealed, self-contained bundle `{ decisionId, decisionProject, contentHash, verdict, operator, sealedAt,
asset, sourceChain }`. Exports **only** a sealed, approved, untampered asset; the `sourceChain` walks
decision → draft → source signal → origin URL across projects. _(verify-campaign-handoff, 8/8)._

> **Locked primitive:** the seal is the `type='decision'` **`contentHash` + `decisionId`**, **NOT**
> `StateEntry.acceptedBy`. Gate on the former or reject every asset.

## 6.4 The live JIT verification (Wave-1 handshake)  ✅ VERIFIED engine-side (live-fire 2026-08-07)
At schedule time PodGeni re-verifies the seal against the live engine (the MCP `continuum_get_observations`
call over `/sse`, **or** `GET /api/observation/:id`) and **fails closed** if the check fails or the engine
is unreachable. **The engine half is proven live (2026-08-07):** new build deployed to Fly in JWT mode
(open JWKS at `/.well-known/jwks.json`), tenant JWT minted on-target against the volume-persisted issuer
key, and an authenticated public probe of `GET /api/observation/jit-probe-wave1-001` returned the
verification projection only (raw body shielded, P1), 404/401 fail-closed, with the re-derived local
sha256 matching `subject.contentHash` exactly. The witness row stays in the ledger. The **PodGeni half**
(the intake gate calling this check at schedule time) is still theirs to deploy (PART 8 §8.2 step 2).

---

# PART 7 — Honest odometer (44 gates)

| Capability | State | Evidence / Gate |
|---|---|---|
| Continuum trust substrate — isolation, two-tier privacy, ledgers, provenance, factory | ✅ VERIFIED | **44 deterministic gates** in `make smoke` |
| Decision seal = tamper-proof human approval (welded into the checkpoint hash, §2.3) | ✅ VERIFIED | verify-decision-seal (14/14) |
| Queue throughput — story-freshness dedup (301 → 66) | ✅ VERIFIED | dedup.mjs / verify-matcher-dedup |
| Self-contained handoff — `campaignHandoff` export + wall | ✅ VERIFIED | verify-campaign-handoff (8/8), cross-project |
| By-id seal verification endpoint (`GET /api/observation/:id`) | ✅ VERIFIED (live-fire) | verify-observation-endpoint (8/8) + authenticated public probe 2026-08-07: hash re-derivation match, raw body shielded, 404/401 fail-closed |
| Return-loop ranker re-weight — `feedbackWeight()` (fb 1.0→1.3, bounded) | ✅ VERIFIED (built) | telemetry-sync (10/10) — **🟡 STARVED of live telemetry** |
| StudioMunich VAULT rights wall | ✅ VERIFIED | vault-guard (9/9); declines to synthetic when unsigned |
| Multi-format asset pipeline — month of media from a single input | 🔴 VISION | target content-repurposing flywheel (§2.4) |
| Crooma product shell & UX (Assets, Galleries, Portals) | 🟡 REPORTED | active dev in `continuum-visual-ops` |
| PodGeni campaign engine (scheduler, drag-to-schedule) | 🟡 REPORTED | active deploy on Firebase/GCloud |
| Continuum Source/Sink adapter — live wire (Galleries ↔ brain) | 🔴 VISION | **Wave 3 — parked until Wave 1 closes** |
| Seam 1 — live campaign intake (PodGeni consuming the sealed bundle) | 🔴 GATED | on `CONTINUUM_RESOLVE_URL` + real tenant JWT + rotated handoff token |
| Autonomous ad-buying (Wave 4) | ⏳ GATED | liability decision, withheld |

---

# PART 8 — Decisions, sequencing & the Wave-1 handshake

## 8.0 Amalgamation — RESOLVED (`docs/PRODUCT_AMALGAMATION.md`, 2026-07-25)
- **Crooma = one product.** PodGeni (incl. Cadence) is a **module**; Continuum AMF is the **spine**;
  StudioMunich is a **separate peer**. Option B (two products) is **void**.
- **The seal stays cryptographic in Continuum** — a `contentHash` referenced by the product, **never** a
  Supabase RLS / Firebase rule. RLS protects billing (mutable config); the hash chain is the moat.

## 8.1 Amalgamation sequencing (brand-first, backend-later)
1. **Shell** → 2. **Auth** → 3. **Billing** → 4. **PodGeni data** (fold in **last**). Spine throughout.

## 8.2 The Wave-1 staging handshake (flip Distribute→Measure 🔴→✅)
Engine-side code is **frozen** (44 gates green). Closing Wave 1 is a deploy + intake + verify handshake:
1. **Deploy & configure (infra):** ✅ engine live on Fly in JWT mode (2026-08-07, commit `db87d4a`
   deploy fixes); ✅ custom domain + open JWKS; ✅ tenant JWT minted on-target. Still open: rotate
   `CONTINUUM_HANDOFF_TOKEN` (PodGeni env); push the GCloud/Firebase scheduler deploy.
2. **Ingest & intake (pod-geni):** deploy the intake gate wall (mirrors `verify-campaign-handoff`);
   consume the sealed bundle; verify `contentHash` + `decisionId` against the **live** API; **expose**
   the engagement pull endpoint (`GET /api/genome/engagement?since&tenant`, `x-telemetry-key` header)
   — the engine **pulls** via `telemetry-sync.mjs`; PodGeni never POSTs to the engine.
3. **Verify & report (CONTINUUM, here):** confirm the JIT gate fires green (`ok`, not `gated`) at schedule
   time; confirm the first telemetry event triggers `feedbackWeight()` (fb 1.0→1.3); re-run `make smoke` (44/44).

## 8.3 Waves
- **Wave 1 — prove + go live (in progress):** ✅ the spine loop, gated on the §8.2 handshake.
- **Wave 2 — close the loop:** engagement + selection/annotation signal → `ground_truth` → the 6-D ranker.
  (Continuum half ✅ built; live half 🟡 starved.)
- **Wave 3 — fold + commerce (PARKED until Wave 1 closes):** the Source/Sink adapter; the AMF-usage sync
  contract; DAM provenance fold; StudioMunich licensing via VAULT.
- **Wave 4 — autonomous amplification (GATED):** the ad-buying swarm — a liability decision behind explicit human authority.

---

_rev 4. Every ✅ is gate-backed here; every 🟡 is a real-but-separately-deployed OR built-here-but-gated
capability; every 🔴 is designed and honest about being unbuilt. Status verbs describe **today**, not the
destination. One Crooma product · modules on the Continuum AMF spine · StudioMunich a separate peer._
