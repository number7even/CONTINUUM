# 02 · Journey, Roadmap & Sprints — The Red Line to Revenue

> **Audience:** founder + growth/product engineers taking CONTINUUM from
> "works on our machine + Fly + Vercel" to "a stranger installs it in <5 min
> and pays for it."
> **Discipline:** this repo practices *Honesty as Architecture* (P4 — never
> claim more than you can verify). Every line below is tagged:
> **✅ shipped** (verifiable in code today) · **🟡 partial** (seam exists,
> work remains) · **🔮 planned** (roadmap — NOT built).
> Nothing here is presented as done unless a `verifyCommand` can prove it.
>
> Companion to `01_GROUND_TRUTH_AND_GAP.md` (the gap analysis — read it first
> if present; this doc turns that gap into a dated execution plan).

---

## 0. What is verifiably true today (the launch baseline)

Confirmed in code before writing this plan (P4):

| Fact | Where it lives | Tag |
|---|---|---|
| MCP-native memory engine — the whole product is an MCP server | `packages/mcp-server/src/` | ✅ |
| **Verify-then-dissolve** — a checkpoint entry requires `name · where · verifyCommand · verifiedAt`; no DONE without a passing command | `packages/mcp-server/src/tools/record-checkpoint.ts:45–50` (`required: ['name','where','verifyCommand','verifiedAt']`) | ✅ |
| State model = `active[] / dormant[] / broken[]`, sealed with a hash | `record-checkpoint.ts:22–38` | ✅ |
| CLI published on npm as `@number7even/continuum-cli` | `packages/cli/package.json` (`"name": "@number7even/continuum-cli"`) | ✅ |
| CLI verbs: `init · start · serve · status · import-state · verify · upgrade · adapter · reindex · migrate` | `packages/cli/src/index.ts:990–1026` | ✅ |
| MCP surface: 13 tool files on disk (`record-checkpoint`, `get-state`, `get-digest`, `search-docs`, `get/create/update-todo`, `timeline`, `get-observations`, `graph`, `check-brand`, `record-brand-dna`, `kaizen-record`) + 4 resources + 2 prompts | `packages/mcp-server/src/tools/`, `.../resources/`, `.../prompts/` | ✅ |
| SQLite + FTS5 default; RuVector hybrid backend behind `CONTINUUM_STORAGE_BACKEND=hybrid` | `packages/core/src/storage-sqlite.ts`, `storage.ts` factory | ✅ default / 🟡 RuVector stub |
| HTTP/SSE transport live: Fly engine + Vercel console | `packages/mcp-server/src/http.ts`, `apps/console/`, https://continuum-engine.fly.dev · https://continuum-kohl.vercel.app | ✅ |
| The **3D brain**: galaxy graph + codebase Q&A + voice | `apps/console/app/brain/{BrainGraph,page,voice}.tsx`, `/api/ask`, `/api/chat`, `/api/tts` | ✅ |
| Token savings **~2.85x measured** (up to 5.3x single-record) | `README.md` §4, `scripts/benchmark-token-savings.mjs` | ✅ |
| `/api/ask` (brain comprehension) **gated on `ANTHROPIC_API_KEY`** | `apps/console/app/api/ask/route.ts:82–83` | ✅ (gate) |

**Honest gaps carried into the roadmap:** hosted multi-tenant SaaS = V2 (not
built) · RuVector = stub only · no onboarding SDK wrapper · no billing · no
observability dashboard · install today is `@number7even/continuum-cli init`
(a real one-liner, but no guided first-run, no TTFV instrumentation).

**Three customers, one engine** (`CLAUDE.md`): (1) dogfood — the VoiceCosmos
team; (2) OSS solo HITL founders (the V1 wedge this plan targets); (3) hotel
tenants via RBAC (V3). The architecture is identical; only configuration
changes. This plan optimizes ruthlessly for customer #2 as the paid wedge.

---

## 1. The "Red Line" Customer Journey Map

The **Red Line** is the single uninterrupted path from a cold `npx` to a
developer who *trusts the state* — target **Time-To-First-Value (TTFV) < 5
minutes**, zero required reading, zero config files hand-edited.

```
 COLD                                                              WARM
  │                                                                 │
  ▼        ▼            ▼              ▼               ▼             ▼
[t=0]    [t≈60s]      [t≈2m]        [t≈3m]          [t≈4m]        [t<5m]
INSTALL  INIT         FIRST         MCP             BRAIN         "IT KNOWS"
         (guided)     CHECKPOINT    REGISTER        VIEW          (trust)
  │        │            │              │               │             │
npx      DB born      verifyCommand  .mcp.json       galaxy +      next session
@n7/     + snippet    exits 0 →      auto-written    verification   opens warm,
continuum printed     state sealed   → Claude sees   feed live     briefing ready
-cli init             (green)        continuum_*                    (no cold start)
```

### 1.1 Step-by-step (real commands, honest tags)

| # | User action | What happens (grounded) | Tag |
|---|---|---|---|
| 1 | `npx @number7even/continuum-cli init` | Creates SQLite DB + prints MCP registration snippet; auto-imports `STATE.md` if present and no checkpoints exist | ✅ today |
| 2 | (nothing — guided) | 🔮 **`init --guided`** runs a 30-sec wizard: detects project name, offers to write `.mcp.json`, records a *seed checkpoint* so `get_state` is never empty | 🔮 Sprint 1 |
| 3 | First real work | `continuum verify` runs the entry's `verifyCommand`; exit 0 → entry goes green in `active[]`. This IS the differentiator | ✅ engine / 🟡 needs one-command UX |
| 4 | Register MCP | Today: paste snippet into `.mcp.json`. 🔮 `init --guided` writes it for you | ✅ manual / 🔮 auto |
| 5 | Open the brain | `https://continuum-kohl.vercel.app/brain` renders the galaxy + verification feed; `/api/ask` answers "what's the state?" | ✅ (ANTHROPIC key gates ask) |
| 6 | Next session | Claude opens with `continuum_get_state` + `continuum://session/briefing` → **warm start** | ✅ |

### 1.2 The Abstraction Layer — hide SQLite / MCP / SSE behind one line

The complexity that scares off a trial user is: a SQLite file, an MCP JSON
registration, an SSE transport, a Bearer token, a storage-backend env var.
The Red Line hides **all** of it behind the CLI and one npm package.

- **✅ Seam already exists:** `openStorage(projectId)` factory
  (`packages/core/src/storage.ts`) means the user never chooses SQLite vs
  RuVector — the abstraction is real, not aspirational. The V0.5 swap is a
  one-line change at the factory. *Respect this seam — never leak backend
  choice into the onboarding path.*
- **🔮 `continuum init --guided` (Sprint 1):** wraps DB creation + `.mcp.json`
  write + seed checkpoint + a printed "you're live" line. The user types one
  command and answers ≤2 prompts.
- **🔮 `@number7even/continuum` meta-package (Sprint 2):** a thin install alias
  so the marketed one-liner matches the docs. Today the real bin is
  `@number7even/continuum-cli`; the meta-package re-exports it so
  `npx @number7even/continuum init` Just Works. (Smallest change that closes
  the docs/reality gap — no engine change.)
- **🔮 Zero-token local mode (Sprint 1):** brain/`get_state`/`verify` must work
  with **no `ANTHROPIC_API_KEY`** — only `/api/ask` (LLM comprehension) needs
  it. Make that boundary explicit in the UI so a keyless trial still delivers
  value (state + verification feed), and only the "ask my brain a question"
  feature prompts for a key. This protects TTFV from an API-key wall.

### 1.3 The Observability Layer — clear-at-a-glance trust

A memory engine is only useful if the user *believes* the state. The trust
signal is the **verification feed**: every entry shows whether its
`verifyCommand` currently exits 0.

**Grounded 6-state telemetry.** The repo already models truth in two honest
primitives we compose into a live status lamp:
- checkpoint categories `active[] / dormant[] / broken[]`
  (`record-checkpoint.ts`), and
- the AMF pipeline's human gate `REVIEW` (`docs/AMF_ENGINE_MAP.md:41`,
  `review.mjs` approve/reject) + reward telemetry
  `HITL_REWARD { approve 1.0 · modify 0.7 · reject 0.2 }`.

We surface a per-entry lamp with **six states** (🔮 the dashboard component;
the underlying signals are ✅ real):

| State | Meaning | Grounded source |
|---|---|---|
| `RUNNING` | `verifyCommand` executing now | CLI `verify` in flight |
| `REVIEW` | awaiting human approve/reject | AMF `review.mjs` gate (P9) ✅ |
| `DONE` | `verifyCommand` exited 0 → in `active[]` | `record-checkpoint.ts` ✅ |
| `SKIPPED` | intentionally not the active path | `dormant[]` ✅ |
| `BLOCKED` | gated on a missing key/secret (e.g. no partner key, no `ANTHROPIC_API_KEY`) | `/api/ask:82` gate ✅ |
| `FAILED` | `verifyCommand` exited non-zero → `broken[]` | `record-checkpoint.ts` ✅ |

This is the "always-trust-the-state" surface: a green wall means every claim
is currently re-provable; a red lamp points at the exact entry and its
`verifyCommand`. No aggregate score is trusted without the underlying
exit-code — that is the P4 promise made visible.

**🔮 Deliverable:** a `/dashboard/verify` console frame (extends the existing
`apps/console/app/dashboard/`) that polls `continuum verify --json` per entry
and renders the six lamps + a live feed. Smallest change: reuse the existing
`get-state` tool output; add a `--json` flag to `continuum verify`.

---

## 2. High-Velocity Commercial Roadmap (Phases 1–3)

Each phase names an objective, features tied to the §0 gaps, and a **single
success metric**. All Phase content is 🔮 unless tagged otherwise.

### Phase 1 — THE HOOK (Days 0–30): cut TTFV, remove every barrier to trial

- **Objective:** a stranger goes cold→warm in <5 min with zero hand-editing.
- **Features → gaps:**
  - `init --guided` wizard + auto `.mcp.json` write → closes *"no guided
    first-run"* gap.
  - `@number7even/continuum` meta-package → closes *"marketed one-liner ≠ real
    bin name"* gap.
  - Keyless local mode (state + verify without `ANTHROPIC_API_KEY`) → closes
    *"API-key wall blocks trial"* gap.
  - TTFV instrumentation (anonymous, opt-in) → we can't cut what we can't
    measure.
- **Success metric:** **median TTFV < 5 min** on a clean machine, measured on
  ≥20 real installs; `npx …init` → first green `verifyCommand` with ≤2 prompts.

### Phase 2 — THE MOAT (Days 31–60): real-time trust + retention

- **Objective:** the user returns because the state is *live and trustworthy*.
- **Features → gaps:**
  - `/dashboard/verify` observability frame + 6-state lamps → closes *"no
    observability dashboard"* gap.
  - `continuum verify --json` + `--watch` → real-time verification feed.
  - SessionEnd / git `post-commit` auto-checkpoint hardening (README §5 says
    the hook exists — make it turnkey) → retention via warm restarts.
  - Adapter breadth (`adapter` CLI already exists): docs + git + export live;
    add one high-value adapter (e.g. GitHub Issues) → stickiness.
- **Success metric:** **≥40% Day-7 return rate** (user runs `verify`/opens
  brain in a second session); ≥1 auto-checkpoint per active user per day.

### Phase 3 — THE SCALE (Days 61–90+): enterprise RBAC, integration rings, recurring revenue

- **Objective:** convert trust into multi-tenant, paid, recurring usage.
- **Features → gaps:**
  - Hosted multi-tenant on the `tenant-registry.ts` seam (already in
    `mcp-server/src/`) → closes *"hosted SaaS = V2"* gap, incrementally.
  - RBAC for hotel-tenant customer #3 (Bearer auth exists in `http.ts`; layer
    roles on top) → third customer unlocked.
  - Billing (Stripe) gated per project/tenant → closes *"no billing"* gap.
  - Integration rings: the parked Issues #1–#3 (DSPy.ts / Ruflo / RecursiveMAS)
    stay parked per partner-clause #3 until V0.5+ local inference — **do not
    pull them forward.** Ring = paid connectors, not architecture rewrites.
  - RuVector real backend (replaces stub at `openStorage()`).
- **Success metric:** **first $ MRR** from ≥3 paying tenants; p95 MCP response
  <100ms under multi-tenant load (matches the repo's stated perf target).

---

## 3. Execution Pipeline — consecutive 14-day sprints (0–90 days)

Sprints are consecutive and cover Phases 1–3. Every sprint ships something a
`verifyCommand` can prove. Acceptance criteria are **automated and
measurable**: single-command init, zero-warning `tsc`, smoke-test green,
`verifyCommand` exits 0.

---

### Sprint 1 (Days 1–14) — "The 5-Minute Cold Start" · Phase 1

- **User stories**
  - *As a solo founder evaluating CONTINUUM, I run one command and I'm live in
    under 5 minutes without editing any JSON* → trial-conversion vector.
  - *As a keyless trial user, I see my state and verification feed without
    pasting an API key* → removes the #1 drop-off wall.
- **Technical deliverables**
  - `continuum init --guided` in `packages/cli/src/index.ts` (extend the
    existing `case 'init'` at line 990): detect project name, prompt to write
    `.mcp.json`, record a **seed checkpoint** so `get_state` is never empty.
  - `continuum verify --json` flag (extend `case 'verify'`, line 1014 →
    `commandVerify`) emitting `{name, verifyCommand, exitCode, state}` per
    entry — the data contract for the observability feed.
  - Keyless-mode guard: brain/state paths must not require
    `ANTHROPIC_API_KEY`; only `/api/ask` + `/api/chat` prompt for it
    (`apps/console/app/api/ask/route.ts` already 500s cleanly — mirror that as
    a friendly UI state, not a crash).
  - Opt-in anonymous TTFV timer written into the init flow.
- **Automated acceptance criteria**
  - `npx @number7even/continuum-cli init --guided` completes with **≤2
    prompts**, exit 0, DB + `.mcp.json` + seed checkpoint on disk.
  - `continuum verify --json` outputs valid JSON, every seeded entry
    `exitCode === 0` (green).
  - `tsc --noEmit` across `packages/cli` + `packages/core` → **zero warnings**.
  - Existing smoke tests green: `node scripts/http-smoke.mjs`,
    `node scripts/privacy-smoke.mjs`.
  - `continuum status` shows the seed checkpoint immediately post-init.

---

### Sprint 2 (Days 15–28) — "One Name to Install" · Phase 1

- **User stories**
  - *As a user following the marketing, `npx @number7even/continuum init`
    matches the docs exactly* → trust from the very first command.
  - *As a returning user, my next session opens warm with a fresh briefing.*
- **Technical deliverables**
  - Publish `@number7even/continuum` meta-package that re-exports the
    `continuum` bin from `@number7even/continuum-cli` (no engine change; pure
    packaging — respects the CLI seam).
  - Harden `continuum://session/briefing` freshness (Issue #14 backlog): add a
    freshness header so a stale briefing is visibly stale.
  - `README` quick-start updated to the guided one-liner (docs adapter will
    re-ingest via `continuum adapter`).
- **Automated acceptance criteria**
  - `npx @number7even/continuum init` resolves and runs the same code path as
    `@number7even/continuum-cli init`, exit 0.
  - `continuum` bin discoverable from the meta-package in a clean
    `npm install -g` sandbox (CI job).
  - Briefing resource returns a `generatedAt` field; smoke test asserts it.
  - Zero-warning `tsc`; docs adapter idempotent on re-run (existing invariant).

---

### Sprint 3 (Days 29–42) — "The Verification Feed" · Phase 2

- **User stories**
  - *As a user, I open one screen and instantly see which claims are currently
    re-provable (green) and which broke (red)* → the trust moat.
- **Technical deliverables**
  - `/dashboard/verify` console frame in `apps/console/app/dashboard/`
    rendering the **6-state lamps** (RUNNING/REVIEW/DONE/SKIPPED/BLOCKED/FAILED)
    from `continuum verify --json` + `continuum_get_state`.
  - `continuum verify --watch` (re-run on file change) feeding a live SSE
    stream through the existing `packages/mcp-server/src/http.ts` transport.
  - Map `broken[] → FAILED`, `dormant[] → SKIPPED`, gated entries → `BLOCKED`
    (reuse the `/api/ask` gate pattern).
- **Automated acceptance criteria**
  - A deliberately-broken `verifyCommand` renders a **red FAILED lamp** in the
    frame (Playwright/console smoke assertion).
  - `continuum verify --watch` re-emits within 2s of a file change.
  - SSE roundtrip green (extend `scripts/http-smoke.mjs`).
  - Zero-warning `tsc` across `apps/console`.

---

### Sprint 4 (Days 43–56) — "Warm by Default" (retention) · Phase 2

- **User stories**
  - *As a daily user, checkpoints happen automatically at session end / commit,
    so tomorrow I always start warm* → Day-7 retention vector.
- **Technical deliverables**
  - Turnkey SessionEnd hook + git `post-commit` → `record_checkpoint`
    (README §5 references these; ship an installer: `continuum init --hooks`).
  - One new high-value adapter via the existing `continuum adapter` command
    (candidate: GitHub Issues → observations), reusing
    `packages/adapters/*` patterns.
  - Retention instrumentation: count second-session `verify`/brain opens.
- **Automated acceptance criteria**
  - `continuum init --hooks` installs both hooks; a test commit produces a new
    `product_state[]` row (assert row count +1).
  - New adapter idempotent on re-run; cross-source FTS5 search returns hits
    across the new source + existing git/docs (existing test pattern).
  - Zero-warning `tsc`; all smoke tests green.

---

### Sprint 5 (Days 57–70) — "Tenants & Roles" (RBAC foundation) · Phase 3

- **User stories**
  - *As a hotel-tenant admin (customer #3), my team's memory is isolated and
    role-scoped* → unlocks the third customer + enterprise revenue.
- **Technical deliverables**
  - Extend `packages/mcp-server/src/tenant-registry.ts` with role claims
    (owner/editor/viewer) layered on the existing Bearer auth in `http.ts`.
  - Per-tenant project routing already exists in `http.ts` — add RBAC middleware
    (deny-by-default; P2 "prove don't grant").
  - `continuum serve` gains `--rbac` mode reading a tenant/role table.
- **Automated acceptance criteria**
  - A `viewer` token is rejected on a write tool (`record_checkpoint`) with 403;
    `owner` succeeds — asserted in `tenant-registry.test.ts` /
    `auth.test.ts` (extend existing suites).
  - Cross-tenant read isolation proven: tenant A cannot read tenant B's
    observations (test).
  - Zero-warning `tsc`; auth smoke green.

---

### Sprint 6 (Days 71–84) — "Recurring Revenue" (billing + integration ring) · Phase 3

- **User stories**
  - *As a paying customer, I subscribe per project/tenant and my usage is
    metered* → first MRR.
- **Technical deliverables**
  - Stripe billing gated at the tenant boundary (new `apps/console/app/api/
    billing/` route; do NOT couple to the storage engine — sits above the
    `tenant-registry` seam).
  - Usage metering off existing telemetry (checkpoints written, tools called).
  - First **integration ring** connector (paid tier) — a connector, NOT one of
    the parked Issues #1–#3 (those stay parked per partner-clause #3 until
    V0.5+ local inference).
- **Automated acceptance criteria**
  - A test Stripe webhook flips a tenant to `active` and un-gates write tools;
    lapse re-gates them (`BLOCKED` lamp). Asserted via mock webhook.
  - Metering counter increments on `record_checkpoint` (test).
  - Zero-warning `tsc`; end-to-end billing smoke green; all prior smokes still
    green (no regression).

---

### Sprint 7+ (Days 85–90+) — "Scale hardening" · Phase 3 (preview)

- RuVector real backend swap at `openStorage()` (replaces the stub); p95 MCP
  response <100ms under multi-tenant load; observability SLOs on the verify
  feed. Success metric: perf target met + ≥3 paying tenants sustained.

---

## 4. Guardrails (so velocity never outruns honesty)

- **Never present roadmap as shipped.** ✅/🟡/🔮 tags are load-bearing.
- **Respect the seams.** Storage swaps happen only at `openStorage()`; tenancy
  only at `tenant-registry.ts`; transport only at `http.ts`. Smallest change
  that unlocks each milestone.
- **No DONE without a passing `verifyCommand`.** Every sprint's acceptance
  criteria are re-runnable; a green wall is the product's core promise.
- **Parked integrations stay parked** (Issues #1–#3) until V0.5+ local
  inference — partner-clause #3.
- **Surface ambiguity; never invent** (P9): where this plan assumes a gap
  (e.g. billing, guided init), it is tagged 🔮 and grounded on a real seam,
  not asserted as existing.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
