# AMF Content Engine — Map (A→L, end to end)

> **Status:** 2026-07-03 · Diagram companion to [`AMF_PROCESS.md`](./AMF_PROCESS.md)
> (the prose walkthrough). This doc is the **map**: the pipeline at a glance,
> module-by-module, with honest verified-vs-gated status per stage (P4 — never
> claim more than you can verify).
>
> Grounded in the 26 worker modules on disk at `apps/amf/worker/` (see the Project Map
> [`apps/amf/worker/AGENTS.md`](../apps/amf/worker/AGENTS.md)), not from memory.

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
  │                LIVE key-free: googlenews · rss(authority feeds[]) · hackernews
  │                LIVE keyed:    youtube (key present)     WIRED-empty: own (needs own_feeds[])
  │                GATED 3:       reddit (403→OAuth) · feedly (Enterprise token) · worldmonitor (API key)
  │                → CONTINUUM observations (FTS5)   ⚠️ it is 4 live / 3 gated, NOT "7/8"
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
| **D · Ingest** | `adapter-news.mjs` (8) · `pillars-ingest.mjs` | ✅ **4 live** — googlenews · rss · hackernews (key-free) + youtube (keyed, key present). `own` wired but empty (no `own_feeds[]`). 🔴 **3 gated: reddit** (403 → OAuth), **feedly** (`FEEDLY_ACCESS_TOKEN`+`STREAM_ID` — absent, Enterprise), **worldmonitor** (`WORLDMONITOR_API_KEY` — absent). **NOT "7/8" — Feedly + worldmonitor are gated, not live** (the "Reddit 403" story keeps eclipsing them). |
| **E/F/G · Match** | `content-matcher.mjs` | ✅ **proven live 2026-07-02**: 85 → 17 (80% noise gated) → **6-D ranked** (relevance × recency × authority × sales × engagement × **feedback**) → LLM-drafted |
| **H · Produce** | `produce-*` · `render` · `broll` · `voice_pipeline.py` · **`vault-guard`** | 🟡 **partially proven** — one 9:16 voiced MP4 + one 6-page PDF verified on disk; a path, not yet a factory. **VAULT rights wall now built + verified** — `vault-guard.mjs` (decline-to-synthetic, 9/9 branches) is wired into `produce-short`; the signed-presenter *render/composite* is the remaining VAULT-gated build (see below) |
| **I · Review** | `review.mjs` | ✅ human gate, idempotent (approve ≠ publish — P7/P9) |
| **J · Handoff** | `stage-j.mjs` | 🟡 **built + gated** — replaces the dead `DEMO_WEBHOOK_URL`; awaiting `XENOS_LEADS_KEY` + XENOS's `meta` passthrough (blocker B1) so leads route to the owner tenant UUID |
| **K · Memory** | CONTINUUM | ✅ live (dogfooded — this repo's own checkpoints) |
| **L · Autopilot** | `event-loop.mjs` · `cron-trigger.mjs` · `pipeline.mjs` | 🟡 built; **not yet run unattended** |
| **↺ · Return loop** | `pulse.mjs` · `feedback-sync.mjs` · `pulse-return.mjs` · **`content-matcher` (fb)** | ✅ **learning loop CLOSED in code** (2026-07-03, `516d3a1`): `content-matcher.feedbackWeight` reads `ground_truth` rewards → re-weights the 6-D rank (approved topics ↑, rejected ↓, bounded). 🟡 **gated only on live fuel** — `XENOS_HITL_KEY` + `/api/hitl/recent-decisions` supply the decisions; co-locate `feedback-sync` output with the content pool to activate |

### Gating detail (verified in code 2026-07-03)

- **Stage H — the VAULT rights wall is now built (2026-07-03).** `vault-guard.mjs` is the
  single enforcement point every presenter passes through: `studiomunich:<actorId>` (rented
  human) requires a verified `X-Rights-Signature` — recomputed HMAC-SHA256 over
  `[actorId, modality, phraseHash, duration, tier]`, **hard-reject on mismatch, timing-safe**;
  `digital:<id>` (synthetic) serves freely. Fail-safe: no secret (VAULT in shadow) / 404 /
  forged / tampered / takedown → **decline → synthetic**, never the unsigned likeness. Proven
  9/9 branches + a real `produce-short` run (requested `studiomunich:astrid` → declined to
  synthetic; MP4 still built). **Still gated (the render half):** the guard clears/declines,
  but the *signed-presenter render + composite* needs VAULT's playbook, base URL + bearer,
  the exact `X-Rights-Signature` encoding (§7.3 — must match byte-for-byte), the webhook
  contract, and a live test actor. Until those land the wall keeps the path in shadow —
  designed to serve rented talent, wired to refuse it until it's provably signed.
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
- **Hand-2 (machine, every run):** the **6-D rank** in `content-matcher.mjs`
  (`relevance × recency × authority × sales × engagement × feedback`). The 6th factor,
  **feedback**, is Seam ②'s closed learning loop — prior XENOS `ground_truth` rewards nudge
  future ranking (approved topics ↑, rejected ↓, bounded 0.8–1.3). The gate runs **before**
  scoring, so noise is dropped before it can win.

Live proof (studiomunich, a product with zero sources until 2026-07-02): 85 ingested
→ gate KEEP 17 / DROP 68. Drops were off-topic (AI token costs, data-center power);
keeps were dead-on (Senate AI Likeness Bill · AI-music royalties · name/likeness deals).

## The one-line truth

**A→I runs end-to-end today and is verified** (position → demand → sources → ingest →
gated 6-D match → grounded LLM draft → produce → human gate). **J, L, and the return
loop are built but gated** on XENOS credentials. Nothing autonomously publishes: the
human gate at **I** holds (P9), and approved ≠ published (P7).

## Blockers — layered by owner (what each actually gates)

Everything below is an **input**, not code — our side is built + verified. Full checklist:
[`PARTNER-INTEGRATION-REQUESTS.md`](./PARTNER-INTEGRATION-REQUESTS.md).

**① XENOS — gates the single green thread (Seams ①/⑤/② → J, L, return loop):**
- `XENOS_LEADS_KEY` + URL **+ the `/capture` payload schema**
- `XENOS_HITL_KEY` + URL
- expose **`GET /api/hitl/recent-decisions`**
- the **`meta` passthrough** (blocker B1)
- **13 owner tenant UUIDs** (0 filled)

**② VAULT — gates rented talent ONLY (NOT the green thread — it runs synthetic):**
- playbook · base URL + bearer · exact `X-Rights-Signature` encoding · webhook · live test actor.
  The rights wall already declines to synthetic, so a green-thread short renders without VAULT.

**③ Operator (P9) — gates voice, not the mechanism:**
- the 30–60 min Brand Kernel monologue + 50 posts (**cannot be synthesised** —
  [`BRAND_KERNEL.md`](./BRAND_KERNEL.md)).

**④ Internal (non-partner, self-clearable, parked):**
- Reddit OAuth (7-of-8 providers work) · Stage L watchdog (never run unattended) ·
  the flat→folder migration (13 hardcoded paths — after the green thread).

**Critical path to the VoiceCosmos dogfood:** only **4 XENOS items** — the leads key (+ payload
schema), the `/recent-decisions` endpoint, the `meta` passthrough, and **one** VoiceCosmos owner
UUID. VAULT, Brand Kernel, and the internal tasks are **off** the first-thread path.

## Vision vs. Verified Gap (the honest ledger — audited 2026-07-04)

> **Why this section exists.** A "7-Layer AMF" marketing narrative circulates alongside
> this engine. Much of it is aspirational. Per P4 (never claim more than you can verify)
> and partner-clause #1 (no silent overrides), this section pins the grand vision against
> what a `grep` of the worker's **own source** (`apps/amf/worker/*.mjs`, `*.py` — node_modules
> excluded) actually finds, so a cold-start session inherits the real distance, not the pitch.
> Method: evidence-based grep + file:line, 2026-07-04.

| Layer (as pitched) | Verified in the worker's own source | Tier |
|---|---|---|
| **1 · Control Plane** (ECC / Supacode) | Orchestration substrate **real + proven**: `event-loop.mjs`, `cron-trigger.mjs`, `pipeline.mjs`, `supervisor.mjs`, nightly portfolio pulse running unattended. "ECC/Supacode" branding: **not in code.** | ✅ substrate · 🔮 branding |
| **2 · Social Intelligence** (last30days-skill, Agent-Reach, Fun Judge, cookie-bypass scraping) | `adapter-news.mjs` real — **4 providers live, 3 gated**. `agent-reach`: 1 ref. `fun judge` / `last30days`: **0 in code.** Reddit is **403-gated (needs OAuth)** — the *opposite* of "bypassing walls." | 🟡 ingest · 🔮 virality-scorer |
| **3 · Scripting** (Addictive Storytelling AI Director, neuro-pacing, 5-Gate Delivery Contract) | `content-matcher.mjs` drafting seam real but **template-grade** (no LLM key). AI Director, neuro-pacing loop, 5-Gate blocker: **0 in code.** | 🟡 seam · 🔮 quality-gates |
| **4 · Asset Synthesis** (ComfyUI GPU swarm, ElevenLabs, Auphonic) | `voice_pipeline.py` real — **own-stack (VoxCPM / Supertonic), NOT ElevenLabs**. `vault-guard.mjs` rights wall proven 9/9. `comfyui`(2) / `auphonic`(3) referenced, **not verified working**. Render path **hangs** (open finding). | 🟡 partial |
| **5 · Assembly** (FFmpeg, Remotion, hyperframes, Hermes Video Judge) | `broll` / `compose-broll` / `render.mjs` real (ffmpeg). `hyperframes`(3) / `gsap`(2) referenced. **Hermes recursive video-judge: 0 in worker** — separate `hermes-agent` repo, unintegrated. | 🟡 assembly · 🟠 judge |
| **6 · Paid Amplification** (15-agent media-buying swarm) | **The code disclaims it itself** — `event-loop.mjs:9-13`: *"the Layer-6 marketing swarm is NOT here — @metaharness/router does not exist, there are no ad accounts."* No autonomous spend without a human (P6/P9). | 🔮 explicitly absent |
| **7 · Lead Conversion** (AiToEarn, LeeAAD CRM, comment-miner, Pod-Geni RAWPITCH) | `stage-j.mjs` lead handoff real but **XENOS-gated (not LeeAAD)**. `aitoearn` / `vigola` / comment-miner: **0 in worker.** `podcast-pod-geni-ai` exists as a repo. | 🟡 handoff · 🔮 comment-to-revenue |

### Five ratified corrections (marketing → verified odometer)

1. **Token savings:** the "10x" number is **dead**. Progressive disclosure yields a **measured ~2.85x** (up to 5.3x single-record) — `README.md:98`.
2. **Reddit ingestion:** not "bypassing API walls." The provider hits the public JSON endpoint and is **currently 403-gated** (free fix = OAuth token).
3. **Voice synthesis:** **no ElevenLabs.** Own-stack **VoxCPM / Supertonic** for synthetic; **StudioMunich VAULT** for rented human talent (gated).
4. **CRM handoff:** Stage J hands off to **XENOS**, not LeeAAD Flow.
5. **Video judging:** the recursive **Hermes AI Video Judge is a separate repo, unintegrated** with this worker.

**Takeaway (hold the line):** we have a genuinely rare, key-independent, **self-driving A→L skeleton (Layers 1–5 substrate + a publish seam)** — not the "impressive organs" (AI Director, ComfyUI swarm, Hermes judge, 15-agent paid swarm, AiToEarn comment-miner). Complete the **single VoiceCosmos green thread** (4 XENOS items) before wiring any of the aspirational organs. The vision is the destination; this table is the odometer.

## Related

Prose walkthrough: [`AMF_PROCESS.md`](./AMF_PROCESS.md "detailed in") · Demand: [`DEMAND_ATLAS_2026-07-01.md`](./DEMAND_ATLAS_2026-07-01.md "feeds") · Brand voice: [`BRAND_KERNEL.md`](./BRAND_KERNEL.md "grounded on") · XENOS loop: [`AMF-XENOS-AMALGAMATION-HANDSHAKE.md`](./AMF-XENOS-AMALGAMATION-HANDSHAKE.md "hands off to") · [`AMF-XENOS-RECONCILIATION.md`](./AMF-XENOS-RECONCILIATION.md) · Docs hub: [`INDEX.md`](./INDEX.md "indexed by") · Map: [`../router.md`](../router.md)

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
