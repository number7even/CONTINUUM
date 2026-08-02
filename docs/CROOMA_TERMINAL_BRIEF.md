<!--
  CROOMA Terminal Brief — the authoritative mission-order for the Crooma team (repo continuum-visual-ops).
  A hand-across-the-repo-boundary brief. Full architecture: docs/CROOMA_PRODUCT_SPEC.md (rev 3).
  Amalgamation source of truth: docs/PRODUCT_AMALGAMATION.md. Intake contract: docs/PODGENI_INTAKE_CONTRACT.md.
  Coordination / ownership: docs/CROOMA_COORDINATION.md. StudioMunich rules: docs/STUDIOMUNICH_RELATIONSHIP.md.

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# CROOMA Terminal Brief — Mission Order

_What the Crooma team (repo `continuum-visual-ops`) builds, in what order, and the scope lines we do NOT
cross. This is the working boundary + the cryptographic brakes. Read `CROOMA_PRODUCT_SPEC.md` rev 3 for
the full architecture; this brief is authoritative for **what to do next and what not to touch yet.**_

> **The one-paragraph version (paste to the Crooma terminal):**
> Crooma is the shell; PodGeni (incl. Cadence) is a module; Continuum AMF is the spine — never a module
> the user picks. Use `workspace_id` as the Continuum `tenantId`, 1:1, no translation. The tamper-proof
> seal is a Continuum cryptographic record — reference the `decisionId`/`contentHash`, never re-implement
> it as a Supabase RLS rule. Build in order: shell → auth → billing → fold PodGeni last. Tag every claim
> in your repo 🟡 REPORTED / 🔴 VISION until a gate proves it. Do NOT build the Source/Sink adapter yet —
> that's Wave 3. For Wave 1, the campaign module consumes the sealed bundle (see `PODGENI_INTAKE_CONTRACT.md`),
> gates on `contentHash`+`decisionId` (never `acceptedBy`), and verifies through the Continuum endpoint,
> not a cached copy.

---

## I. Top-Level Directives

1. **The Model — Shell / Module / Spine.** **Crooma is ONE product** (parent shell, `crooma.cloud`).
   Its modules are **Assets · Galleries · Workflows · Portals · PodGeni** (PodGeni includes Cadence
   campaign features). **Continuum AMF is the spine** every module rides — memory, observations, digests,
   semantic search, voice, the P9 seal, multi-tenant isolation. The spine is **not a module the user picks.**
2. **The Goal — build the OS for Selling.** Not a visual-ops app; a **Cognitive Container riding a
   cryptographic spine.** Every asset, campaign, and portal inherits provenance from the spine for free.
3. **The Current Phase — Wave 1 (Marry).** Physically close the produce→distribute trust loop for ONE
   asset through the PodGeni/campaign module. Everything else is a later wave.

## II. Technical Constraints — the invariants (non-negotiable)

1. **Tenant mapping — `workspace_id === Continuum tenantId` (1:1).** Pass `workspace_id` on every call to
   the brain. One workspace = one isolated knowledge scope. **Never translate it** — identity mapping only.
2. **The Wall.** The campaign module **rejects any asset missing a resolvable `decisionId` AND a matching
   `contentHash`.** Re-derive the hash over the exact asset; refuse `ok:false`, unsealed, or tampered.
   **Gate on `contentHash` + `decisionId`, NEVER on `acceptedBy`** (that rejects every AMF asset).
3. **The Seal stays in Continuum.** The tamper-proof guarantee is a **Continuum cryptographic record** — a
   `contentHash` that re-derives to a human's sealed `type='decision'` Observation. **Reference it; NEVER
   re-implement it as a Supabase RLS or Firebase rule.** RLS protects billing (mutable server config); the
   hash chain is the moat (immutable, re-derivable, auditable). Re-implementing it throws the wedge away.
4. **The Odometer — honesty as architecture (P4).** **Every claim in the `continuum-visual-ops` repo is
   tagged 🟡 REPORTED or 🔴 VISION until a deterministic gate proves it ✅ VERIFIED.** No feature is "done"
   because it renders; it is done when a re-runnable check exits 0. Build your own `make smoke` — see §V.
5. **Verify through the endpoint, not a copy.** Read the bundle + verify the decision via Continuum's
   MCP/HTTP endpoint (one authoritative source of truth). **Never gate on a cached/copied artifact** — a
   stale or forged local copy silently defeats the wall. Re-verify against the brain at publish time.
6. **Transport = a scoped tenant JWT.** Obtain a per-workspace token via `continuum provision-tenant` (or
   the shared bearer) and pass it on every call. Tenant-scoped either way; a token never crosses workspaces.
7. **Don't mint identity.** The Creative Genome `sourceId` tags **ARE** the Continuum Observation ids from
   the `sourceChain` — don't invent your own. Observation **types** live in Continuum's contract anchor
   (`contracts.mjs`), not in your repo. New shapes are defined spine-side, then you consume them.
8. **Privacy is the brain's job — don't fight it.** Anything you send is deep-scrubbed at the choke-point
   (`upsertObservation`). Do **not** rely on the brain to *preserve* a secret you send (it won't), and do
   **not** pre-scrub-then-assume; send clean, let the choke-point enforce. KB uploads with PII are scrubbed.
9. **P9 — never auto-publish.** The publish action must consume an **already-sealed** bundle or require the
   human leap. No "auto-approve" toggle, no scheduling a draft that no human approved. The leap is the human's.

## III. Amalgamation Runbook — brand-first, backend-later

Do these **in order**; each step is additive + reversible with the spine underneath.

1. **Shell** — one Crooma brand + one nav listing the modules, on the `workspace_id` tenant model. No risky data moves.
2. **Auth** — unify to a single login across modules.
3. **Billing** — unify to one credit/billing ledger.
4. **PodGeni intake** — wire the campaign module to consume the sealed bundle per **`PODGENI_INTAKE_CONTRACT.md`**. Fold PodGeni data in **LAST**, once scope is locked (Cadence features come with it).
5. **(HOLD — Wave 3) DAM provenance fold.** ⛔ Do not start. See §VI.

## IV. Rules of Engagement — the StudioMunich firewall

StudioMunich is a **separate peer product, not a module** (`studiomunich.digital` is LIVE). It is
**codebase-isolated** — never in the Crooma merge, connected only by the cryptographic VAULT contract so
likeness-rights liability stays contained. (Full rules: `docs/STUDIOMUNICH_RELATIONSHIP.md`.)

1. **No direct pushes to StudioMunich `main`.** Ever.
2. **Handoffs are PRs** from the `studiomunich-crooma` worktree (e.g. Galleries → PR #45), reviewed + merged by the SM-review hat.
3. **Feature-flag all** StudioMunich integrations (`galleries` flag off until reviewed).
4. **Additive DDL only, founder-applied.** New sibling tables in the SM SQL editor; never alter existing SM tables. `workspace_id := studio_id`, same 1:1 identity rule.

## V. Definition of Done — Crooma's own Wave-1 gate (make the Odometer concrete)

Wave 1 is closed on the Crooma side when a re-runnable gate in `continuum-visual-ops` proves, given one
**founder-approved** bundle:
- `createCampaign` **schedules** it and stamps `decisionId` + `contentHash` as provenance;
- an **unsealed** or **tampered** variant is **refused** (the wall holds);
- the scheduled post's `sourceId` **walks back** to the origin news article (`post → decisionId → draft → signal → origin`).

Until that gate is green, the campaign module is 🟡 REPORTED, not ✅ VERIFIED. This mirrors the Continuum
side's `campaignHandoff` gate — the two halves together make the tamper-proof USP verifiable, not asserted.

## VI. Wave 3 pre-commit — state it now so nobody drifts

Wave 3 is **Fold + Commerce**, and it is **on HOLD until Wave 1 is physically closed.** But pre-commit the
architecture now so the team doesn't build toward the wrong shape:

- **The Source/Sink adapter is forbidden until Wave 3.** Building the live wire between Galleries and the
  brain before Wave 1 closes is exactly how scope bleeds.
- **Ownership split: Crooma owns the bytes, Continuum owns the provenance record.** The actual image/video
  binaries live in Crooma storage. Continuum stores only the **Observation** (a stable id, `refs`, metadata,
  a pointer) — **never the binary.** No blobs in the brain.
- **The asset Observation type is defined spine-side.** When Wave 3 opens, the new `type` lands in
  `contracts.mjs` (the anchor) first; Crooma consumes it — it is not minted in `continuum-visual-ops`.
- **VAULT licensing = record-issuance, not wall-building.** The rights wall (`vault-guard.mjs`) already
  enforces: `studiomunich:<actorId>` requires a verified `X-Rights-Signature`. Wave 3 builds the *grant
  record* the wall checks against — the wall itself is done.

## VII. What Crooma owes the loop (Wave 2 return — design for it)

The learning loop's Continuum half is **built + gate-green** (`telemetry-sync.mjs`). To close it, the
PodGeni/Genome module must, once it has measured engagement, POST an **engagement-telemetry event** back
per **`PODGENI_INTAKE_CONTRACT.md` §5** — `refs:[decisionId, signalId]` taken from the `sourceChain`, one
event per asset. Reward derives spine-side (a transparent heuristic, not a claimed model). Feed the brain;
don't build a parallel analytics store.

---

## Quick "am I about to violate the brief?" checklist
- Am I re-implementing the seal as an RLS/Firebase rule? → **STOP** (§II.3).
- Am I gating on `acceptedBy`, or on a cached bundle? → **STOP** (§II.2, §II.5).
- Am I minting my own `sourceId` / Observation `type`? → **STOP** (§II.7).
- Am I about to build the Source/Sink adapter, or fold DAM? → **STOP, that's Wave 3** (§III.5, §VI).
- Am I pushing to StudioMunich `main`, or shipping an SM integration without a flag + PR? → **STOP** (§IV).
- Am I publishing a draft no human sealed? → **STOP** (§II.9, P9).
- Is this feature "done" without a gate? → **It's 🟡 REPORTED, not done** (§II.4).
