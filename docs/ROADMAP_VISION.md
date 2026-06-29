# CONTINUUM — Roadmap Vision (North Star Alignment)

> **Durable, status-tagged source of truth.** This supersedes ad-hoc blueprints
> pasted into chat. If a future idea isn't here, add it here — don't re-paste it
> into a session. That is the whole point: CONTINUUM is a memory engine; its own
> roadmap should live in a ledger, not a context window.
>
> **Bound by The Nine v0.1.0** (`AGENTS.md`). Governing discipline below.

_Sealed into the append-only checkpoint ledger via
`scripts/checkpoints/roadmap-vision-2026-06-20.mjs`._

---

## Governing principle — verify-then-dissolve, applied to our own buildout

Every phase ends in a **shell-verifiable gate**. No phase is "done" until a
command exits 0 to prove it. Sequencing is not bureaucracy — it is Partner
Agreement **Clause #3** (*Code > architecture revision; the architecture is the
menu, food doesn't arrive until we cook*) encoded as a plan. We add to the menu
freely; we cook in order.

**Legend:** ✅ done · 🔒 locked decision · 🚧 gated (blocked on a decision or
dependency) · 🅿️ parked (tracked, not started) · ❌ rejected (with evidence)

---

## Phase 0 — Land V1 (NOW) — *the only phase that currently matters*

The V1 OSS launch. ~95% done; parked at the human trust-leap (npm 2FA, **P9**).

| Item | Status | Note |
|---|---|---|
| Repo public + Apache-2.0 | ✅ | `github.com/number7even/CONTINUUM` |
| `gitleaks` full-history scan | ✅ | 91 commits, clean (6 synthetic fixtures allowlisted) |
| protobufjs CVE cleared | ✅ | forced `protobufjs@7` override; audit allowlist emptied; 120/120 tests |
| `CODE_OF_CONDUCT.md` (Covenant 2.1) | ✅ | contact `riaan@number7even.com` |
| Domain topology cut over | ✅ | see "Already true" below |
| Console operator-only hardening | ✅ | noindex + CSP + headers, verified in prod |
| Docs site scaffolded + deployed | ✅ | Astro Starlight, `continuum-docs.vercel.app` → apex |
| **npm publish** `core → mcp-server → cli` | 🚧 | **blocked on a working npm token (2FA, P9 — human's leap)** |
| `$impeccable` docs polish sequence | 🚧 | audit → polish → typeset → harden → animate → optimize → layout → polish → colorize → clarify → re-audit |
| `continuum-docs` git auto-deploy | 🅿️ | connect after polish passes (deliberate) |

**Gate:** `npm view @continuum/core version` returns a version (not 404) · docs
live at apex · CI green · gitleaks clean. **Nothing below starts until this gate passes.**

---

## Phase 1 — Perimeter Intelligence (V1.5) — *real CONTINUUM work*

Solve the cold-start problem: understand massive external codebases without
burning millions of tokens. Implemented as a **new Source adapter behind the
existing seam** — not an engine change.

- **`git-mcp`** (idosal/git-mcp) — wired as a **peer MCP server**. Day-1, **zero
  CONTINUUM code**. Live upstream docs/code access for any GitHub repo. Cheapest
  win; do first. 🅿️
- **`adapter-remote-git`** — embed **Gitingest's core library** (not its FastAPI
  service) → optimized repo digest + token counts; pipe through **GitReverse**
  synthesis → a compressed "Objective State Payload" Observation. Synthesis step
  **pluggable**, routed to local `ruvllm` at V0.5 so repo context never leaves
  the box. 🅿️ (Issues #21 / #22)

**Gate:** ingest a remote repo → Observation lands → 3-layer Progressive
Disclosure retrieves it under a token budget.

---

## Phase 2 — V2 Substrate — *gated on a human decision, not code*

🚧 **Blocking decision first — lock `D-V2.2`** in `ARCHITECTURE.md §14`:
> Does the V2 SaaS use Postgres **purely as a control plane** (OAuth, billing,
> RLS, tenant boundaries) wrapping a **RuVector data plane** — or does V2 revert
> entirely to Postgres? **pgschema's scope is undefined until this is locked.**
> This is a one-conversation decision, not a build task.

Then:
- **pgschema** (control plane) — declarative, Terraform-style Postgres schema.
  Tenant boundaries + OAuth + **RLS policies as version-controlled IaC**.
  `pgschema plan` in CI = a shell command that **proves cross-tenant isolation
  before deploy** (the moat, one layer down). 🚧
- **RuVector** (data plane) — migrate SQLite/Chroma → RuVector behind the locked
  `StorageBackend` seam. Native multi-tenant collections, RVF copy-on-write
  memory snapshots, GNN/SONA retrieval learning. 🔒 (D2 locked; this is the
  implementation, not the seam).

**Gate:** `pgschema plan` proves RLS invariants green in CI; the W27 mechanical
tenant-isolation proofs pass on Postgres.

---

## Phase 3 — Execution Substrate — *Headroom pulled forward (operator directive 2026-06-20)*

- **Headroom** — token compression downstream of the shell (tool outputs, logs,
  RAG chunks). Up to ~92% savings on heavy tasks, **reversible (CCR)** so the LLM
  can pull unshortened data back when precision is needed. **High-ROI, low-risk,
  independent** → pulled forward to run alongside Phase 1. Compounds the
  measured ~2.85× Progressive-Disclosure saving (P6-T4) with shell-output
  compression. 🅿️
- **ECC (Extensible Claude Code)** — agents/skills + expanded hook event types.
  Adopt as tooling. 🅿️
- **AgentShield** — `/security-scan` static analysis on hooks/prompts before
  execution. 🅿️

**Gate:** Headroom benchmark shows the claimed compression on a real workload,
with CCR round-trip proven lossless on a precision-sensitive task.

---

## Phase 4 — H-MARA Reasoning Ladder — *hard-gated, mathematically honest*

- **Rung 0 (H-MARA-Lite)** — repurpose the chat UI as Gateway MVP: De-Biasing
  Extraction Compiler (DEC) pipeline, single-tier router, MCTS-lite "blind
  debate" (Proponent proposes, Skeptic attacks) → saves an `mcts_witness`
  Observation. **Buildable on cloud APIs.** 🅿️
- **Deeper rungs (true MCTS · RVM bare-metal detonation · KV-affinity mesh)** —
  🚧 **gated on local inference (`ruvllm`, Issue #3).** RecursiveMAS scales agent
  collaboration through latent-space recursion via RecursiveLink modules, which
  read **hidden-state activations**. Anthropic / OpenAI / Google APIs **do not
  expose hidden states**, so RecursiveLink is physically incoherent against them.
  Hard-gating deeper rungs behind local inference is the only honest choice.

**Gate:** Rung 0 ships a real debate → `mcts_witness` lands; deeper rungs do not
start until `ruvllm` local inference exists.

---

## Phase 5 — Autonomous Media Factory (AMF) — *separate product, separate repo*

🔒 **Architectural boundary:** AMF lives in its **own isolated repo (`AMF/`)**.
It is a **different product** that *consumes* CONTINUUM's "verify-then-spend"
moat as an external dependency over MCP. This isolation keeps AMF's heavy media
generation from drowning CONTINUUM's engineering-memory core. **Months, not
weeks.** Captured here in full so the vision is preserved; **not** on CONTINUUM's
critical path.

**Substrate rules (govern the swarms):**
1. **Agent OS** — ECC `ccg-workflow` runtime for multi-LLM orchestration.
2. **State/queues** — no blocking sequential API calls. Pub/Sub event loop
   (Redis / BullMQ); agents pass a single strict **append-only JSON state doc**
   across the queue.
3. **OKF (Open Knowledge Format)** — no hardcoded heuristics. Scoring logic,
   crawler rules, SEO guidelines as Markdown + YAML frontmatter ("folders over
   agents").
4. **Decentralized routing** — no hardcoded frontier models; route through
   `@metaharness/router` (cheapest capable model per task).
5. **Doubt-Driven Development** — Fable Brain Kit + Agent Skills; agents verify
   claims/metrics/asset quality **before spending ad budget**.

**7-layer build order (full component spec, captured 2026-06-22):**

- **L1 Developer Control Plane & Orchestration** — the OS + local command center.
  - **Supacode** — native macOS terminal command center (libghostty + mise) for
    managing/monitoring multi-agent terminal instances.
  - **ECC (Extensible Claude Code)** — core Agent OS; `ccg-workflow` runtime for
    multi-LLM orchestration.
  - **Compound Engineering Plugin** — enforces 80/20 (heavy plan, fast execute);
    `/ce-strategy` writes a durable `STRATEGY.md` memory so agents don't repeat
    mistakes.
  - **MetaHarness** — mints repo-aware harnesses with governance + the
    `@metaharness/router` (dynamic cheap-model routing).
- **L2 Social Intelligence & Ingestion (the Brain)** — hunt viral topics first.
  - **last30days-skill (v3)** — scrapes real engagement (Reddit upvotes, X likes,
    YouTube transcripts, TikTok, Polymarket odds); "pre-research brain" resolves
    *where* to search before firing APIs; "Fun Judge" scores wit/virality.
  - **Agent-Reach** — unhindered-access layer; uses local browser cookies to
    bypass API fees / 403s / login walls (Reddit, X, Xiaohongshu). ⚠ ToS/ethics
    review required before any use.
- **L3 Scripting, SEO & Content Generation.**
  - **Addictive Storytelling (AI Director)** — Vercel AI SDK aligns dialogue to
    scene prompts; structure: Stakes → Big Question → Head Fake → Rehook.
  - **claude-blog** — 5-Gate Delivery Contract; a Judge agent scores against a
    100-pt rubric, iterating up to 3× until ≥90.
  - **claude-seo / OKF-Native SEO** — up to 15 parallel specialists for
    Google / GEO / Schema.org. *(claude-seo already installed in this env.)*
- **L4 Headless Asset Synthesis (video factory floor)** — decoupled async queues.
  - **Headless GPU Swarm (ComfyUI)** — Asset Agent overwrites JSON workflow
    templates with prompts, fires over WebSocket to a bare-metal GPU cluster.
  - **ElevenLabs** — narration + exact ms byte-marker timestamps for frame-sync.
  - **ian-xiaohei-illustrations** — 16:9 minimalist white-bg metaphor visuals
    (black "Xiaohei" character, sparse Chinese annotations).
- **L5 Programmatic Assembly & Organic Syndication.**
  - **FFmpeg / Remotion** — programmatic edit bay: concatenation, audio ducking,
    subtitle burn-in via ElevenLabs timestamps.
  - **Hermes AI Video Judge** — watches the final render, scores /10, recursively
    commands edits until pacing/visual bugs clear.
  - **Vigola** — cron clipper; hunts viral hooks in long-form → 9:16 shorts.
  - **AiToEarn** — central publisher (MCP + relay); 10+ platforms at once;
    optimizes for the YouTube algorithm (carousels/quizzes to the Community Tab).
- **L6 Paid Amplification & Performance Marketing.**
  - **AI Marketing Swarms** — 15-agent hierarchical mesh for 24/7 cross-platform
    media buying; fraud spotting, real-time bids, creative-fatigue prediction,
    winning-creative "DNA" mutation. ⚠ real-money actions: hard verify-then-spend.
  - **claude-ads** — auditor skill; 10–15 min deep-dives on Google/Meta/TikTok →
    prioritized action plans + 0–100 health scores.
- **L7 Lead Conversion & Sales Pipeline.**
  - **AiToEarn Intent Mining** — Engagement Agent monitors comments in real time,
    detects buy-intent signals, deploys LLM smart replies to capture leads.
  - **MetaHarness Pods** — `vertical:sales` + `vertical:crm` pods autonomously
    follow up, nurture, and close inbound prospects.

**Architectural integration standards (every AMF component must comply):**
MCP + ECC for agent comms · Redis/BullMQ Pub/Sub with a single append-only JSON
state doc (no blocking sequential calls) · OKF Markdown+YAML for all
heuristics/rules (no hardcoded Python) · `@metaharness/router` for model routing
(no hardcoded frontier models) · Fable Brain Kit + Agent Skills behavioral
baseline (Doubt-Driven Development).

**Gate (AMF, internal):** every spend action carries a `verifyCommand`-equivalent
witness before budget is committed — verify-then-spend. ⚠ Components touching
real money (L6 swarms) or platform ToS (L2 Agent-Reach) require explicit operator
sign-off before any live run.

**AMF build decisions (operator, 2026-06-23):**
- **Voice — SUPERSEDED (ZeroEdit, later same day): HUMAN voice, no AI TTS.**
  ZeroEdit mandates a real creator voice recording (QuickTime) routed through
  the **Auphonic API** for studio enhancement + word-timestamp extraction, to
  protect YouTube monetisation and avoid "AI slop". This **reverses** the
  earlier-same-day `rapidaai/voice-ai` + `VoxCPM` AI-voice decision (kept here
  as the iteration log per append-only honesty). L4 audio = human rec + Auphonic,
  NOT AI synthesis. ⚠ Auphonic is a paid API (operator account/key).
- **GPU/Hetzner:** operator is procuring bare-metal RTX (Hetzner). L4 ComfyUI
  video render unblocks when it lands.
- **Ghost (L5 owned-media):** MIT self-host. Needs a domain + Stripe key
  (operator-provided). Articles publish here.
- **Agent-Reach (L2):** 🚧 **HELD — operator reviewing ToS/legal exposure**
  (cookie-based scraping of walled gardens). Not wired until explicit go.
  L2 ingestion proceeds in the meantime on **public, ToS-clean sources only**
  (Reddit public JSON, Polymarket public API, YouTube RSS).
- **Strategic priority:** the content engine (L2→L5 producing path) is the
  **main GTM**. Build order favours getting topic→script→render working over
  L6/L7 monetisation.
- **amf.continuum.rest:** control-room shell SHIPPED (5-tab Headless Hive).
- **L5 syndication = yikart/AiToEarn (CONFIRMED + verified, 2026-06-24).** MIT,
  13+ platforms (TikTok/YouTube/IG/X/LinkedIn/Threads/Pinterest + CN nets),
  **self-hostable via Docker**, **native MCP integration** (AMF agents publish
  over MCP). Auth reality (verified from README, P4): the **Relay** removes
  per-platform DEVELOPER-APP registration, but you STILL connect + authorize
  each project's real social accounts once. DECISION: **self-host** (M4 Mini /
  VPS) — do NOT route 8 brands' account access through the hosted aitoearn.ai
  relay. ⚠ automation-ToS pacing risk (warm accounts, don't blast).
- **Scale = 8 projects, daily, autopilot (operator, 2026-06-24).** Forces the
  voice track to **AI voice (VoxCPM2/TTS)** for volume — human voice cannot
  scale to 8 daily recordings (overrides the earlier human-voice lock for the
  autopilot track; human voice stays a premium/flagship option). Each project =
  a tenant config (topic/brand/targets) on the W27 TenantRegistry. Worker =
  Mac Mini M4 16GB (publish-then-purge for the 256GB SSD).
- **Access gating (2026-06-24):** AMF login gate SHIPPED — HMAC-signed session
  cookie, `/login`, `/api/auth`, middleware. Safe-by-default: OPEN until the
  operator sets `AMF_ACCESS_PASSWORD` + `AMF_SESSION_SECRET` (then ENFORCED).
  This is the foundation; full **multi-tenant** (tenant management + per-tenant
  namespaces + app onboarding) is the larger build — to be layered on the
  engine's existing W27 tenant infra (TenantRegistry, JWT tenant-claims,
  sanitiseTenantId).
- **✅ VOICE DECISION RESOLVED (operator ruling, 2026-06-24): HYBRID, layered.**
  Not a binary choice — two engines for two layers:
  - **L4 (video content): HUMAN voice + Auphonic — FINAL.** Protects YouTube
    monetisation, defeats the "AI slop" demonetisation risk, secures the revenue
    floor. This is what the shipped L4 implements. ✓
  - **L7 (lead conversion / interactive assistants): AI voice = VoxCPM2 + Rapida.**
    Real-time interactive lead conversion + white-label AI assistants, 30+
    languages. Different purpose, different layer — no conflict.
  Supersedes the ElevenLabs / VoxCPM-for-L4 iterations (kept above as the log).
  Zone-1 (The Brain) is LIVE on real public sources (HN + Lobsters); zones
  2–5 remain labelled scaffold.
- **ZeroEdit pipeline (new components, 2026-06-23):** the AMF producing path
  adopts the "ZeroEdit" methodology (reverse-engineer competitor channels →
  validate outlier demand → human voice + AI visuals → ~$0.30–0.60/min).
  New named tools to integrate: **HyperFrames** (`heygen-com/hyperframes`,
  `npx skills add` — agentic HTML/CSS/GSAP video renderer, replaces manual
  Higsfield CLI) at L5; **Auphonic** at L4 (audio); **Pod-Geni RAWPITCH**
  advisory marketplace as the L7 monetisation endpoint (paid 45-min advisory
  sessions, not just ad revenue). Orchestration stack named: Supacode (L1
  terminal), ECC + MetaHarness + Compound-Engineering (`/ce-strategy` →
  STRATEGY.md), Redis/BullMQ queue, `@metaharness/router`. All still gated /
  parked behind GPU + paid accounts + the orchestration build.

### B-roll generation pipeline (L4-visual + L5) — *spec sealed 2026-06-29, unbuilt*

Beyond the walk-and-talk presenter, the content engine composites the talking head
**over generated b-roll**. The pipeline, to-spec and honestly labelled:

| Stage | Spec (standard) | Status |
|---|---|---|
| L4 audio | Human voice (QuickTime) → **Auphonic** enhance on the worker queue (human voice mandated for YT monetisation) | 🟡 worker queue exists; Auphonic key unwired (P9) |
| L4 visuals | word-level timestamps → b-roll synced to them. **ComfyUI GPU swarm** (needs a GPU box) is the target; **fal.ai** the cheap stand-in (LTX output rejected — needs Kling-tier or curated/licensed library) | ❌ unbuilt |
| L5 matte | presenter cut-out from VC (`§3a` of the VC handover) — clean alpha to composite over b-roll | 🅿️ gated on VC handover |
| L5 assembly | **HyperFrames** (`npx skills add heygen-com/hyperframes`) → **FFmpeg / Remotion** concat + audio-duck + word-synced caption burn | 🟡 HyperFrames render proven once on M1; full compositor unbuilt |
| L5 QC / slice | Hermes video judge (pacing) → Vigola 9:16 slice | ❌ unbuilt |

**Hard constraints (locked):** (1) **no Agent-Reach / cookie-scraping** behind login
walls — official APIs / licensed / public data only (P7/P8, ToS); (2) **no auto-publish
/ auto-reply** — human approval gate holds; (3) b-roll generation + compositor are the
**AMF team's** build, **not** the VC team's (their only b-roll-adjacent deliverable is
the §3a matte contract).

**Gate (prove before industrialising):** ONE short end-to-end — walk-and-talk → matte →
2–3 b-roll cuts + word-synced captions → 1080×1920 → one human-approved publishable
short. Only then build the swarm.

---

## Brand Kernel (Layer-0) — point-of-view engine *(scaffold shipped 2026-06-29)*

A **new application track on CONTINUUM**, not a new engine phase — and it doubles
as AMF's L3 brain (brand-aware scripting). Retrofits an identity + distribution
layer **above** AMF + CONTINUUM so output feels like *you* and routes to *your*
channels. Full spec: [`docs/BRAND_KERNEL.md`](./BRAND_KERNEL.md).

- ✅ **Kernel scaffold** — `continuum_record_brand_dna` (promise / position /
  framework / persona) + `continuum_check_brand` (Publish Identity Gate: FTS5
  retrieval that cites the conflicting Observation ID). 9-check smoke green;
  nested-brand inheritance proven. The Promise Log = verify-then-dissolve applied
  to brand claims.
- 🔒 **Brand architecture: NESTED** (locked 2026-06-29) — Master brand = personal;
  sub-brands (`voicecosmos`, `zoro`, `consulting`) are a `subBrand` tag inheriting
  Master DNA, not separate tenants.
- 🚧 **Brand DNA v1 + Voice Print** — gated on operator inputs (origin monologue +
  50 posts, P9). The machine is built; the fuel is the human's.
- 🅿️ Channel Router · Voice-drift detection · gate-in-publish-path — after DNA lands.

**Gate:** one raw idea → on-brand LinkedIn post + newsletter + video script in your
voice, routed correctly, all passing the "is this actually me?" gate.

---

## StudioMunich — Talent Registry & Booking layer *(noted 2026-06-29, external build in progress)*

`studiomunich.digital/vault` (Riaan building). The canonical home for **consented digital
talent** — faces + voices (Riaan, Astrid, Paulina, and a VoiceCosmos "Faces by Industry"
catalog). Brands using AMF **book/rent** a talent for their content or site. Sits *under*
the avatar stack: StudioMunich hosts talent; the VC components *render* it; AMF *consumes*
it; CONTINUUM *verifies the booking*.

- **The handshake (now grounded in the real VAULT playbook):** AMF `POST /license` → an
  `identitySovereignToken`, then `POST /render` → **cryptographically signed** face/voice
  **bytes** (VAULT renders; AMF never holds the likeness) → verify `X-Rights-Signature` →
  composite. **Takedown webhook stops serving in seconds.** CONTINUUM holds the brand-side
  render ledger (reconciles with VAULT on `(tenantId, actorId, signature)`). Full AMF-side
  spec: `STUDIOMUNICH-TALENT-HANDSHAKE.md`.
- **Riaan's case:** content creation with the company persona — himself / Astrid by product.
- ✅ **Resolved:** VAULT owns talent registry + consent. VC narrows to the **matte +
  synthetic-avatar engine** (for `digital:` only); rented `studiomunich:<actorId>` talent is
  rendered by VAULT.
- ❌ VAULT itself unverified from here — external, in-progress; integration spec is the
  AMF-side requirement, the playbook is authoritative.

---

## Decision gates (human, not code — these block their phases)

| Gate | Blocks | Status |
|---|---|---|
| Inject a working npm token (2FA) | Phase 0 publish | 🚧 **operator action pending** |
| StudioMunich as canonical talent registry + consent owner (vs VC `avatar_sources`) | VC handover scope · talent-booking handshake | ✅ **decided 2026-06-29: VAULT owns it.** VC narrows to matte + synthetic-avatar engine. See `STUDIOMUNICH-TALENT-HANDSHAKE.md` |
| Set `DEMO_WEBHOOK_URL` in `continuum-docs` Vercel env | Enterprise leads routing to operator | 🚧 **operator action pending** — code shipped (`b03d9cb`); handler degrades gracefully (logs leads) until set. Pick Discord/Slack/Zapier webhook → `vercel env add DEMO_WEBHOOK_URL production` → redeploy. Then live-test via `www.continuum.rest/enterprise`. |
| Lock `D-V2.2` (Postgres-as-directory vs revert) | Phase 2 pgschema | 🚧 open |
| Ship local inference (`ruvllm`, Issue #3) | Phase 4 deeper rungs | 🚧 open |
| AMF go/no-go + `AMF/` repo split | Phase 5 | 🔒 decided: build, separate repo, post-V1 |

---

## Already true (✅ verified live, 2026-06-20)

- **Domain topology** — `continuum.rest`/`www` → **docs** (indexable);
  `console.continuum.rest` → **console** (noindex); `api.continuum.rest` →
  **engine** (Fly, 401 auth). Two Vercel projects: `continuum-docs` (apps/docs)
  + `continuum` (apps/console).
- **Console hardened** — noindex (3 layers) + CSP + nosniff + frame-DENY +
  referrer + permissions-policy + `x-powered-by` stripped.
- **Multi-tenant scaling (V1.2 / Sprint W27)** — `TenantRegistry` LRU + memory
  bounds; 3 mechanical cross-tenant isolation proofs.

## Already decided / installed (don't re-litigate)

- **CodeGraph** ✅ installed + indexing (running as MCP).
- **RuVector** 🔒 V0.5 plan (D2 locked) — Phase 2 is the implementation.
- **Agent-Skills** (Addy Osmani) ✅ installed.
- **claude-mem** ✅ installed (overlaps Supermemory's role).
- **Dolt** ❌ **rejected** — surgical probe 2026-06: Scenario A failed the memory
  budget; Scenario B passed but offered no win over SQLite + RuVector. Selected
  path: SQLite + RuVector (observation 3288). Do not re-propose without new evidence.
- **H-MARA full / RecursiveMAS** 🅿️ parked (Issue #3) — gated on local inference.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
