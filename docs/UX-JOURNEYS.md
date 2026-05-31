# UX Journeys — three customers, one engine

> **Bound by [The Nine](../AGENTS.md) v0.1.0.**
>
> Canonical UX framing for CONTINUUM. Three distinct customer journeys
> share one engine; each carries different UI surfaces, abstraction
> levels, and tier reality.
>
> Every component below carries an explicit tier label per the discipline
> rules in [`VISION/UNIFIED-ARCHITECTURE.md`](./VISION/UNIFIED-ARCHITECTURE.md):
> ✅ **shipped** · 🟡 **partial** · 🟠 **planned** · 🔮 **aspirational**.
>
> Per P4: this document does not lie about the shipped state of the
> codebase. Marketing narrative is separated from engineering reality
> in the tier column.

---

## Journey 1 · The AI Developer & Platform Engineer

**Audience:** Technical operators orchestrating multi-agent swarms.
**Mandate:** Make the system's economic and architectural moats *physically visible*.

| Component | Tier | Evidence / Location |
|---|---|---|
| Chat UI at `continuum-kohl.vercel.app/chat` (Vercel-hosted) | ✅ shipped | commit `b0cf8bd` · `apps/console/app/chat/page.tsx` |
| Natural-language intent input | ✅ shipped | `<input>` form, vanilla React `useState` |
| Progressive Disclosure tool-card stacking (L1 → L2 → L3) | ✅ shipped | `ToolCard` component, `LAYER_LABEL` map |
| Inline token economics counter (input/output + $-cost) | ✅ shipped | `UsageBar` component, Sonnet 4.6 pricing |
| ~10x token savings (measured, not claimed) | ✅ shipped | **9.97x input-token ratio verified** — see [`evidence/chat-W22-runs.md`](./evidence/chat-W22-runs.md) |
| Vibe Graphing canvas (`vibely.style`) — visual editable DAG | 🔮 aspirational | Layer 3 of VISION — zero code in this repo |
| SIR (Structured Intermediate Representation) blueprint compiler | 🔮 aspirational | Layer 3 — zero code |
| Mercury dLLM execution layer (1,109 tok/s claim) | 🔮 aspirational | Layer 3 — no account, no integration |
| MCTS trace panel — Proponent / Skeptic agent debate | 🔮 aspirational | Layer 4 H-MARA — see `VISION/UNIFIED-ARCHITECTURE.md` §"v0.2 H-MARA enhancements" buckets B1–B5 |
| 64-byte cryptographic witness display | 🔮 aspirational | Layer 1 RVM — Issue #19, zero integration |
| Shell-exit-code verify-then-dissolve proxy (interim) | ✅ shipped | `verifyCommand` discipline; canonical proof row `81223c05` (2026-05-15) |

**Net:** ~50% real / 50% aspirational. The shipped half is the economic moat;
the aspirational half is the Vibely + H-MARA reasoning layer.

---

## Journey 2 · The Non-Technical Business Operator (VoiceCosmos ARIA)

**Audience:** Hotel tenants + enterprise B2B customers.
**Mandate:** Abstract away factory mechanics (DAGs, MCTS traces, token counters).

| Component | Tier | Evidence / Location |
|---|---|---|
| ARIA Voice OS embedded interface | 🔮 aspirational | V3 — see [`INTEGRATIONS/VOICECOSMOS.md`](./INTEGRATIONS/VOICECOSMOS.md) §2.3 |
| Per-tenant CONTINUUM scoping (`workspace_id` = `tenant_id`) | 🔮 aspirational | V2 multi-tenant — VOICECOSMOS.md §2.1 |
| RuVector native multi-tenant collections (storage isolation) | 🔮 aspirational | **D-V2.2 LOCKED** (2026-05-30) — VOICECOSMOS.md §2.2 |
| Per-property RAG docs ingestion | 🔮 aspirational | depends on V2 multi-tenant config layer |
| Voice/text input as the only UX surface | 🔮 aspirational | belongs to ARIA repo, not this one |
| MCP invocation plumbing (the substrate ARIA would call) | ✅ shipped | stdio + HTTP/SSE both live; Bearer auth shipped |

**Net:** ~10% real. Only the MCP plumbing exists. Everything customer-visible
is V2/V3. Earliest realistic start: late 2026, after V0.5 promotion + the
multi-tenant configuration layer ships.

---

## Journey 3 · The Solo Developer (CONTINUUM Baseline Dogfooding)

**Audience:** Solo developers building on a local machine.
**Mandate:** No bespoke web UI. Bring-your-own-client. Background MCP server.

| Component | Tier | Evidence / Location |
|---|---|---|
| Bring-your-own MCP client (Claude Code, Cursor, Claude Desktop, etc.) | ✅ shipped | works today with any MCP-aware client |
| `continuum init` — project DB + MCP registration snippet | ✅ shipped | `packages/cli/src/index.ts` |
| `continuum start` — stdio MCP server | ✅ shipped | same |
| `continuum serve` — HTTP/SSE MCP server (Bearer auth) | ✅ shipped | `packages/mcp-server/src/http.ts` |
| `continuum status` — current state + todo counts + data location | ✅ shipped | `packages/cli/src/index.ts` |
| `continuum import-state` — STATE.md → first checkpoint | ✅ shipped | `packages/core/src/state-md.ts` |
| Auto-import STATE.md on first `init` (when no checkpoints exist) | ✅ shipped | Smoke-tested against real VC-Hospitality STATE.md |
| `continuum://session/briefing` — Layer-0 warm-start resource | ✅ shipped | `packages/mcp-server/src/resources/session-briefing.ts` |
| `continuum.session_start` Prompt — enforces L0→L1→L3 protocol | ✅ shipped | `packages/mcp-server/src/prompts/session-start.ts` |
| `continuum.cite` Prompt — `[obs:<id>]` citation discipline | ✅ shipped | `packages/mcp-server/src/prompts/cite.ts` |
| 9-source aggregation moat (docs + git + claude-mem + sona + export) | 🟡 partial | 3 of 5 shipped: docs ✅, git ✅, export ✅ — claude-mem and sona adapters pending V0.5 |
| Verify-then-dissolve todo discipline (incl. `verifyCommand` gate) | ✅ shipped | end-to-end proof row `81223c05` (2026-05-15) |
| `continuum_delete_observation` (incident response) | ✅ shipped | Issue #10 / W22-3 (2026-05-30) |

**Net:** ~100% real. This is the V0 Dogfood phase; runs on the verified SQLite +
FTS5 baseline + local MCP transports. The V0.5 promotion (Hybrid → default) will
preserve the entire Journey 3 surface unchanged — operators see no break.

---

## Tier roll-up across all three

| Journey | Audience | Tier | Foundational dependency |
|---|---|---|---|
| 1 · AI Developer | Technical operators | ~50% ✅ / 50% 🔮 | Vibely + H-MARA + RVM (multi-year) |
| 2 · Business Operator | Hotel tenants / B2B | ~10% ✅ / 90% 🔮 | V0.5 hybrid promotion + V2 multi-tenant config + V3 ARIA embedding |
| 3 · Solo Developer | Individual devs | 100% ✅ | V0 SQLite baseline (verified, in production) |

---

## Why this matters for sprint discipline

Per partner-clause #3 (`CLAUDE.md` §Partner agreement): **code > architecture
revision.** Journeys 1 and 2 have substantial 🔮 surface. Building bespoke
front-ends for either before promoting the V0.5 RuVector hybrid backend would
violate the rule that says we must not let architecture grow while code lags.

**Journey 3 is the floor.** It is 100% real because we kept the surface narrow
and shipped against verifiable behaviour. Journeys 1 and 2 will become real
the same way: small commits, layer by layer, each verified before the next.

---

## See also

- [`VISION/UNIFIED-ARCHITECTURE.md`](./VISION/UNIFIED-ARCHITECTURE.md) — 6-layer target-state with full tier roll-up
- [`INTEGRATIONS/VOICECOSMOS.md`](./INTEGRATIONS/VOICECOSMOS.md) — Journey 2 plug-in spec (Phase 1 ✅ + Phase 2 🔮)
- [`evidence/chat-W22-runs.md`](./evidence/chat-W22-runs.md) — Journey 1 moat verification (9.97x measured)
- [`STATUS-2026-05-29.md`](./STATUS-2026-05-29.md) — current shipped-vs-aspirational ledger
- [`SPRINT-2026-W22.md`](./SPRINT-2026-W22.md) — closed sprint that proved the moat
- [`../AGENTS.md`](../AGENTS.md) — The Nine v0.1.0 binding (governs all of the above)

---

_Bound by The Nine v0.1.0. Per P5: when this document and AGENTS.md
conflict, AGENTS.md wins. Per P9: each journey is a description of where
we are, not a commitment to a specific build order — the operator
authorizes which 🔮 → 🟠 → 🟡 → ✅ transitions get sprint slots._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
