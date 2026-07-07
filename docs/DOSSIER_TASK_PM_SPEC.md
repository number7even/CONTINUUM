# CONTINUUM — Verifiable Task & Project Management (Spec)

> **Status:** 2026-07-07 · Spec / direction. Grounded in primitives that already
> ship (P4 — every "✅" below is in code today; 🟡 partial; 🔮 to build).
> **Spine:** [The Nine](https://thenine.foundation) — the human-agent trust protocol.
> This is the trust axis applied to project management.

## The one-line thesis

**The only project-management layer where "Done" is not a button — it's a passing
`verifyCommand`.** Linear, Jira, Asana, Notion, and even the Dossier product all trust a
human (or an agent) clicking *done*. CONTINUUM refuses: a task dissolves only when a shell
command exits 0 (P2/P4). PM that cannot lie about what's finished.

## The pivot — the dossier was a task all along

The **dossier** (a compiled, verified record of an entity) and the **Live Todo Pipeline**
are the same object seen from two sides. A CONTINUUM `Todo` already carries every PM
primitive — verified from `packages/core/src/types.ts`:

```ts
interface Todo {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';   // ← the board columns
  refs: string[];              // ← Observation IDs = this task's DOSSIER (context)
  verifyCommand?: string;      // ← the PROOF gate: no "done" without exit 0
  blockedBy: string[];         // ← a real dependency DAG (critical path / Gantt)
  createdAt: string;
  completedAt?: string;
}
```

So we are not building a PM system from scratch. We are **surfacing** one that already
exists in the memory engine.

## Object model (what maps to what — all ✅ unless tagged)

| PM concept | CONTINUUM primitive | Status |
|---|---|---|
| **Workspace / Project** | a CONTINUUM project (tenant-scoped, `X-Continuum-Project`) | ✅ · RBAC roles 🔮 V2 |
| **Task** | `Todo` (title · status · verifyCommand · blockedBy · refs) | ✅ (`create/get/update` MCP tools) |
| **"Done" gate** | `verifyCommand` exits 0 → verify-then-dissolve | ✅ (`continuum verify`) |
| **Dependencies / critical path** | `Todo.blockedBy[]` (a DAG) | ✅ data · 🔮 critical-path view |
| **Task context / brief** | the **Dossier** — `refs[]` → observations (code refs, commits, docs) | ✅ (dossier panel) |
| **Board / status lamp** | the **6-state model** — RUNNING · REVIEW · DONE · SKIPPED · BLOCKED · FAILED | 🟡 (`verify --json` emits it; UI 🔮 Sprint 3) |
| **Audit / "what was true on May 14"** | checkpoints (immutable, hash-chained) | ✅ |
| **The map** | the 3D brain (5-source galaxy) | ✅ |

### State mapping (persisted `status` → runtime 6-state)

```
open ─────────────▶ (queued)
in_progress ──────▶ RUNNING  ──verify──▶ DONE      (exit 0)
                                └────────▶ FAILED    (exit ≠ 0)
in_progress ──────▶ REVIEW   (awaiting the human leap — P9)
blocked ──────────▶ BLOCKED  (upstream blockedBy not DONE)
(no verifyCommand)▶ SKIPPED  (soft — tracked but unproven)
```

## The differentiator (why this is ownable)

- **Proof-gated completion (P2/P4).** No other PM tool gates "done" on a machine-verifiable
  witness. This is the *exact* moat from the launch dossier — proof-gated memory — expressed
  as a workflow surface.
- **The dossier is the context card, auto-compiled.** Where Dossier (ruvnet) has you *author*
  context cards, ours are **generated** from the verified graph (`refs` → real code/commits/docs).
- **The leap stays human (P9).** Agents move tasks to REVIEW and attach proof; only the human
  flips REVIEW → DONE. Governed autonomy, not autonomy without a leash.
- **One engine, three customers.** Dogfood (you) · OSS solo founders · tenant RBAC — same board.

## The code-source engine — codebase-memory-mcp (🔮 tracked integration)

To make a Task's dossier reference *real* symbols with world-class fidelity, wire
**[DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)** (MIT,
local-first, MCP-native, SQLite — same invariants as us) as the **code·symbols ingestion
engine**, upgrading our basic codegraph bridge. It parses 158 languages + Hybrid LSP (9
langs) and ships a shareable `graph.db.zst` (instant team cold-start — complements Sprint 1).
**Gate (P4):** its numbers (99.2% token cut, 3-min Linux-kernel index) are the *vendor's* —
verify them in a spike before committing. **Do NOT compete on its 3D viz** (that's now table
stakes — them, gitdiagram, the second-brain demo all have it); our moat is the trust layer.

## What to build (the surface — nothing new in the engine)

1. **The Board** (console): columns = the 6 states; each card = a `Todo`; the card body = its
   **Dossier** (refs → content, code refs, relationships). 🔮
2. **Proof-gated "Done":** the DONE column accepts a card only when its `verifyCommand` is
   green — the button *runs* `verify`, it doesn't fake it. 🔮 (engine ✅ via `verify --json`)
3. **Dependency view:** render `blockedBy[]` as a DAG / critical path; auto-BLOCK downstream
   tasks until upstream is DONE. 🔮 (data ✅)
4. **Brain ⟷ Board:** click a task → fly to its dossier nodes in the galaxy, and back. 🟡
5. **codebase-memory-mcp spike** → richer code refs on every task. 🔮

## Honest odometer

✅ **shipped:** projects · `Todo` (status/verify/blockedBy/refs) + 3 MCP tools · dossier ·
`verify --json` (6-state feed) · checkpoints · the 3D brain.
🟡 **partial:** brain↔task linking · the 6-state UI.
🔮 **to build:** the Board UX · proof-gated Done button · dependency/critical-path view ·
codebase-memory-mcp integration · RBAC roles (V2).

**Takeaway:** the verifiable PM layer is ~80% *primitives* and ~20% *surface*. We build the
board on top of an engine that already refuses to lie.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
