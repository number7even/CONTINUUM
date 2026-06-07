# Continuum Documentation

This directory holds user-facing documentation. Internal architecture lives at
the root in [`ARCHITECTURE.md`](../ARCHITECTURE.md); discipline lives in
[`AGENTS.md`](../AGENTS.md) (The Nine v0.1.0).

## Current operating docs (read these first)

- [`STATUS-2026-05-29.md`](./STATUS-2026-05-29.md) — one-page truthful ledger
  of what is shipped, partial, planned, or aspirational. Layer-by-layer
  reality check + today's commit history + open verification debt.
- [`SPRINT-2026-W22.md`](./SPRINT-2026-W22.md) — closed W22 + W23
  sprint plan with G1 Path D revision history. Verify-the-moat + close
  Tier-A defects + V0.5 hybrid promotion. **All tickets closed**
  except #11 (CI gated on operator GH billing, out-of-band).
- [`SPRINT-2026-W24.md`](./SPRINT-2026-W24.md) — **closed** 2026-06-03
  (snapshot `e3bd67a4`, 34/34 verify-green). V1.1 HTTP Polish —
  OSS/Docker Baseline. TLS + JWT + supervision + container hardening
  + #18 FTS5 canary fixture. All 5 deliverables shipped.
- [`SPRINT-2026-W25.md`](./SPRINT-2026-W25.md) — **closed** 2026-06-05
  (snapshot `83faa040`, 35/35 verify-green). Single-objective
  throughput sprint. Median 53.4s · 0.98 recall · 12-19ms p95. Two
  knobs closed the gap: T1 (EMBED_BATCH_SIZE 32→128) + T6 (RuVector
  `insertBatch`). T7 (quantized) discovered already-applied — P4 catch.
- [`SPRINT-2026-W26.md`](./SPRINT-2026-W26.md) — **closed** 2026-06-07
  (snapshot `5670d816`, 41/41 verify-green). V1 swarm aggregation —
  ring (git) + mesh (docs) + hierarchical (export) topologies +
  byzantineVote() primitive + verify-then-dissolve mechanical. All
  four W26 deliverables shipped. Zero orphan processes.
- [`SPRINT-W27.md`](./SPRINT-W27.md) — **current sprint**
  (2026-07-17 → 2026-07-31): V1.2 multi-tenant native scaling
  (Path A · filesystem-isolated tenants). Per-tenant
  `~/.continuum/<tenantId>/` storage routing + JWT-claim/header
  validation with hard reject on mismatch + 5 layered mechanical
  isolation proofs. ruvector@0.2.25 does NOT ship native Collections
  (P4 catch — see § probe findings). Journey 3 stdio preserved.
- [`UX-JOURNEYS.md`](./UX-JOURNEYS.md) — the three customer journeys
  (AI Developer, Business Operator, Solo Developer) with tier labels
  per component. ~100% real for Journey 3, ~50% for Journey 1,
  ~10% for Journey 2 — the canonical UX framing.
- [`INTEGRATIONS/VIBELY-HANDOFF.md`](./INTEGRATIONS/VIBELY-HANDOFF.md) —
  what CONTINUUM needs from the external Vibely team to integrate
  Layer 2 (orchestration / SIR / Mercury dLLM). Contract proposal,
  not committed code.
- [`INTEGRATIONS/H-MARA-BUILD-MAP.md`](./INTEGRATIONS/H-MARA-BUILD-MAP.md) —
  H-MARA is **internal** (we own the reasoning core; it operates
  invisibly behind CONTINUUM). Architecture + 5-phase build plan
  (H0 spec → H1 MVP stub → H2 real MCTS → H3 RVM Tier-2 Judge →
  H4 advanced + H5 production). Hard-gated on RVM Phase R2 + local
  inference. Not a SPRINT-W24 commitment — roadmap only.
- [`INTEGRATIONS/RVM-BUILD-MAP.md`](./INTEGRATIONS/RVM-BUILD-MAP.md) —
  architecture + 4-phase build plan to take Layer 0 (RVM hypervisor)
  from "source-only" → "first witness in production" WITHOUT breaking
  Journey 3's zero-config `npm install` promise.
- [`UI-SKILLS.md`](./UI-SKILLS.md) — operator-toolkit reference for the
  5 UI/interface-building skills (Impeccable, Taste Skill, Emil Design
  Eng, UI UX Pro Max, 21st.dev Magic MCP). Installed globally at
  `~/.claude/skills/`; available across all projects.
- [`V0.5-HYBRID.md`](./V0.5-HYBRID.md) — V0.5 hybrid storage backend
  reference (SQLite + RuVector + MiniLM-L6-v2). Default since
  2026-06-01. Covers migration from V0, performance characteristics,
  rollback path, memory tuning. Read before running `continuum
  migrate --backend hybrid` on an existing project.
- [`VISION/UNIFIED-ARCHITECTURE.md`](./VISION/UNIFIED-ARCHITECTURE.md) —
  6-layer target-state architecture (RVM → CONTINUUM → Vibely → H-MARA →
  Hyperscale → Perimeter, governed by The Nine). Multi-year horizon.
  **Tier-labeled — do not mistake for a sprint backlog.**

## Product + deployment docs

- [`HOW_CONTINUUM_WORKS.md`](./HOW_CONTINUUM_WORKS.md) — product narrative
  + architectural mechanics deep-dive.
- [`DEPLOY_SELF_HOSTED.md`](./DEPLOY_SELF_HOSTED.md) — **NEW (W24-1)** Docker
  self-hosting walkthrough with Caddy (recommended) / nginx / Traefik TLS
  terminator examples. One-command HTTPS via the
  [`examples/caddy/`](./examples/caddy/) stack.
- [`DEPLOY_FLY.md`](./DEPLOY_FLY.md) — Fly.io engine deployment walkthrough.
- [`CTO_ANALYSIS_2026-05-20.md`](./CTO_ANALYSIS_2026-05-20.md) — early CTO
  analysis snapshot.
- [`H-MARA-CONTINUUM/`](./H-MARA-CONTINUUM/) — H-MARA integration planning
  (v0.1 draft; preserved for context, superseded by VISION doc tier labels).

## Status

**V1 AaaS LIVE** — checkpoint `d0fa50a7` stamped 2026-05-28, 19 entries
verify-green at stamp time. Public infra: engine on Fly
(`continuum-engine.fly.dev`), frontend on Vercel (`continuum-kohl.vercel.app`).

## Planned docs (still TBD)

- `installation.md` — install + first-run setup
- `mcp-tools.md` — full tool reference with examples
- `adapters.md` — writing a custom source adapter
- `state-snapshot-format.md` — `product_state[timestamp]` schema reference
- `todo-pipeline.md` — todo state machine + provenance
- `multi-tenant.md` — SaaS deployment guide (V2)
- `aria-integration.md` — VoiceCosmos hotel-tenant integration (V3)

## See also

- [`../README.md`](../README.md) — project overview + quick start
- [`../AGENTS.md`](../AGENTS.md) — The Nine v0.1.0 binding (source of truth)
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — engineering source-of-truth (D-decisions)
- [`../CLAUDE.md`](../CLAUDE.md) — session-start onboarding for AI assistants
