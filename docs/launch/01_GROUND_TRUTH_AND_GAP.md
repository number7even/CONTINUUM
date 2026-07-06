# 01 · Ground Truth & Gap Analysis

> **Audience:** launch decision-makers (founder + prospective enterprise/retail buyers).
> **Method:** every claim below was re-verified against source on 2026-07-06. Where the
> marketing docs (README/CLAUDE.md) were stale, the code wins (P4 — "Honesty as
> Architecture"). Citations are `path:line`. Capabilities tagged ✅ shipped · 🟡 partial ·
> 🔮 roadmap. **Nothing on the roadmap is presented as shipped.**

---

## 0. TL;DR — what CONTINUUM actually is, today

CONTINUUM is an **MCP-native memory/context engine** for AI-assisted builders — an
"Agent/Memory-as-a-Service" layer that sits between a human and any MCP-aware AI client
(Claude Code, Cursor, Cline, Desktop). It aggregates **five sources of project truth**
(docs · AI-memory observations · git history · session transcripts · extracted concepts)
into timestamped, hash-sealed `product_state[]` checkpoints, a live todo pipeline, and a
token-efficient retrieval surface. It is **live in production** (Fly engine + Vercel
console) and **dogfooded** by the VoiceCosmos team.

Its one non-obvious, defensible mechanic is **VERIFY-THEN-DISSOLVE**: a state entry or todo
is not trusted as "done" on assertion — it carries a shell `verifyCommand` that must exit
`0`, re-runnable on demand via `continuum verify`. **0 of 7 surveyed memory rivals verify
at write time.** That is the open lane.

---

## 1. System Ground Truth

### 1.1 Package / dependency map (npm workspaces — D3 locked, `ARCHITECTURE.md:1007`)

| Package | Role | Depends on | Ship state |
|---|---|---|---|
| `packages/core` | Types, SQLite+FTS5 storage, storage-adapter seam, checkpoint engine, todo CRUD, privacy filter, embedder, graph/concepts, kaizen grader | `better-sqlite3`, `@xenova/transformers`, RuVector (hybrid) | ✅ compiles clean; grown well past its documented scope |
| `packages/mcp-server` | MCP surface (tools/resources/prompts) + stdio + HTTP/SSE transport | `core`, `@modelcontextprotocol/sdk`, `express` | ✅ live |
| `packages/cli` | `continuum` bin — 10 verbs | `core`, `mcp-server` | ✅ published to npm |
| `packages/adapters/{docs,git,export,remote-git}` | Source ingesters → Observations | `core` | ✅ 4 adapters (not 3) |
| `apps/console` | Next 15 / React 19 / three.js — the 3D "brain", chat, dashboard | `mcp-server` SDK client | ✅ deployed (Vercel) |

**Deploy topology (repo root, not in `apps/console/`):** `Dockerfile` (`CMD → packages/mcp-server/dist/http.js`, `Dockerfile:12`) + `fly.toml` (`app = "continuum-engine"`, `fly.toml:12`; `internal_port = 7878`, `:38`; volume `continuum_data → /data`, `:33`). Console is pure Vercel zero-config (`apps/console/.vercel/project.json`). Public URLs: `https://continuum-engine.fly.dev` + `https://continuum-kohl.vercel.app`. V1 AaaS-LIVE checkpoint `d0fa50a7`.

### 1.2 Data model (`packages/core/src/types.ts`) — ✅ shipped

| Type | Line | Key fields |
|---|---|---|
| `Observation` | `types.ts:31` | `id` (UUID), `type`, `content`, `sourceId`, `refs: string[]` (`:42`), `metadata?` (`:44`) — the canonical unit every adapter emits |
| `StateSnapshot` (the checkpoint / `product_state`) | `types.ts:53` | `active/dormant/broken: StateEntry[]`, `reason`, `hash` (canonical-JSON SHA-256) |
| `StateEntry` | `types.ts:69` | `name`, `where`, **`verifyCommand`** (`:75`) — the witness string |
| `Todo` | `types.ts:89` | `refs[]` (`:93`), `verifyCommand` (`:98`), `blockedBy[]` (`:100`) |
| `Digest`, `SearchHit`, `TimelineHit` | `:107 / :162 / :180` | retrieval + summary DTOs |
| `AgentHandoffMetadata` + `createAgentHandoffObservation()` | `types.ts:143` / `observation.ts:342` | V0-compatible RecursiveMAS intent capture |

> ⚠️ Cosmetic: doc comment says "UUID v7" (`types.ts:32`) but code emits v4 `randomUUID()`.

### 1.3 Storage-adapter seam — ✅ shipped (RuVector impl = 🟡 stub)

- Interface: `StorageBackend` — `storage.ts:86`. Factory: `openStorage(tenantId)` — `factory.ts:51`.
- **STALE-DOC CORRECTION (P4):** the factory default is **`hybrid`, not `sqlite`** — `factory.ts:56` `process.env.CONTINUUM_STORAGE_BACKEND ?? 'hybrid'` (flipped 2026-06-01). CLAUDE.md still claims "sqlite remains the default." SQLite is now **opt-out**.
- Backends: `SQLiteStorageBackend` (`storage-sqlite.ts:54`, FTS5 at `db.ts:89-93`) · `HybridStorageBackend` (`storage-hybrid.ts` — SQLite + RuVector HNSW + MiniLM-L6-v2 384-dim dual-write). The RuVector path is wired and smoke-tested but **not benchmarked to a maturity gate** — treat as 🟡 stub per D2 (`ARCHITECTURE.md:1006`).

### 1.4 MCP surface — ✅ shipped (bigger than documented)

**Tools: the docs say "9" — the tools dir holds 14 tool modules** (`packages/mcp-server/src/tools/`, excluding `index.ts` registry): `get-state`, `get-digest`, `search-docs`, `record-checkpoint`, `get-todos`, `create-todo`, `update-todo`, `timeline`, `get-observations` (the original 9) **plus** `graph`, `delete-observation`, `check-brand`, `record-brand-dna`, `kaizen-record` (5 undocumented additions). **Cite the real count from disk, not the "9" in CLAUDE.md.**

- **Resources: 4** ✅ — `resources/`: `open-todos`, `state-current`, `digest-latest`, `session-briefing`.
- **Prompts: 2** ✅ — `prompts/`: `session-start`, `cite`.

**Progressive Disclosure (Layers 0–3)** ✅ — Layer 0 = `continuum://session/briefing` (one cheap read) · Layer 1 = `search-docs` (compact ID index) · Layer 2 = `timeline` (chronological context) · Layer 3 = `get-observations` (full text on demand). This is the token-economics mechanic (see §2).

### 1.5 Transports — ✅ shipped

- **stdio** (default, local): `continuum start` → `mcp-server/dist/index.js` (thin entry).
- **HTTP/SSE** (hosted): `http.ts` — Express + `SSEServerTransport`. Auth is a **required** shared-secret `Authorization: Bearer <CONTINUUM_HTTP_TOKEN>` — *"REQUIRED — server refuses to start"* (`http.ts:29-30`); JWT mode also supported (W27-3 middleware, issuer/audience, `http.ts:323-324`). Tenant routing via **`X-Continuum-Project`** header (`http.ts:15,98`).

### 1.6 CLI — ✅ shipped (10 verbs, not 5)

Single bin `continuum` (`packages/cli/package.json:8-10`). Dispatch at `cli/src/index.ts:989-1026`: documented `init` `start` `serve` `status` `import-state` **plus** `verify` (`:1014`), `upgrade` (`:998`), `adapter` (`:1018`), `reindex` (`:1022`), `migrate` (`:1026`). `serve` hard-guards on `CONTINUUM_HTTP_TOKEN` (`:964-968`). `init` prints the MCP registration snippet (`:428-442`) and auto-imports `STATE.md` if present and no checkpoints exist (`:373-387`).

### 1.7 Adapters — ✅ shipped (4, stable-ID scheme per source)

| Adapter | Emits | Stable ID | Cite |
|---|---|---|---|
| `git` | 1 Observation/commit, `type=commit` | raw 40-char SHA | `git/src/index.ts:6-7` |
| `docs` | idempotent `.md`/`.mdx` | `sha256(relpath)` UUID-shape | `docs/src/index.ts:76-77` |
| `export` | Claude JSONL → per-turn | `sha256(file+content[:256])[:16]` | `export/src/index.ts:101-107` |
| `remote-git` | remote repo digest via `gitingest` | `sha256("remote-git:<url>")` | `remote-git/src/index.ts:82-86` |

> **No codegraph bridge adapter exists.** The console's "code·symbols" brain lobe is fed by the engine's `graph` MCP tool, not a repo adapter — a labeling nuance to correct in marketing.

### 1.8 Console / the "brain" — ✅ shipped (far exceeds its CLAUDE.md description)

Next 15 / React 19 / three.js (`apps/console/package.json:15-19`). CLAUDE.md describes "a server-rendered registry page"; reality is a multi-page app: `app/brain/` (3D galaxy), `app/chat/`, `app/dashboard/`, + 6 API routes.

- **3D brain** (`app/brain/BrainGraph.tsx`) renders a **5-source** model, one lobe per source (`:26-42`): code·symbols, docs, commits·git, concepts, memory. Data from the `graph` MCP tool (`brain/lib.ts:85`).
- **`/api/ask`** ✅ exists — single-shot structured agent `{answer, nodeIds, citations}`. **Gated on `ANTHROPIC_API_KEY`** (`app/api/ask/route.ts:82-83`) *and* `CONTINUUM_HTTP_TOKEN` (`:80`). The **dossier** panel (`BrainGraph.tsx:302-317`, backed by `app/api/observation/route.ts`) is deliberately **LLM-free** — pure MCP, works with zero model key.
- Radial node menu (`:321-323`), Chladni/cymatics + geometric view modes (`:129-160`), engine connection via MCP SDK `SSEClientTransport` against `CONTINUUM_HTTP_URL` + `CONTINUUM_HTTP_TOKEN` (`app/dashboard/lib.ts:82`, `/api/chat/route.ts:92`).

### 1.9 What runs today vs stubbed

| Runs today ✅ | Stubbed / gated 🟡 | Roadmap 🔮 |
|---|---|---|
| SQLite+FTS5 storage, checkpoint engine, todo CRUD | Hybrid/RuVector backend (wired, unbenchmarked) | ruv-FANN / ruvllm digest generation (V0.5) |
| 14 MCP tools · 4 resources · 2 prompts | `/api/ask` (needs `ANTHROPIC_API_KEY`) | Hosted multi-tenant SaaS (V2) |
| stdio + HTTP/SSE (+ JWT) transports | template-fallback digests only | RBAC/tenancy beyond single-token + header |
| CLI (10 verbs incl. `continuum verify`) | 4-adapter ingest (manual invocation) | web-ui as V1.5 (console is the early cut) |
| 3D console/brain, dogfood live on Fly+Vercel | privacy entropy detector (env-gated off) | claude-mem / sona adapters (V0.5) |

---

## 2. The Value Engine (Monetization Anchor)

**Strip the noise.** The 3D brain is a demo; the 5 adapters are plumbing; the MCP tool count is table stakes. The one capability an enterprise or retail buyer will *pay* for is **trust in AI-produced state** — CONTINUUM refuses to record a project fact as "done" on the model's word alone. Every `StateEntry`/`Todo` carries a shell `verifyCommand` (`types.ts:75`) that is stored as an auditable witness and **re-executed to an exit-0 gate on demand** by `continuum verify` (`cli/src/index.ts:831-930`, execSync + 30s timeout, designed to chain `continuum verify && fly deploy …`) and by the checkpoint reproducer scripts (`scripts/checkpoints/*.mjs`, `execSync(...)` that *must* exit 0 at stamp time). Layered on top of the **5-source aggregation moat** (README:27 — nobody else combines docs+mem+sona+git+export) and **measured progressive-disclosure token economics** (~**2.85x** retrieval savings, up to 5.3x single-record, benchmarked on this repo's git history — `README.md:98`, reproducible via `scripts/benchmark-token-savings.mjs`), the paid product is: *"a memory layer whose claims are provable, whose recall is cheap, and whose sources no single competitor spans."*

**Why it's defensible**
- **Proof-gated memory is an open lane** — 0 of 7 surveyed rivals (claude-mem, Mem.ai, Notion, Cursor rules, etc.) verify at *write* time. This is a category position, not a feature.
- **5-source aggregation** — competitors each own one slice (claude-mem = observations, Mem.ai = notes, Notion = docs, Cursor = conventions). The union is the moat (README:27).
- **Token economics is measured, not asserted** — 2.85x is reproducible; the old "10x" claim is **dead** and must never reappear in collateral (P4).
- **MCP-native = zero-friction distribution** — rides the client the buyer already uses; no new UI to adopt.
- **Honest architecture as a trust signal** — the same discipline it sells (verify, don't claim) is how the repo governs itself; that congruence is the enterprise pitch.

> **Biggest competitive weakness to own:** there is **no published recall/accuracy benchmark** yet. Lead the narrative on the *trust/verification* axis (where we're uniquely strong), not raw recall (where we're unproven).

---

## 3. Reverse Friction Audit — top 5 frictions TODAY

| # | Friction | Where it lives | Impact |
|---|---|---|---|
| 1 | **Package naming split.** Marketed as one `continuum` command, but the published bin is `@number7even/continuum-cli` and the libs are `-core` / `-mcp-server` (`README.md:167-169`). No `@number7even/continuum` meta-package resolves. | npm namespace; README:149-169 | ↑ TTFV — a copy-pasted `npm i -g @number7even/continuum` **fails**; first impression is a 404. Direct conversion killer at the very first step. |
| 2 | **Manual MCP registration + absolute-path editing.** Setup = copy `.mcp.json.example`, edit `CONTINUUM_PROJECT_ID`, hand-confirm the absolute path to `dist/index.js`, restart the client (`README.md:42-52,180-197`). | onboarding, no wizard | ↑↑ TTFV; classic drop-off — every manual JSON edit before first value compounds abandonment. No `continuum register` verb. |
| 3 | **Two secrets, two products, hosted mode.** `serve`/console require `CONTINUUM_HTTP_TOKEN` (`cli:964-968`, `http.ts:29-30`) **and** `/api/ask` additionally needs `ANTHROPIC_API_KEY` (`route.ts:82`). No guided key setup; failure surfaces as a 500/401. | `http.ts`, `api/ask/route.ts` | ↑ conversion friction for the hosted/console path; the flagship "ask the brain" feature silently 500s without a model key. |
| 4 | **State visibility is CLI/opaque by default.** Value (checkpoints, verify status) lives behind MCP tool calls or the separately-deployed console. A new user can't *see* the memory working without wiring the SSE console (`CONTINUUM_HTTP_URL`+token, `dashboard/lib.ts`). | console↔engine coupling | ↑ churn — "does it even work?" gap in the first session; the aha-moment (verify-green state) is not surfaced in-client. |
| 5 | **Adapters are manual, ingestion isn't automatic yet.** README §3 markets "silent hook-driven ingestion," but the 4 adapters are invoked explicitly (`continuum adapter …`); the SessionEnd/post-commit auto-capture loop is not the default wired path. | `adapters/*`, CLI `adapter` verb | ↑ churn — the promised "never take a note" magic requires manual runs; expectation vs. reality gap erodes trust. |

---

## 4. Deep Gap Analysis (to launch)

| Capability | State | What's needed to reach launch | Blocking dependency |
|---|---|---|---|
| **Verify-then-dissolve engine** | ✅ shipped | Surface verify status in-client (not just CLI); market it as the headline | none (differentiator is live) |
| **Package install path** | 🟡 partial | Publish a `@number7even/continuum` meta or fix all collateral to `-cli`; one-line install that works | npm publish + doc sweep |
| **Onboarding / registration** | 🟡 partial | `continuum register` verb (auto-write `.mcp.json`, resolve path, health-check) | CLI work only |
| **Hosted multi-tenant SaaS** | 🔮 roadmap (V2) | Real tenant isolation store, signup, per-tenant DBs/volumes | RuVector native multi-tenant OR Postgres directory (open flag, `ARCHITECTURE.md §14`) |
| **RBAC / tenancy** | 🟡 partial | Today = single shared `CONTINUUM_HTTP_TOKEN` + `X-Continuum-Project` header + JWT scaffold (`http.ts`). Need roles, per-tenant keys, revocation | hosted SaaS (V2) |
| **RuVector storage backend** | 🟡 stub | Benchmark vs SQLite baseline; pass D2 maturity gate (RuVector v1.0+, SDK ergonomics, build size) | RuVector maturity (`ARCHITECTURE.md:1006`) |
| **Digest generation** | 🟡 partial | Template fallback ships today; local ruv-FANN/ruvllm is V0.5. `/api/ask` needs a key | ruv-FANN/ruvllm (D4, `:1008`) or `ANTHROPIC_API_KEY` |
| **Onboarding SDK / DX** | 🔮 roadmap | Client SDK, examples, quickstart that works copy-paste | package-naming fix first |
| **Observability** | 🔮 roadmap | Metrics/health beyond `/healthz`; per-tenant usage; audit log of verify runs | hosted SaaS |
| **Billing / metering** | 🔮 roadmap | Usage metering, plans, checkout — none exists | hosted SaaS (V2) |
| **Docs (buyer-facing)** | 🟡 partial | Reconcile stale counts (4→14 tools, 5→10 verbs, sqlite→hybrid default, kill "10x"); a real quickstart | doc sweep for P4 accuracy |
| **Recall benchmark** | 🔮 roadmap | Publish accuracy/recall numbers to defend the memory claim | benchmark harness (only token-savings exists today) |

---

## Executive summary (the single biggest gap)

CONTINUUM's **core value engine is real and live**: verify-then-dissolve (proof-gated state
via `continuum verify` + reproducer scripts), the 5-source moat, measured ~2.85x token
savings, 14 MCP tools, dual transports, and a deployed 3D console — all dogfooded in
production. The code is **ahead** of its own docs (which understate the tool/CLI surface and
still cite a dead "10x" and a wrong default backend). **The single biggest gap to launch is
not engineering — it is the productized on-ramp:** the marketed one-line install
(`@number7even/continuum`) does not resolve (the bin is `-cli`), setup demands manual
`.mcp.json` path-editing, and the hosted "ask the brain" flow silently 500s without two
separate secrets. **Time-to-first-value is the conversion killer, and hosted multi-tenant
SaaS + billing + RBAC (all V2 🔮) are the true monetization blockers.** Fix the install path
and add a `continuum register` wizard first (days of CLI work); then decide the V2 tenancy
substrate (RuVector-native vs Postgres directory — an open architectural flag). Lead the
market narrative on **trust/verification** (0 of 7 rivals verify at write time), not raw
recall — which we have not yet benchmarked.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
