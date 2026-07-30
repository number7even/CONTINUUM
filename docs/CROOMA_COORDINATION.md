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
| **`CONTINUUM`** (this repo) | the **spine**: AMF content factory, ledgers, the P9 seal, multi-tenant isolation, MCP/HTTP surface, the adapter + `campaignHandoff` contracts | continuum.rest · SQLite/RuVector · 42 gates ✅ | **Riaan** (founder) + agent — here |
| **`continuum-visual-ops`** (Crooma) | the **product**: shell + 5 modules, UX, tenancy/auth/billing | crooma.cloud · Vercel · Supabase `mpjlyfrzwrlwgzqquwjx` | **Riaan** (founder), "Crooma hat" |
| **`studiomunich-main`** (StudioMunich) | the separate peer product (its own stack) | studiomunich.digital (**LIVE**) · Supabase `jjdjifkadyqykaamsirr` | **Riaan** (founder), "SM-review hat" |
| **`pod-geni`** (PodGeni) | podcast/audio + Cadence campaign features — **folding into Crooma** | Firebase (until folded) | **Riaan** (founder), "Crooma hat" (fold) |
| worktree **`studiomunich-crooma`** | where Crooma authors its SM-Galleries integration | (a git worktree, not a product) | **Riaan** (founder), "Crooma hat" |

**Founder (Riaan) — the human in the loop, across all of it:** applies DDL (additive tables, SQL editor),
makes the **P9 leaps** (approvals/decisions), owns the strategic calls. The seal is *his* click, never an agent's.

---

## Workstreams — who does what

### A. The spine (CONTINUUM repo) — Engine
- ✅ Done: dedup (301→66), the decision seal, `campaignHandoff` export + wall (verified, 41 gates).
- ▸ Next: publish the **Source/Sink adapter contract** for Crooma to wire; prove **Wave 1** end-to-end on
  one demo asset; `provision-tenant` for each `workspace_id`.
- Owns the invariant: **the seal is a Continuum cryptographic record** — never re-implemented in a Supabase/Firebase rule.

### B. The Crooma product (`continuum-visual-ops`) — Riaan (founder), "Crooma hat"
- ▸ Build the **shell** (one brand, one nav listing the modules) on the `workspace_id` tenant model.
- ▸ Unify **auth** (single login) then **billing** (one credit ledger) — the amalgamation sequence.
- ▸ Wire the **Continuum Source/Sink adapter**: emit gallery selections/annotations as observations
  (`{workspace_id, gallery, asset, actor, kind, payload, ts}`); read digests + semantic search back.
- ▸ Fold **PodGeni** data **last** (once scope locked; Cadence campaign features come with it).

### C. StudioMunich integration (`studiomunich-main`) — Riaan (founder), two hats
- Riaan ("Crooma hat") authors Galleries in the `studiomunich-crooma` **worktree** → hands off as **PR #45**.
- Riaan ("SM-review hat") reviews + merges PR #45, enables the `galleries` feature flag, and sets
  `CONTINUUM_URL` to light up the shared brain (`workspace_id := studio_id`). The two-hat split is not
  ceremony — it enforces the "PR-reviewed, never a direct push to live SM `main`" rule of engagement.
- Riaan (founder) applies the additive sibling-table DDL in the SM SQL editor.

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
| 3 | Stand up the Crooma shell + module nav | Riaan ("Crooma hat", `continuum-visual-ops`) | tenant model (agreed) |
| 4 | Review/merge PR #45 + set `CONTINUUM_URL` | Riaan ("SM-review hat", `studiomunich-main`) | founder DDL |
| 5 | Clear the 66 drafts (P9 leaps) | Riaan (founder) | review.mjs (✅) |

---

## Execution Ledger — who does what (P4: named, not invented)

Every "team" above resolves to **one human — Riaan (founder)** — wearing a different hat in a different
worktree/repo. This is stated plainly rather than dressed up as a staffed org: a roadmap with unnamed
owners is a *Role Map*; named, it becomes an *Execution Ledger*.

| Hat | Acts in | Scope |
|---|---|---|
| **Engine** | `CONTINUUM` (this repo) | the spine + agent-paired build |
| **Crooma hat** | `continuum-visual-ops` (+ `pod-geni` during the fold) | the product shell + 5 modules |
| **SM-review hat** | `studiomunich-main` (+ the `studiomunich-crooma` worktree for authoring) | reviews/merges the Galleries PR into LIVE SM; never a direct push to SM `main` |
| **Founder** | wherever the P9 leap or DDL happens | the human signature + additive DDL |

The two-hat split on StudioMunich (author in a worktree → PR → review-merge into live) is deliberate: it
is the mechanism that enforces "changes to the LIVE product go through review, never a direct push."

When a second person joins any hat, name them in the row above — that is the only edit this ledger needs.
