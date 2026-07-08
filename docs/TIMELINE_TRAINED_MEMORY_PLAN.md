# CONTINUUM — Timeline + Trained-Memory (Project Plan)

> **Status:** 2026-07-08 · Project plan / spec. Grounded in verified primitives
> (P4 — every ✅ is in code; 🟡 partial/stub; 🔮 roadmap). Spine: The Nine.
> **The pain this kills:** your terminal agent says *"we did X,"* forgets it days
> later, and won't re-read the docs you built. This gives you the receipt.

## The one-line vision

**Reverse-engineer every commit + relationship into the universe (brain) *and* a
timeline → embed into RuVector (vector memory) → ARIAN answers "what did we do for
X?" and isolates it on the timeline + in the galaxy.** History you can interrogate.

## The full loop (and its honest maturity)

```
 sessions · commits · docs · todos · checkpoints
        │  (git / docs / export adapters → observations, timestamped, refs[])   ✅
        ▼
 THE TIMELINE  — Day → Session → Checkpoint, each showing what was completed,     🔮 build
 which commits/repos, the knowledge connected                                     (data ✅)
        │  click an entry → jump to /brain + ISOLATE that cluster (Matrix)        ✅ isolate
        ▼
 THE UNIVERSE  — the 3D brain (commits + relationships)                           ✅
        │
        ▼
 RUVECTOR  — embed every observation (MiniLM) into the HNSW index                 🟡 stub
        │  (hybrid backend: SQLite + RuVector + embeddings, opt-in)
        ▼
 SONA  — self-optimising neural training over the memory                          🔮 roadmap
        │
        ▼
 ARIAN  — /api/ask: "what did we do for X?" → grounded answer + timeline slice     ✅ (needs key)
          + brain isolation
```

## Grounded data path (verified 2026-07-08)

| Need | Primitive | Status |
|---|---|---|
| Chronological events | `continuum_timeline` / `storage.listObservationsAround` (anchor + before/after hours) | ✅ |
| Checkpoints (verified milestones) | `storage.listSnapshots` | ✅ |
| Commits + their DAG | git adapter (`refs` = parent SHAs) | ✅ |
| Sessions captured | export adapter (tails `~/.claude/projects/**` JSONL) | ✅ |
| Knowledge links | `Observation.refs[]` (commit ↔ doc ↔ concept ↔ session) | ✅ |
| Semantic retrieval | Hybrid backend (RuVector HNSW + MiniLM) | 🟡 stub |
| Grounded answers | `/api/ask` (ARIAN) — FTS5 now, vector via hybrid | ✅ (needs `ANTHROPIC_API_KEY`) |

**Gap:** there's a chronological-*window* query (`listObservationsAround`) but no
"list all, paged by time" — Phase 1 adds a thin range query (or anchors at *now*
with a wide window) + a session-grouping pass.

## The plan — phased, each phase shippable

### Phase 1 — The Timeline view (the receipt)   🔮 → the flagship build
- **`/api/timeline`**: pull observations in time order, group **Day → Session →
  Checkpoint**. A "session" = a burst bounded by an idle gap (or an export-adapter
  session boundary); a "checkpoint" = a `listSnapshots` entry in that window.
- **`/timeline` tab** (sibling to `/brain`, `/board`): a vertical, collapsible
  timeline. Each **Day** expands to **Sessions**; each Session shows: a one-line
  summary, **commits** (with SHAs → repo links), **docs touched**, **todos
  completed**, and the **knowledge nodes** created; each Session drills to its
  **checkpoints**.
- **Click an entry → navigate to `/brain` and isolate that cluster** (the Matrix
  curtain), so "show me this on the timeline" and "in the galaxy" are one gesture.
- **Acceptance:** open `/timeline` on this repo → see real sessions with commits +
  docs; click one → brain isolates it. tsc clean.

### Phase 2 — ARIAN interrogates the timeline
- `/api/ask` gains a timeline intent: *"what did we do for X?"* → returns the
  **time-ordered slice** (IDs + summaries) → the timeline **scrolls/highlights** it
  and the brain **isolates** it. Reuses the fly-to-source we built.
- **Acceptance:** ask ARIAN a "what did we do…" question → the timeline lights up
  the exact sessions + the brain isolates them.

### Phase 3 — Activate RuVector (the trained memory)   🟡 → make the stub real
- Flip the hybrid backend on for the dogfood project; **embed every observation**
  (MiniLM) into the HNSW index; point `continuum_search` at vector recall.
- **Acceptance:** semantic queries ("the auth refactor") return the right sessions
  even without keyword overlap; a smoke test asserts recall on known items.

### Phase 4 — SONA   🔮 roadmap
- Self-optimising neural layer over the embedded memory. Explicitly *not now* —
  parked until RuVector is production (per the honest ledger, D2). No claims made.

## How this feeds the Project Plan (the forward loop)

The timeline is the **retrospective** (what we did); the **board + `continuum next`**
are the **prospective** (what's next). Together they close the PM loop: *history →
plan*. A session that completed tasks auto-advances the board; the "which tasks are
next" engine reads the same DAG. The timeline is where a human (P9) reviews the
receipt before trusting the next step.

## The dogfood dependency (P4)

Rich per-session summaries require the **export adapter capturing your sessions** —
which is why `init --guided` + the session hook matter. On a fresh project the
timeline starts sparse and fills as you work; on *this* repo it already has real
data to render.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
