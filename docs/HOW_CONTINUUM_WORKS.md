# How Continuum Works

> **Audience:** founders, developers, investors, prospective contributors.
> **Companion to:** [`ARCHITECTURE.md`](../ARCHITECTURE.md) (the engineering source-of-truth).
> **Status:** v0.3-aligned narrative (current as of 2026-05-14).

---

## TL;DR

Continuum is a **persistent intelligence layer** that sits between a developer
and their AI coding assistant (Claude Code, Cursor, Open Claude Code, etc.).

It solves the **AI-collaborator memory problem** — the cycle solo founders,
consultants, and small teams know painfully well: every new session, the AI
forgets what shipped yesterday, what's still broken, what was decided last
week. Hours per day are lost re-explaining context.

Continuum reclaims those hours by aggregating **five sources of project
truth** — `/docs` (RAG), memory observations, human-in-the-loop feedback,
git history, AI session transcripts — and producing **three critical
outputs**: timestamped state snapshots, session-start briefings, and a live
todo pipeline.

Token cost stays low via **progressive disclosure** (3-layer search → timeline
→ fetch). The AI client retains its execution superpowers; Continuum supplies
the context.

---

## 1. The Problem

```
Without Continuum                       With Continuum
─────────────────                       ──────────────
9:00 AM  open Claude Code              9:00 AM  open Claude Code
9:00 AM  "what did we ship?"           9:00 AM  AI reads briefing
9:15 AM  re-explain the auth fix       9:00 AM  knows what's active,
9:30 AM  re-explain xAI vs OpenAI                 dormant, broken
9:45 AM  re-explain why feature X      9:01 AM  starts the actual work
         was deferred
10:00 AM start the actual work
─────────────────                       ──────────────
60 minutes wasted re-explaining        ZERO minutes
                                       AI opens warm
```

Across a year of solo founder work, this is **hundreds of hours**. Lost to
the same conversation, every day.

---

## 2. The Five-Source Aggregation Engine — The Moat

What makes Continuum defensible is that **no other tool combines all five**:

| Source | What it captures | Existing tools that do this in isolation |
|---|---|---|
| **`/docs` RAG** | Markdown project knowledge | Notion AI, Mem.ai |
| **Memory observations** | What tools were called, what files were read | claude-mem (alone) |
| **HITL feedback signals** | Operator approve/modify/reject decisions | Linear, custom |
| **Git history** | Commits, branches, diffs | git log (alone) |
| **AI session transcripts** | What was discussed turn by turn | nowhere |

Continuum is the first system to fuse them into a single **checkpointed state**.

### Hook-driven ingestion (not polling)

Continuum doesn't poll. It listens to AI-client lifecycle hooks:

```
SessionStart      → boot Worker, prime context
UserPromptSubmit  → record prompt as Observation
PostToolUse       → ingest tool result, check Todo Pipeline for resolutions
Stop              → mid-session state capture (lightweight)
SessionEnd        → write product_state[] snapshot, generate digest
```

The Aggregator normalizes every disparate input into a canonical `Observation`
record before indexing.

### Strict privacy invariant

Before any data is indexed, the Aggregator scans for `<private>...</private>`
blocks and configurable patterns (API keys, internal IDs, etc.). **Anything
flagged is dropped before it touches the SQLite/Chroma layer** — including
secrets that accidentally land in:

- A `/docs` markdown file (someone pasted a key)
- An AI session transcript (Claude saw a credential)
- A git commit message (it happens)
- A SONA feedback note (customer PII)

Audit log records *what* was redacted and *why*, never the redacted content
itself. See [`ARCHITECTURE.md` §8](../ARCHITECTURE.md#8-security--privacy).

---

## 3. Three Critical Outputs

### Output 1 — Timestamped `product_state[]` snapshots

Continuum's defining moat. Every checkpoint is an **append-only, immutable,
hash-stamped record** of project status:

```ts
StateSnapshot {
  id:        string         // UUID
  timestamp: ISO-8601
  active:    StateEntry[]   // "currently playing in production"
  dormant:   StateEntry[]   // "built but not the active path"
  broken:    StateEntry[]   // "known failures with repro"
  hash:      SHA-256        // tamper-evidence
  reason:    string         // why this checkpoint was written
}
```

The AI can answer **"what was true on May 14?"** with a verifiable result —
not a guess. Every entry carries a `verifyCommand` (a `grep`, `curl`, or
`file:line`) so the claim can be re-proven at any time.

**V0.5+ upgrade — RuVector cognitive containers:** state snapshots become
**Git-like copy-on-write branches** (~2.5 MB per 1M-vector + 100-edit
snapshot, vs hundreds of MB with naive JSON). Linked by a **tamper-evident
cryptographic witness chain** — history can't be silently rewritten.

### Output 2 — Auto-generated session-start briefings

Continuum exposes a pre-rendered briefing at the MCP resource:

```
continuum://session/briefing
```

…and pairs it with a pre-built MCP prompt:

```
continuum.session_start
```

This prompt instructs the AI to read the briefing **before generating any
responses**. The cold-start problem disappears. Your developer Monday morning
opens with full context, automatically.

### Output 3 — Live todo pipeline

Open commitments are tracked from **initial discussion → action → final
verification**:

```ts
Todo {
  status:        'open' | 'in_progress' | 'blocked' | 'done'
  refs:          Observation[]    // provenance — where did this commitment come from?
  verifyCommand: string?          // shell command that proves done
  blockedBy:     Todo[]           // dependency graph
}
```

**Crucial detail — provenance.** Every todo links back to the Observations
that motivated it. You can ask: *"this todo about the booking redirect — what
did we discuss when we decided that mattered?"* — and Continuum walks the
graph back to the exact conversation.

The pipeline is accessible to the AI via:

```
continuum://todos/open
```

---

## 4. Token Efficiency — Progressive Disclosure

A naive memory system dumps full content into every prompt. That blows the
context window and burns API tokens. Continuum adopts **3-layer Progressive
Disclosure** (pattern verified from `thedotmack/claude-mem` v13.2.0):

```
Layer 1 — continuum_search()           Layer 2 — continuum_timeline()       Layer 3 — continuum_get_observations()
────────────────────────────           ──────────────────────────────       ────────────────────────────────────
Returns compact index of IDs +         Given an interesting ID, returns     Given a filtered list of IDs,
1-line titles + scores.                chronological context around it      returns FULL content. Batch only —
~50-100 tokens per result.             (what was happening BEFORE/AFTER     never one-at-a-time.
                                       this observation).
                                                                            ~500-2000 tokens per observation.

Use when: scoping a question.          Use when: a hit is interesting       Use when: AI has filtered to the
                                       and you need causal context.         specific observations it actually
                                                                            needs to read.
```

**Result: ~10x token savings** compared to naive flat-fetch designs.

The discipline is enforced by tool documentation + the `continuum.session_start`
prompt that explicitly reminds the AI:

> "Use `continuum_search` first to filter by ID. Only call `continuum_get_observations`
> for the IDs you actually need to read."

---

## 5. Clean Synergy with AI Execution Tools

This is what keeps Continuum **lean and composable** instead of bloated.

**Continuum manages context.** It knows what's true, what's open, what's
blocked, what was decided.

**The AI client executes work.** Open Claude Code / Cursor / Claude Desktop
keep their full execution toolbelt (Bash, Edit, MultiEdit, Task, EnterWorktree,
TodoWrite, Grep, Read, etc.).

The boundary is intentional:

```
Continuum flags…                       Open Claude Code resolves with…
───────────────────                    ────────────────────────────────
Todo with verify_command                Bash — run the verify
Todo "edit X to Y"                      Edit / MultiEdit — apply the change
Todo "refactor feature N"               Task (sub-agent) — delegated work
Todo "review branch Z"                  EnterWorktree — isolated review env
STATE.md drift vs code                  Read + Grep — verify in code
New observation flagged                 TodoWrite — capture follow-up
```

Continuum does NOT spawn Claude Code. It does NOT replace its tools. It
**provides the truth** Open Claude Code needs to use its tools effectively.

---

## 6. V1+ Roadmap Mechanics (The Self-Improving Engine)

V0 ships clean, linear scripts. V0.5+ replaces them with self-organizing
intelligence. Three mechanisms drive this:

### A. Swarm Consensus for Ingestion (V1)

V0's Aggregator runs source adapters in-process, sequentially. V1 introduces
**ephemeral ruv-swarm agents** — a four-step lifecycle:

```
1. Instantiation & Specialization
   ──────────────────────────────
   A lifecycle hook fires (git commit, file saved, etc.).
   Continuum instantiates a tiny purpose-built neural network
   dedicated solely to that ingestion task.

2. Cognitive Topology Selection
   ────────────────────────────
   Topology fits the data shape:

     Mesh        → /docs + memory       (peers cross-reference)
     Ring        → SONA + git           (chronological coherence required)
     Hierarchical → AI session export   (nested turn-by-turn structure)

3. Execution & Byzantine-Fault-Tolerant Consensus
   ────────────────────────────────────────────
   Agents work concurrently. They use BFT consensus protocols
   (Raft / Gossip) to agree on facts before writing.

   Example conflict: /docs says an API endpoint behaves one way,
   but git shows a recent commit that changed it. The swarm
   resolves the conflict before a single canonical Observation
   record is committed.

4. Dissolution
   ───────────
   Once the batch is committed to RuVector, the swarm immediately
   dissolves. Zero wasted compute. Pure ephemeral intelligence.
```

### B. CRDTs + Causal Ordering for Safe State Merges (V0.5+)

V0 uses brittle custom JSON-comparison logic to compute `state_diff` and
`todo_delta`. V0.5+ replaces this with RuVector's native Delta Behavior:

**Conflict-free Replicated Data Types (CRDTs).** If you have Claude Code open
in a terminal AND Cursor open in your IDE AND both modify your
`product_state[]` snapshot at the same millisecond — CRDTs mathematically
merge both writes safely. No race conditions. No locking. The final digest
presents one coherent narrative.

**Causal Ordering.** Instead of "latest timestamp wins," Delta Behavior tracks
**cause-effect chains** — Event B happened *because of* Event A. The state
history becomes a causal graph, not just a timeline.

**Delta Consensus = CRDTs + Causal Ordering.** The result: structured deltas
emerge natively from the database. Continuum never has to write custom diff
code. The semantic-meaning of every change is preserved.

### C. GNN-Reinforced Search (V0.5+)

Where V0 search returns the same results every query, V0.5+ RuVector uses a
**Graph Neural Network** layer that learns from query sequences and timing.
When the AI searches for "voice cutoff" and then immediately fetches a
specific observation, RuVector reinforces that path. Over weeks,
`continuum_search` gets measurably better at predicting which observations
the AI will want next — without any model retraining.

**The longer you use Continuum, the smarter its memory becomes.** This is
the moat for the V1+ hosted product.

---

## 7. Three Customers, One Architecture

Continuum is engineered to serve three distinct audiences from the same
engine:

```
Customer 1 — Us (the dogfood)
─────────────────────────────
The VoiceCosmos dev team uses Continuum to solve our own memory time-theft.
Every commit, every session, every state change goes into the engine.
The dev experience IS the customer testimony.

Customer 2 — Solo HITL founders and small teams (V1 OSS release)
─────────────────────────────────────────────────────────────────
Anyone using Claude Code / Cursor / Desktop daily. Self-host the
MCP server. Free, Apache-2.0 licensed. Hosted SaaS tier available
for teams who don't want to run infra.

Customer 3 — VoiceCosmos hotel tenants (V3 ARIA integration)
─────────────────────────────────────────────────────────────
Same engine, tenant-scoped, embedded in ARIA's Voice OS.
The "ARIA that knows the property" is a Continuum instance pointed at
the hotel's Mews / OpenTable / Mindbody data.

The architecture is identical across all three. Only configuration changes.
```

---

## 8. The V0 Build (What Ships Tonight)

```
✅  Repo:                    github.com/number7even/CONTINUUM
✅  License:                  Apache-2.0
✅  Workspace tool:           npm workspaces (D3 — pnpm not installed,
                              migration trivial later)
✅  packages/core             SQLite + FTS5 storage layer
✅  packages/mcp-server       MCP stdio server, 4 tools:
                                continuum_record_checkpoint
                                continuum_get_state
                                continuum_get_digest
                                continuum_search_docs
✅  First product_state[]    Real checkpoint written for vc-hospitality
    written                   (8 active / 2 dormant / 1 broken)
✅  /command/continuum         Project status surface in number7evencrm
    integration               (per-project picker, live state, history)

⏳  V0 polish:                MCP Resources (continuum://...) + Prompts
                              (continuum.session_start / .cite)
⏳  V0 polish:                STATE.md parser → first-checkpoint pipeline
⏳  V0 polish:                Adapters for docs/git/export (V0 wants
                              these three sources at minimum)
```

---

## 9. Why This Matters Beyond Memory

Continuum isn't just a memory tool. It's a **structural answer to a class of
problems that's been hurting AI-assisted development since the field began**:

- **Trust:** Verifiable state means the AI can't bluff. Every claim has a
  `verifyCommand`. Hash chains prevent silent rewrites.
- **Continuity:** The asymmetry between human and AI ("I remember last week;
  you don't") is closed.
- **Composability:** MCP-native. Any AI client gets the same intelligence
  layer. No vendor lock-in.
- **Sovereignty:** Local-first by default. Your project state never leaves
  your machine unless you explicitly enable a sync sink.
- **Self-improving:** GNN-reinforced search, swarm-consensus ingestion,
  causal-ordered deltas. The system gets better every day you use it.

For solo founders, this is the difference between **shipping** and **drowning
in re-explanation**.

For investors, it's a **defensible moat** that compounds with usage.

For the broader community, it's an **open-source primitive** that any HITL
developer can adopt the day V1 lands.

---

## 10. Related Documents

- [`README.md`](../README.md) — elevator pitch, project overview
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — engineering source-of-truth (system design, data flow, MCP spec, decisions)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — contribution guide, commit conventions, decision-lock process
- **Open Issues:**
  - [#1 — DSPy.ts integration proposal](https://github.com/number7even/CONTINUUM/issues/1) (v0.4 candidate)
  - [#2 — Ruflo integration proposal](https://github.com/number7even/CONTINUUM/issues/2) (v1+ candidate)

---

_Documented 2026-05-14. Updates lock-step with `ARCHITECTURE.md` revisions._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
