# Customer 1 — VoiceCosmos (Dogfood + ARIA)

> **Bound by [The Nine](../../AGENTS.md) v0.1.0.**
>
> This is the first per-customer integration document. The folder
> `docs/INTEGRATIONS/` is where each customer's plug-in story lives;
> the canonical `HOW_CONTINUUM_WORKS.md` stays customer-agnostic per P3
> (Architect for change). When the second hotel property onboards under
> ARIA, it will get its own sibling file (e.g. `ARIA-PROPERTY-002.md`)
> without disturbing this one.
>
> Per P4: every claim in this doc carries an explicit tier label —
> ✅ shipped · 🟡 partial · 🟠 planned · 🔮 aspirational — so future
> readers can tell what's true today from what's the target state.

---

## Two integration phases, one engine

CONTINUUM was deliberately built as a standalone repository
(`github.com/number7even/CONTINUUM`) **not** embedded inside the
VoiceCosmos codebase. It plugs into VoiceCosmos as an **external
intelligence service** over MCP. Two distinct phases:

| Phase | Audience | Tier today | Tier target |
|---|---|---|---|
| **Phase 1 — Dev Workflow** | The VC engineering team (dogfooding) | ✅ shipped, actively used | n/a (this is the production state) |
| **Phase 2 — Production ARIA** | Hotel tenants via ARIA Voice OS | 🔮 aspirational | V2/V3 multi-tenant SaaS |

---

## Phase 1 — The Dev Workflow Integration ✅

**Status:** in active use. The `vc-hospitality` project's CONTINUUM DB
already holds 3 checkpoints + the verify-then-dissolve proof on row
`81223c05` from 2026-05-15 (hospitality-aria deploy SHA-grep against
bundle `buildId` for commit `2aa4f96a5`).

### 1.1 · MCP registration ✅

Register the CONTINUUM MCP server inside the `VC-Hospitality` project's
configuration. Two equivalent paths:

**Per-project (recommended):** add to `VC-Hospitality/.mcp.json`:

```json
{
  "mcpServers": {
    "continuum": {
      "command": "node",
      "args": [
        "/Users/<you>/Development/supabase-projects/CONTINUUM/packages/cli/dist/index.js",
        "start"
      ],
      "env": {
        "CONTINUUM_PROJECT_ID": "vc-hospitality"
      }
    }
  }
}
```

**Or via the published bin once the npm package ships** (currently the
repo is consumed by direct path; npm publication is a V1.2 task):

```json
{
  "mcpServers": {
    "continuum": {
      "command": "npx",
      "args": ["-y", "@continuum/cli", "start"],
      "env": { "CONTINUUM_PROJECT_ID": "vc-hospitality" }
    }
  }
}
```

**Global (per-user, all projects):** add to `~/.claude.json` under the
same `mcpServers` key. This makes CONTINUUM available in every Claude
Code session, with the project resolved via `$CONTINUUM_PROJECT_ID` or
the project-detection logic in `continuum init`.

### 1.2 · State seeding from `STATE.md` ✅

CONTINUUM ingests the VC team's hand-maintained activation state:

- **`STATE.md`** at the `VC-Hospitality` repo root → canonical state
  document. Parsed by `packages/core/src/state-md.ts` (shipped
  2026-05-24, smoke-tested against the real `VC-Hospitality/STATE.md`:
  11 active + 3 dormant + 0 broken, 4 legitimate warnings).
- **Auto-import on first init:** `continuum init` checks for a sibling
  `STATE.md` and imports it as the first checkpoint **if and only if no
  checkpoints exist yet** in the project DB (prevents noise on re-runs).
- **Manual re-import:** `continuum import-state` is the explicit
  re-import path for forced refreshes.

### 1.3 · `/docs` ingestion via `STATE_DOCS_INDEX.md` ✅

The `@continuum/adapter-docs` package treats `STATE_DOCS_INDEX.md` as
the canonical pointer file when present at the repo root, falling back
to `--docs-dir=./docs` otherwise. Each markdown file becomes one
Observation with stable per-file ID `sha256(relativePath)` formatted as
UUID-shape (re-runs are idempotent — edits refresh content in place
rather than creating duplicates).

### 1.4 · Execution modes ✅

| Mode | Command | Use case |
|---|---|---|
| **stdio (per-project subprocess)** | `continuum start` | Claude Code spawns CONTINUUM on session start; closes on session end. Lowest latency, no network exposure. **Default for dogfood.** |
| **HTTP/SSE (long-running daemon)** | `continuum serve` | Shared engine across multiple Claude Code sessions or external IDE integrations. Bearer auth via `$CONTINUUM_HTTP_TOKEN`. |
| **HTTP/SSE (containerised, hosted)** | `fly deploy` (see [`../DEPLOY_FLY.md`](../DEPLOY_FLY.md)) | What the public AaaS bridge runs (`continuum-engine.fly.dev`). For team-shared engines or customer-facing deployments. |

### 1.5 · What this gives the VC dev team today ✅

- Cross-session memory (P9 — discipline survives the clear-history
  button)
- Verify-then-dissolve todo discipline against deployments (row
  `81223c05` is the canonical proof)
- 9.97x input-token savings via Progressive Disclosure
  ([`../evidence/chat-W22-runs.md`](../evidence/chat-W22-runs.md))
- The full P2 citation discipline (every assertion grounded in an
  Observation ID)

---

## Phase 2 — The Production ARIA Integration 🔮

**Status:** all-aspirational. Zero code in this repo, zero ARIA
embedding, zero tenant onboarding pipeline. Documented here for the
target state and the locked decisions.

### 2.1 · Multi-tenant model 🔮

Every hotel tenant gets a CONTINUUM instance where `workspace_id` is
strictly mapped to `tenant_id`. The MCP server the VoiceCosmos AI
consumes for a given tenant session is **scoped exclusively** to that
tenant's data — no cross-tenant reads, no shared indices, no operator
shortcut to bypass scoping.

### 2.2 · D-V2.2 LOCKED · RuVector multi-tenant collections ✅

**Decision date:** 2026-05-30 (operator explicit affirmation in session).

The architectural flag from `CLAUDE.md` (Postgres RLS vs RuVector
collections) is **resolved.** The chosen path is **RuVector's native
multi-tenant collections.** Rationale:

- D2 (locked) already requires RuVector as the unified V0.5+
  persistence engine. Reverting to Postgres for tenant isolation
  would require either dual-storage (RuVector + Postgres) or a D2
  revision conversation.
- RuVector collections mean the V2 multi-tenant migration is
  **configuration, not code rewrite.** Each tenant = one collection;
  storage isolation is enforced at the engine layer.
- Single largest derisk for the SaaS business model — avoids a
  multi-month persistence migration during the V2 ramp.

**No revision to `ARCHITECTURE.md §14` required.** The D2 RuVector
lock already implies the path.

### 2.3 · Embedded in ARIA Voice OS 🔮

The tenant-scoped engine becomes an internal capability of the ARIA
Voice OS:

- ARIA holds the user-facing voice/text interface
- ARIA invokes CONTINUUM via MCP for memory, citations, todo tracking,
  and Progressive Disclosure retrieval
- Per-property RAG docs, memory observations (incl. SONA feedback),
  and conversation transcripts all flow into that property's CONTINUUM
  collection

### 2.4 · Dependency chain (what must ship before Phase 2 starts) 🔮

| Required first | Tier today | Sprint window |
|---|---|---|
| V0.5 hybrid backend default-backable | 🟡 stub-quality (opt-in) | SPRINT-W23-1 |
| `continuum delete_observation` (Issue #10) | 🟠 implementation parked on `feature/w22-3-delete-observation` | next session |
| RuVector collections API surface in `@continuum/core` | 🔮 not started | V2.0 |
| Multi-tenant configuration layer (tenant→collection routing) | 🔮 not started | V2.1 |
| OAuth/JWT auth model replacing the single Bearer token | 🔮 not started | V2.2 |
| ARIA Voice OS embedding adapter | 🔮 not started (lives in ARIA repo, not here) | V3 |

**Earliest realistic Phase 2 start:** late 2026, after V0.5 promotion
+ Issue #10 ship + a real RuVector collections surface.

---

## Migration table — V0 → V2

| Capability | V0 (today) | V0.5 | V1 AaaS | V2 (multi-tenant) | V3 (ARIA embed) |
|---|---|---|---|---|---|
| Storage backend | SQLite-only | Hybrid (SQLite + RuVector HNSW) opt-in | Same as V0.5, opt-in via env | RuVector-native collections | RuVector tenant-scoped |
| Project model | Single project per DB | Same | Project routed via `X-Continuum-Project` header | Project = tenant_id, collection-scoped | Same |
| Auth | Local file system | Local | Bearer token (single shared secret) | OAuth/JWT per tenant | OAuth + ARIA SSO |
| Network | stdio | stdio | HTTP/SSE | HTTP/SSE multi-tenant | HTTP/SSE internal to ARIA |
| Deployment | Operator laptop | Operator laptop | Fly.io single machine | Fly.io / cloud cluster | Embedded in ARIA service mesh |

---

## Open questions tracked, not actioned

These are real decisions for V2/V3 that we are **not making now** —
per partner-clause #3 (code over architecture-revision):

- **Tenant onboarding pipeline shape** — manual flow, self-serve, or
  ARIA-driven. Defer to V2.0 spec doc.
- **PII retention policy per tenant** — GDPR / data residency requires
  per-tenant retention configs. Defer to V2.1 + Issue #10 closure.
- **Pricing model for the SaaS tier** — per-tenant flat, per-observation
  consumption, or per-Anthropic-cost markup. Defer to V2 business
  planning, not engineering.
- **Cross-tenant aggregation for ARIA-level analytics** — if VoiceCosmos
  HQ wants "across all properties: how many open todos?" — that requires
  an aggregation layer ABOVE CONTINUUM that respects tenant isolation.
  Defer to V3 ops.

---

## See also

- [`../HOW_CONTINUUM_WORKS.md`](../HOW_CONTINUUM_WORKS.md) §7 (Three
  Customers) — the strategic framing this doc operationalizes.
- [`../VISION/UNIFIED-ARCHITECTURE.md`](../VISION/UNIFIED-ARCHITECTURE.md)
  — full 6-layer target architecture with tier labels.
- [`../STATUS-2026-05-29.md`](../STATUS-2026-05-29.md) — current-state
  ledger.
- [`../SPRINT-2026-W22.md`](../SPRINT-2026-W22.md) — current sprint
  scope (intentionally excludes any V2/V3 work).
- [`../evidence/chat-W22-runs.md`](../evidence/chat-W22-runs.md) — the
  moat-verification evidence that proves the dev-workflow promise.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
