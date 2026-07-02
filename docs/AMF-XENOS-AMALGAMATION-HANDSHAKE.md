# AMF ⇄ XENOS CRM — Amalgamation Handshake

> **To:** VoiceCosmos / `number7evencrm` team (the XENOS CRM + Campaign Engine side)
> **From:** CONTINUUM / AMF (`supabase-projects/CONTINUUM`) — the memory + content-discovery side
> **Date:** 2026-07-02 · **Status:** proposal for reciprocal handover
> **Bound by The Nine.** Our side is stated with file citations (verifiable on `main`).
> Your side is stated **as we understand it from screenshots + your team's own prior
> analysis — please confirm or correct each line (P4).** We don't claim your internals.

---

## 0. The one-sentence goal

Amalgamate **AMF** (discover → draft → approve → publish) and **XENOS CRM** (capture →
nurture → close → retain) into **one seamless autonomous revenue system**, with
**CONTINUUM as the shared memory/truth backend** — the control plane from which Riaan
markets every portfolio platform. **Dogfood first** (our own products), then sell the
same machine. We each own our half; we meet at defined seams.

---

## 1. Why this works: we independently converged

Neither side needs a rewrite. Both halves already arrived at the **same architecture** —
which is the strongest possible signal that the seam is natural, not forced:

| Principle | XENOS side (your prior analysis) | AMF side (this repo) |
|---|---|---|
| Product-agnostic engine behind a contract | `leadgen-engine/contracts.ts` · `ProductTarget` | `portfolio-universe.json` (14 products) |
| Separated autopilot (not a page/lever) | recommend: extract brain → `sequences/*.ts` + cron | ✅ built: BullMQ `event-loop.mjs` + `cron-trigger.mjs` |
| **One** human-in-the-loop gate | Operational Pulse (Kanban HITL) | ✅ `review.mjs` (the P9 approval gate) |
| "Prove one unit end-to-end per product" | lead → magic link → ARIAN → trial → tenant | one short → review → publish (per product) |
| Feedback as reward signal | `runner.ts` + SONA | CONTINUUM `ground_truth` observations (slot open) |

**Same shape, two halves.** AMF is the front of the funnel (media/discovery); XENOS is
the back (lead → close → retain). CONTINUUM is the memory both stand on.

---

## 2. What OUR side has (AMF + CONTINUUM — verifiable, `apps/amf/worker/`)

The demand-driven content pipeline, Stages A–L, mostly built this session:

| Stage | File | State |
|---|---|---|
| A Positioning | `portfolio-universe.json` (14 products, tiered feeds, filters) | ✅ |
| B Demand analysis | `analyze.mjs` (autocomplete + news + HN + YouTube) | ✅ |
| C Discover feeds | `discover.mjs` · `rate-source.mjs` · `opml-import.mjs` | ✅ |
| D Ingest | `adapter-news.mjs` (8 providers, mostly key-free) | ✅ |
| E/F Filter + Rank | `content-matcher.mjs` (boolean gate + 5-D score) | ✅ |
| G Draft | `content-matcher` (new) · `syndicate.mjs` (own content) | ✅ |
| H Produce | `produce-post/report/short.mjs` (brandbook-rendered) | ✅ |
| **I Approve** | **`review.mjs` — the human gate** | ✅ |
| **J Distribute/Capture** | **the lead hook — a dead `DEMO_WEBHOOK_URL` today** | 🔴 **the seam** |
| K Memory | CONTINUUM (`openStorage`, observations, checkpoints) | ✅ |
| L Orchestrate | `event-loop.mjs` + `cron-trigger.mjs` (BullMQ/Redis) | ✅ |

**CONTINUUM** underneath: per-tenant SQLite+FTS5 corpora, append-only checkpoints,
verify-then-dissolve, 11-pattern privacy scrub before persistence. Full map:
`ARCHITECTURE.md`; process: `docs/AMF_PROCESS.md`.

**Honest gaps (P4):** our content chain runs *to the approval gate*; publish is manual;
Stage J (lead capture/handoff) is a dead webhook; there is **no CRM, nurture, pipeline,
quoting, or close on our side** — that is precisely what XENOS already has.

---

## 3. What YOUR side has — *as we understand it; please confirm/correct*

From your screens (`/command/campaigns`, `/command/operations`) + your prior session's
analysis + the `XENOS_CRM_*` docs on disk:

- **Campaign Engine** (`campaigns.tsx`, ~4,558 lines) — a working multi-product engine
  with a **9-product selector** (VoiceCosmos, Mantopus, Vibely, Sekago, StudioMunich,
  Q-Intercept, Photonflow, VoiceIDVault, Viwago) and real conditional email sequences
  (Investor / Hotel Directors / Property Group / Spa / Restaurants / STR / Real Estate).
- **XENOS CRM** — Pipeline · Contacts · Drafts · Agents · Signals; leads in `xenos_crm_leads`.
- **Lead-gen backend** — `runner.ts` (pre-train + crawl + **SONA**), hyperframes (Veo content).
- **Operational Pulse** — the HITL Kanban (To Do / In Progress / In Review / Done / Blocked).
- **`leadgen-engine/contracts.ts`** — a platform-agnostic surface (`SequenceStep`, `Lead`
  kanban, `ProductTarget` with `mode: vertical | campaign_only`, a `LeadGenEngine` facade),
  plus `docs/LEADGEN_ENGINE_ARCHITECTURE.md`.

> **Please confirm:** the exact paths/shapes above, and your team's #1 recommendation
> (extract sequences + product config out of `campaigns.tsx` into a data layer + cron).
> If any line is wrong, correct it — we'll build the seam to *your* real shapes, not ours.

---

## 4. Where we meet — the five seams

```
  AMF (this repo)                                    XENOS CRM (number7evencrm)
  discover→draft→APPROVE→publish  ──①lead handoff──▶  capture→nurture→close→retain
        ▲                                                        │
        │                                    ②reviews / SONA     │
        └──────────── CONTINUUM (shared memory backend) ◀────────┘
                      product registry · leads · ground-truth · checkpoints
```

1. **Lead handoff (Stage J → XENOS intake).** AMF replaces the dead webhook with a POST
   to a XENOS lead endpoint. **We need your intake contract** (URL + payload schema +
   auth). AMF emits `{ product, source, contact, context[], assetRefs[] }`; you create the
   `xenos_crm_leads` row + log the interactions.
2. **Feedback loop (XENOS → CONTINUUM).** Closed sales' reviews + SONA rewards POST back
   to a CONTINUUM `ground_truth` observation → become high-signal fuel for AMF Stage G
   (scripting) to write social-proof/case-study content. This fills our open SONA slot.
3. **Content seam (AMF media → XENOS campaigns).** AMF-produced posts/reports/shorts become
   attachable assets in your email sequences ("Email 2: The Video"). Shared asset store +
   an `assetRef` both sides resolve.
4. **Product registry reconciliation.** You have **9** products; AMF has **14**
   (`portfolio-universe.json`). These must collapse to **one canonical registry** (proposed
   home: CONTINUUM). We need to map names (e.g. Viwago↔viwago, Photonflow↔fluxcore?,
   Mantopus/Vibely ↔ ?) and agree the `ProductTarget` shape both engines read.
5. **One HITL gate.** You have Operational Pulse; we have `review.mjs`. Two gates is drift.
   Proposal: **Operational Pulse is the single operator cockpit**; AMF's approval items
   surface *into* it (AMF posts "draft ready" tasks to the Pulse), so Riaan governs
   everything from one board.

---

## 5. CONTINUUM as the backend (the alignment)

CONTINUUM becomes the **shared truth layer** both engines write to — the reason "one place
to market all platforms" is real and not two dashboards duct-taped together:

- **Product registry** — the canonical 14-product list + per-product positioning, feeds,
  sales-signals (AMF already has this in `portfolio-universe.json`; promote it to a
  CONTINUUM resource both engines read).
- **Leads as observations** — `xenos_crm_leads` mirrored/keyed into CONTINUUM so a lead's
  full history (which AMF content sourced it → nurture → close → review) is one queryable
  thread, privacy-scrubbed.
- **Ground-truth feedback** — reviews/SONA as `ground_truth` observations → the moat that
  makes next month's content better than this month's.
- **Checkpoints** — verify-then-dissolve over the whole revenue loop: "this lead closed,
  proven by this invoice event," not "someone said it did."

---

## 6. What we need FROM you (reciprocal handover)

To wire Seam ①/② for real, please hand back:

1. **XENOS lead intake contract** — endpoint URL, payload schema, auth (we'll gate our key, P1).
2. **`leadgen-engine/contracts.ts`** current shapes — `ProductTarget`, `SequenceStep`, `Lead`.
3. **SONA event schema** — so CONTINUUM can accept your reward/feedback signals natively.
4. **The 9-product → canonical mapping** — your product IDs vs our 14 slugs.
5. **Operational Pulse task-ingest** — can AMF post approval tasks into your Kanban? (Seam ⑤)

---

## 7. Open decisions to resolve together

| # | Decision | Our lean |
|---|---|---|
| D1 | Canonical product registry — where does it live? | CONTINUUM (single source both read) |
| D2 | Content generation — AMF media vs XENOS hyperframes/Veo (overlap) | AMF owns short-form media; XENOS owns email/campaign content — confirm |
| D3 | The one HITL gate | Operational Pulse as cockpit; AMF surfaces into it |
| D4 | Does CONTINUUM back BOTH engines, or just federate? | back both (shared memory) — your call on migration cost |
| D5 | Social-comment intent mining (AiToEarn) | **official platform APIs only — no cookie-scraping** (P7/P8, non-negotiable) |

---

## 8. The dogfood proof (the shared unit of progress)

One lead, end-to-end, one product — the single green thread that proves amalgamation:

```
AMF: trend → draft → [Riaan approves in Pulse] → publish
  → lead captured (Stage J → XENOS intake)
  → XENOS: contact created → nurture → appointment → deal → close
  → review captured → CONTINUUM ground_truth
  → AMF's next script cites the win
```

When that runs once for **one** product (VoiceCosmos first — the dogfood), the machine is
real. Then we replicate per product. That per-product green thread is the unit, not "the
empire is built."

---

## 9. The line we both hold (The Nine)

- **P4** — each side states only what's verifiable; this doc marks your side "confirm."
- **P9** — the human approval gate stays (Operational Pulse); no auto-publish, no autonomous ad-spend without an operator.
- **P7/P8** — lead sourcing on official APIs / licensed / public feeds; **no cookie-scraping** (Agent-Reach is dead on our side; keep it dead across the seam).
- **P1** — all keys/webhook secrets in each side's env, never in chat or commits.

---

**Next step:** your team confirms/corrects §3, hands back §6 (the intake contract is the
unblocker), and we wire **Seam ① (lead handoff)** as the first real join — gated,
fail-safe, contract-first. Then the §8 dogfood thread for VoiceCosmos.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
