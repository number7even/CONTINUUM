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
  independent** → pulled forward to run alongside Phase 1. Directly fortifies the
  ~10× token-efficiency claim. 🅿️
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

**7-layer build order (ingestion → sales):**
- **L2 Ingestion** — `last30days-skill` + OKF crawler scrape real engagement
  (Reddit/TikTok/Polymarket), score trends with the "Fun Judge".
- **L3–L4 Synthesis** — "Addictive Storytelling" loop (Vercel AI SDK); Asset
  Agent over WebSocket → bare-metal **ComfyUI** GPU cluster, synced to
  **ElevenLabs** ms timestamps.
- **L5–L7 Distribution & Sales** — **FFmpeg/Remotion** programmatic assembly;
  15-agent hierarchical mesh for media buying (`claude-ads`); **AiToEarn** intent
  mining for real-time lead capture.

**Gate (AMF, internal):** every spend action carries a `verifyCommand`-equivalent
witness before budget is committed — verify-then-spend.

---

## Decision gates (human, not code — these block their phases)

| Gate | Blocks | Status |
|---|---|---|
| Inject a working npm token (2FA) | Phase 0 publish | 🚧 **operator action pending** |
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
