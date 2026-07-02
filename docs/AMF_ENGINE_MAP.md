# AMF Content Engine — Map (A→L, end to end)

> **Status:** 2026-07-03 · Diagram companion to [`AMF_PROCESS.md`](./AMF_PROCESS.md)
> (the prose walkthrough). This doc is the **map**: the pipeline at a glance,
> module-by-module, with honest verified-vs-gated status per stage (P4 — never
> claim more than you can verify).
>
> Grounded in the 22 worker modules on disk at `apps/amf/worker/`, not from memory.

---

## The pipeline

```
  A  POSITION      portfolio-universe.json ....... 14 products · ratified positioning
  │                (angle · topics · keywords · sales_signals · signal_query · feeds · filters)
  ▼
  B  DEMAND        analyze.mjs .................... autocomplete + news vol + HN + YouTube
  │                                                 → CORE / EXPAND / EDUCATE  (Demand Atlas)
  ▼
  C  SOURCES       discover.mjs · opml-import.mjs · rate-source.mjs
  │                Hand-1 human curation → feed tiers (T1 / T2 / T3)
  ▼
  D  INGEST        adapter-news.mjs (8 providers) · pillars-ingest.mjs
  │                googlenews · rss(authority feeds[]) · hackernews · youtube · own ·
  │                worldmonitor · feedly · reddit    → CONTINUUM observations (FTS5)
  ▼
  E/F/G MATCH + RANK + DRAFT   content-matcher.mjs
  │                boolean must/not GATE → 6-D rank
  │                (relevance × recency × authority × sales × engagement × FEEDBACK)
  │                feedback = Seam ② learning: approved topics ↑ · rejected ↓ (bounded 0.8–1.3)
  │                → draftViaLLM (grounded, no invented stats)   format: post | report
  ▼
  H  PRODUCE       produce-post · produce-report · produce-short · render · broll ·
  │                compose-broll · syndicate · voice_pipeline.py
  │                → MP4 (9:16 voiced / captioned) · multi-section PDF · syndicated post
  ▼
  I  REVIEW  ◇──   review.mjs .................... HUMAN GATE (approve / reject, idempotent)
  │  (P9)          out/review-queue/{pending, approved, rejected}
  ▼
  J  HANDOFF       stage-j.mjs ................... Seam ① → XENOS /api/crm/leads/capture
  │                                                 (x-intake-key · gated · fail-safe)
  ▼
  K  MEMORY        CONTINUUM ..................... every stage → verifiable observation / checkpoint
  ▼
  L  AUTOPILOT     event-loop.mjs · cron-trigger.mjs · pipeline.mjs (runProductChain)
                   portfolio pulse → per-product chain → review gate

  ↺  RETURN LOOP   pulse.mjs (Seam ⑤ push draft) · feedback-sync.mjs (Seam ② decisions → ground_truth)
                   · pulse-return.mjs (approve → render)
                   HITL_REWARD { approve 1.0 · modify 0.7 · reject 0.2 }
```

## Status — verified vs gated

| Stage | Module(s) | Status |
|---|---|---|
| **A · Position** | `portfolio-universe.json` | ✅ 14 products ratified · **4 gated** (voicecosmos, viwago, voinista, studiomunich) · 14 with feeds + signal_query |
| **B · Demand** | `analyze.mjs` | ✅ ran full portfolio → Demand Atlas ([`DEMAND_ATLAS_2026-07-01.md`](./DEMAND_ATLAS_2026-07-01.md)) |
| **C · Sources** | `discover.mjs` · `opml-import.mjs` · `rate-source.mjs` | ✅ built + validated (Simon Willison; 404 Media locked live 2026-07-02) |
| **D · Ingest** | `adapter-news.mjs` (8) · `pillars-ingest.mjs` | ✅ key-free path proven (googlenews + rss + HN); youtube keyed; **reddit 403** (uses public `/search.json` — needs a free OAuth token to fix); feedly / worldmonitor gated |
| **E/F/G · Match** | `content-matcher.mjs` | ✅ **proven live 2026-07-02**: 85 → 17 (80% noise gated) → 5-D ranked → LLM-drafted |
| **H · Produce** | `produce-*` · `render` · `broll` · `voice_pipeline.py` | 🟡 **partially proven** — one 9:16 voiced MP4 + one 6-page PDF verified on disk; a path, not yet a factory. **VAULT rented-talent path is contract-only** (see below) |
| **I · Review** | `review.mjs` | ✅ human gate, idempotent (approve ≠ publish — P7/P9) |
| **J · Handoff** | `stage-j.mjs` | 🟡 **built + gated** — replaces the dead `DEMO_WEBHOOK_URL`; awaiting `XENOS_LEADS_KEY` + XENOS's `meta` passthrough (blocker B1) so leads route to the owner tenant UUID |
| **K · Memory** | CONTINUUM | ✅ live (dogfooded — this repo's own checkpoints) |
| **L · Autopilot** | `event-loop.mjs` · `cron-trigger.mjs` · `pipeline.mjs` | 🟡 built; **not yet run unattended** |
| **↺ · Return loop** | `pulse.mjs` · `feedback-sync.mjs` · `pulse-return.mjs` · **`content-matcher` (fb)** | 🟡 **built + gated** on `XENOS_HITL_KEY` + `/api/hitl/recent-decisions` — but the **learning half is now closed in code** (2026-07-03): `content-matcher` reads `ground_truth` rewards and re-weights ranking. Co-locate `feedback-sync` output with the content pool to activate |

### Gating detail (verified in code 2026-07-03)

- **Stage H — StudioMunich VAULT is a contract, not yet code (P4).** The intended guard
  — *decline to synthetic avatars, never serve an unsigned human likeness* — and the
  `X-Rights-Signature` / webhook spec live in
  [`STUDIOMUNICH-TALENT-HANDSHAKE.md`](./STUDIOMUNICH-TALENT-HANDSHAKE.md) **only**. The
  `STUDIOMUNICH_VAULT_*` env keys appear (commented) in `.env.local.example`; they are
  **not referenced by any worker module**, and `produce-short.mjs` has no decline logic.
  Until the VAULT team ships the authoritative playbook, base URLs, bearer secret, the
  precise `X-Rights-Signature` spec, the webhook contract, and a live test actor — **and**
  the decline-to-synthetic guard is implemented — the produce path uses synthetic avatars
  only. Today the rented-talent path is "in shadow": designed, not wired.
- **Stage J — lead hook.** `stage-j.mjs` `buildLeadPayload()` sets `tenant_id` = the OWNER
  tenant (VoiceCosmos's CRM, not the prospect) via `xenos-registry.json`, and passes the
  prospect's product interest + AMF asset refs through `meta`. Gated on
  `XENOS_LEADS_URL` + `XENOS_LEADS_KEY`; the 5 confirmed products still need real
  `owner_tenant_id` UUIDs from XENOS.
- **Stage D — Reddit.** The `reddit` provider hits the public JSON endpoint and is
  currently 403'd; the free fix is an OAuth app token (the other 7 providers are unaffected).

## The quality lever — two hands on the gate

The engine keeps signal on-brand with two coordinated mechanisms:

- **Hand-1 (human, encoded once):** feed tiers + the boolean `must` / `not` gate in
  `portfolio-universe.json`. Curation the operator ratifies, not re-decided per run.
- **Hand-2 (machine, every run):** the 5-D rank in `content-matcher.mjs`
  (`relevance × recency × authority × sales × engagement`). The gate runs **before**
  scoring, so noise is dropped before it can win.

Live proof (studiomunich, a product with zero sources until 2026-07-02): 85 ingested
→ gate KEEP 17 / DROP 68. Drops were off-topic (AI token costs, data-center power);
keeps were dead-on (Senate AI Likeness Bill · AI-music royalties · name/likeness deals).

## The one-line truth

**A→I runs end-to-end today and is verified** (position → demand → sources → ingest →
gated 5-D match → grounded LLM draft → produce → human gate). **J, L, and the return
loop are built but gated** on two XENOS keys + one endpoint. Nothing autonomously
publishes: the human gate at **I** holds (P9), and approved ≠ published (P7).

## What blocks full autopilot (inputs, not code)

1. `XENOS_LEADS_KEY` + `XENOS_HITL_KEY` + XENOS exposing `/api/hitl/recent-decisions`
   → unlocks Stage J + the return loop.
2. Owner tenant UUIDs (5 confirmed products) → leads route to the right tenant.
3. Brand Kernel fuel — a 30–60 min origin monologue + 50 best posts
   (**P9-blocked, cannot be synthesised** — see [`BRAND_KERNEL.md`](./BRAND_KERNEL.md)).

## Related

Prose walkthrough: [`AMF_PROCESS.md`](./AMF_PROCESS.md) · Demand: [`DEMAND_ATLAS_2026-07-01.md`](./DEMAND_ATLAS_2026-07-01.md) · Brand voice: [`BRAND_KERNEL.md`](./BRAND_KERNEL.md) · XENOS loop: [`AMF-XENOS-AMALGAMATION-HANDSHAKE.md`](./AMF-XENOS-AMALGAMATION-HANDSHAKE.md) · [`AMF-XENOS-RECONCILIATION.md`](./AMF-XENOS-RECONCILIATION.md) · Docs hub: [`INDEX.md`](./INDEX.md) · Map: [`../router.md`](../router.md)

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
