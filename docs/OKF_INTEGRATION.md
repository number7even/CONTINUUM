---
name: "OKF Integration — CONTINUUM ↔ the Open Knowledge Format"
description: "How CONTINUUM maps to Google's OKF (topic folders, index.md maps, YAML front matter, one concept per file), what shipped, and how to use it."
type: reference
---
# OKF Integration — CONTINUUM ↔ the Open Knowledge Format

> **Status:** shipped 2026-07-19 — export adapter + ingest upgrade + repo maps, gated in
> `make smoke` (`verify-okf.mjs`). This document itself carries OKF front matter (the exemplar).

## The shared thesis

OKF (Google's Open Knowledge Format) standardizes agent-navigable knowledge: **topic
folders · an `index.md` map in every folder · YAML front matter (name/description/type)
on every document · one concept per file** — so an agent reads maps and summaries first
and loads only the exact files it needs. CONTINUUM attacks the same disease at the
database layer via **Progressive Disclosure** (Layer-0 briefing → Layer-1 compact FTS5
hits → Layer-2 timeline → Layer-3 full text), with a measured **~2.85x token saving**.
Both prove the same law: *cheap, reliable AI memory = retrieving less, more precisely.*

## What shipped (the three slices)

### 1 · `continuum export-okf` — the brain as a portable OKF tree
`packages/core/src/okf-export.ts` + the CLI command:

```
continuum export-okf -p <project> [--out <dir>]
```

Exports the project's knowledge as an OKF tree any OKF-speaking agent can navigate
**without MCP access**: topic folders from source families (`commits/ docs/ concepts/
brand/ memory/`) + `todos/` + `checkpoints/`; ONE observation per file (our atoms are
already single-concept — OKF minimalism for free); front matter with
`name / description / type / id / timestamp`; an `index.md` map in every folder and at
the root. Caps are **loud** (`perTopicLimit`, noted in the map — no silent truncation).

Receipt: the live `graph-demo` brain exported as **304 files** (`commits:178 · docs:22 ·
todos:100`) on first run.

### 2 · OKF-aware ingest — `adapter-docs` reads front matter
`parseFrontMatter()` (minimal, flat, no deps — P4: malformed → `undefined`, never a
guess) attaches a doc's `name/description/type` to `Observation.metadata.okf`. Internal
markdown links were **already** resolved into `refs[]` graph edges (with typed verbs), so
OKF wikis ingest as first-class, edge-connected CONTINUUM sources.

### 3 · The repo is map-navigable
`docs/INDEX.md` (the hub, pre-existing) + new `packages/index.md`, `apps/index.md`,
`apps/amf/index.md`, plus the per-area `AGENTS.md` Project Maps. **Honest note (P4):**
most `docs/*.md` do **not** yet carry front matter — an earlier `---` grep was a false
positive (horizontal rules). This file is the exemplar; retrofitting the rest is
incremental, per-edit work, not a bulk rewrite.

## Pillar scoreboard (after this ship)

| OKF pillar | CONTINUUM |
|---|---|
| Topic folders | ✅ in exports · 🟡 advisory in the repo |
| `index.md` everywhere | ✅ in exports · ✅ repo hubs + 3 new folder maps |
| YAML front matter | ✅ in exports · ✅ ingest reads it · 🟡 repo docs retrofit incremental |
| One concept per file | ✅ in exports (one atom = one file) · discipline-level in the repo |

## Where the two systems now meet

```
OKF wiki ──(adapter-docs: front matter → metadata.okf, links → refs)──▶ CONTINUUM brain
CONTINUUM brain ──(continuum export-okf)──▶ portable OKF tree ──▶ any OKF agent
```

CONTINUUM is now bidirectionally conversant with the format — it can *eat* OKF knowledge
and *speak* it — while keeping its own advantages (FTS5 query, privacy filter, trust
tiers, the Truth Ledger) on the inside.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
