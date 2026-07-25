<!--
  CROOMA Terminal Brief — the boundary + rules the Crooma team (repo continuum-visual-ops) works to.
  A hand-across-the-repo-boundary brief. Full architecture: docs/CROOMA_PRODUCT_SPEC.md (rev 3).
  Amalgamation source of truth: docs/PRODUCT_AMALGAMATION.md. Intake contract: docs/PODGENI_INTAKE_CONTRACT.md.

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# CROOMA Terminal Brief

_What the Crooma team (repo `continuum-visual-ops`) needs from the Continuum side — and the scope line
we do NOT cross. Read `CROOMA_PRODUCT_SPEC.md` rev 3 for the full picture; this is the working boundary._

---

## 1. The model — Shell / Module / Spine
**Crooma is ONE product** (the parent shell, `crooma.cloud`). Its modules are **Assets · Galleries ·
Workflows · Portals · PodGeni** (PodGeni includes the Cadence campaign features). **Continuum AMF is
the spine** every module rides — knowledge, observations, digests, semantic search, voice, the P9 seal,
multi-tenant isolation. The spine is **not a module the user picks.**

## 2. The identity rule — `workspace_id === Continuum tenantId` (1:1)
Pass `workspace_id` on every call to the brain. One workspace = one isolated knowledge scope. **Never
translate it** — identity mapping only. (StudioMunich uses the same rule as `workspace_id := studio_id`.)

## 3. The invariant — the seal stays in Continuum (non-negotiable)
The tamper-proof guarantee is a **Continuum cryptographic record** — a `contentHash` that re-derives to
a human's sealed `type='decision'` Observation. **Reference the `decisionId` / `contentHash`; NEVER
re-implement the seal as a Supabase RLS rule.** RLS protects billing (mutable server config); the hash
chain is the moat (immutable, re-derivable, auditable). Re-implementing it throws the wedge away.

## 4. Sequencing — brand-first, backend-later (from `PRODUCT_AMALGAMATION.md`)
Do these **in order**; each step is additive + reversible with the spine underneath:
1. **Shell** — one Crooma brand + one nav listing the modules, on the `workspace_id` tenant model. No risky data moves.
2. **Auth** — unify to a single login across modules.
3. **Billing** — unify to one credit/billing ledger.
4. **PodGeni data** — fold in **LAST**, once scope is locked (Cadence campaign features come with it).

## 5. Do NOT build now — the Wave 1 vs Wave 3 line
- ❌ **The Continuum Source/Sink adapter** (gallery selection/annotation → brain → digests) is **Wave 3**
  (it serves the DAM / Visual-Ops modules). **Do not front-load it.** Building a Wave-3 contract before
  Wave 1 closes is how scope bleeds and integrations fail.
- ✅ Stay on **Wave 1**: prove one asset end-to-end through the campaign module.

## 6. The Wave-1 boundary — the campaign module's intake
The PodGeni/campaign module consumes a **sealed bundle** from `campaignHandoff` and enforces the wall —
full spec in **`docs/PODGENI_INTAKE_CONTRACT.md`**. The one line that must not slip:
- **Gate on `contentHash` + `decisionId`. NEVER on `acceptedBy`** (that rejects every AMF asset).
- Re-derive the `contentHash` over the exact asset; refuse `ok:false`, unsealed, or tampered.
- The Creative Genome `sourceId` tags **are** the Continuum Observation ids (don't mint your own) →
  unbroken chain of custody: `post → decisionId → draft → signal → origin`.

---

## The one-paragraph version (paste to the Crooma terminal)
> Crooma is the shell; PodGeni (incl. Cadence) is a module; Continuum AMF is the spine — never a
> module the user picks. Use `workspace_id` as the Continuum tenant id, 1:1, no translation. The
> tamper-proof seal is a Continuum cryptographic record — reference the `decisionId`/`contentHash`,
> never re-implement it as a Supabase RLS rule. Build in order: shell → auth → billing → fold PodGeni
> last. Do NOT build the Source/Sink adapter yet — that's Wave 3. For Wave 1, the campaign module
> consumes the sealed bundle (see `PODGENI_INTAKE_CONTRACT.md`) and gates on `contentHash`+`decisionId`,
> never `acceptedBy`.
