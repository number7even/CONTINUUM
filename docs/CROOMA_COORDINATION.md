<!--
  CROOMA Ecosystem — Coordination Map (who does what, where). The centralized "same page" doc.
  Grounded in: docs/PRODUCT_AMALGAMATION.md, docs/STUDIOMUNICH_RELATIONSHIP.md, docs/CROOMA_PRODUCT_SPEC.md.
  Honest note: repos/rules are from those docs; where PEOPLE/team assignments aren't written down,
  they're flagged "⟨assign⟩" — the founder fills them, I don't invent them (P4).

  IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
-->

# CROOMA Ecosystem — Coordination Map

_Who owns what, who does what, and how the pieces hand off · 2026-07-25_

Read the architecture in `CROOMA_PRODUCT_SPEC.md`. This doc is the **execution + ownership** view.

---

## The one-page picture

- **Crooma is ONE product** (parent shell) with five modules — Assets · Galleries · Workflows · Portals ·
  PodGeni — all riding **Continuum AMF** as the spine.
- **StudioMunich is a separate product** that Crooma **integrates with** (Galleries) — not merged.
- Three codebases move in parallel behind clean seams. Nobody edits another team's tree; handoffs are **PRs**.

---

## Repos & ownership

| Repo | What it holds | Deploy / data | Owner |
|---|---|---|---|
| **`CONTINUUM`** (this repo) | the **spine**: AMF content factory, ledgers, the P9 seal, multi-tenant isolation, MCP/HTTP surface, the adapter + `campaignHandoff` contracts | continuum.rest · SQLite/RuVector · 41 gates ✅ | **Engine / platform** — Riaan + agent (here) |
| **`continuum-visual-ops`** (Crooma) | the **product**: shell + 5 modules, UX, tenancy/auth/billing | crooma.cloud · Vercel · Supabase `mpjlyfrzwrlwgzqquwjx` | **Crooma team** ⟨assign⟩ |
| **`studiomunich-main`** (StudioMunich) | the separate peer product (its own stack) | studiomunich.digital (**LIVE**) · Supabase `jjdjifkadyqykaamsirr` | **SM team** ⟨assign⟩ |
| **`pod-geni`** (PodGeni) | podcast/audio + Cadence campaign features — **folding into Crooma** | Firebase (until folded) | **Crooma team** (fold) ⟨assign⟩ |
| worktree **`studiomunich-crooma`** | where Crooma authors its SM-Galleries integration | (a git worktree, not a product) | **Crooma team** |

**Founder (Riaan) — the human in the loop, across all of it:** applies DDL (additive tables, SQL editor),
makes the **P9 leaps** (approvals/decisions), owns the strategic calls. The seal is *his* click, never an agent's.

---

## Workstreams — who does what

### A. The spine (CONTINUUM repo) — Engine
- ✅ Done: dedup (301→66), the decision seal, `campaignHandoff` export + wall (verified, 41 gates).
- ▸ Next: publish the **Source/Sink adapter contract** for Crooma to wire; prove **Wave 1** end-to-end on
  one demo asset; `provision-tenant` for each `workspace_id`.
- Owns the invariant: **the seal is a Continuum cryptographic record** — never re-implemented in a Supabase/Firebase rule.

### B. The Crooma product (`continuum-visual-ops`) — Crooma team ⟨assign⟩
- ▸ Build the **shell** (one brand, one nav listing the modules) on the `workspace_id` tenant model.
- ▸ Unify **auth** (single login) then **billing** (one credit ledger) — the amalgamation sequence.
- ▸ Wire the **Continuum Source/Sink adapter**: emit gallery selections/annotations as observations
  (`{workspace_id, gallery, asset, actor, kind, payload, ts}`); read digests + semantic search back.
- ▸ Fold **PodGeni** data **last** (once scope locked; Cadence campaign features come with it).

### C. StudioMunich integration (`studiomunich-main`) — SM team + Crooma team ⟨assign⟩
- Crooma team authors Galleries in the `studiomunich-crooma` **worktree** → hands off as **PR #45**.
- **SM team** reviews + merges PR #45, enables the `galleries` feature flag, and sets `CONTINUUM_URL`
  to light up the shared brain (`workspace_id := studio_id`).
- **Founder** applies the additive sibling-table DDL in the SM SQL editor.

### D. The human gate — Founder
- Clear the **66 deduped drafts** through `review.mjs` approve/reject (each seals a `type='decision'`).
- Every P9 approval is the founder's leap — not automatable (that's the whole moat).

---

## The seams — who builds each side

| Seam | CONTINUUM side (Engine) | Product side |
|---|---|---|
| **Source/Sink adapter** (modules ↔ brain) | expose the contract (observations in; digests/search out) via MCP/HTTP | Crooma emits observations + renders digests |
| **campaignHandoff** (AMF → PodGeni scheduling) | ✅ export + wall (built here) | PodGeni module ingests the sealed bundle, refuses unsealed |
| **StudioMunich** (Galleries + shared brain) | serve the tenant-scoped brain (`studio_id`) | SM merges PR #45, sets `CONTINUUM_URL` |
| **Provisioning** (tenant onboarding) | `provision-tenant` mints the scoped JWT | Crooma/SM register the `workspace_id`/`studio_id` |

---

## Rules of engagement (from `STUDIOMUNICH_RELATIONSHIP.md`)
- **studiomunich.digital is LIVE** — changes reach it only via **SM-reviewed PRs behind feature flags**,
  never a direct push to SM `main`.
- **DDL is founder-applied** — additive sibling tables only; existing tables untouched.
- **One terminal = one repo + one branch + one worktree.** No two agents/teams edit the same tree; handoffs are PRs.
- **The seal stays in Continuum** — the tamper-proof guarantee is a cryptographic `contentHash`, referenced
  by the products, never re-implemented as a platform rule.

---

## Immediate next actions (this week)

| # | Action | Owner | Depends on |
|---|---|---|---|
| 1 | Prove Wave 1 end-to-end on one demo asset (seal → campaignHandoff → unbroken chain) | Engine (here) | ✅ campaignHandoff (done) |
| 2 | Publish the Source/Sink adapter contract | Engine (here) | — |
| 3 | Stand up the Crooma shell + module nav | Crooma team ⟨assign⟩ | tenant model (agreed) |
| 4 | SM team review/merge PR #45 + set `CONTINUUM_URL` | SM team ⟨assign⟩ | founder DDL |
| 5 | Founder clears the 66 drafts (P9 leaps) | Founder | review.mjs (✅) |

---

## Open assignments (flagged, not invented — P4)
The docs name **teams** ("Crooma team", "SM team", "founder") and **repos**, but not **people**. Fill in
the ⟨assign⟩ owners:
- Who is the Crooma team (continuum-visual-ops + pod-geni fold)?
- Who is the SM team (reviews PR #45 into studiomunich-main)?
- Who holds the Engine (CONTINUUM) beyond you + the agent?

Once assigned, this table becomes the single source of "who does what." Until then, it's the accurate
map of the *roles* — the names are the one thing I won't guess.
