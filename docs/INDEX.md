# Continuum Documentation

This directory holds user-facing documentation. Internal architecture lives at
the root in [`ARCHITECTURE.md`](../ARCHITECTURE.md); discipline lives in
[`AGENTS.md`](../AGENTS.md) (The Nine v0.1.0).

## Current operating docs (read these first)

- [`STATUS-2026-05-29.md`](./STATUS-2026-05-29.md) — one-page truthful ledger
  of what is shipped, partial, planned, or aspirational. Layer-by-layer
  reality check + today's commit history + open verification debt.
- [`SPRINT-2026-W22.md`](./SPRINT-2026-W22.md) — current 2-week sprint
  plan (2026-05-29 → 2026-06-12): verify the `/chat` Progressive
  Disclosure moat under live fire, close Tier-A defects, promote V0.5
  hybrid backend.
- [`UX-JOURNEYS.md`](./UX-JOURNEYS.md) — the three customer journeys
  (AI Developer, Business Operator, Solo Developer) with tier labels
  per component. ~100% real for Journey 3, ~50% for Journey 1,
  ~10% for Journey 2 — the canonical UX framing.
- [`VISION/UNIFIED-ARCHITECTURE.md`](./VISION/UNIFIED-ARCHITECTURE.md) —
  6-layer target-state architecture (RVM → CONTINUUM → Vibely → H-MARA →
  Hyperscale → Perimeter, governed by The Nine). Multi-year horizon.
  **Tier-labeled — do not mistake for a sprint backlog.**

## Product + deployment docs

- [`HOW_CONTINUUM_WORKS.md`](./HOW_CONTINUUM_WORKS.md) — product narrative
  + architectural mechanics deep-dive.
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
