# Continuum — Architecture Map

> **Status:** v0.3 draft — RuVector unified persistence layer added (phased V0.5)
> **Date:** 2026-05-14
> **Authors:** Riaan Kleynhans + Claude
> **Working name:** Continuum (open — see D1)
> **Repo:** [github.com/number7even/CONTINUUM](https://github.com/number7even/CONTINUUM) (Option A: standalone, locked 2026-05-14)
>
> **v0.3 changelog (this revision):**
> Added **§10b Unified Persistence Layer (RuVector integration)** — replaces SQLite+Chroma split with single self-learning engine. Phased V0.5+.
> Updated **§4 / §4a** — V0 keeps SQLite+Chroma+FTS5 (battle-tested, ships in week 1). V0.5+ supersedes with RuVector path (see §10b).
> Updated **D2** — phased: SQLite+Chroma V0 → RuVector V0.5+ (locked pending RuVector readiness verification).
> Updated **D4** — `ruvllm` joins the digest engine stack as V0.5 option (b).
> Updated **§15 Roadmap** with RuVector phases.
> Updated **§16 Related Documents** with RuVector + ruvllm links.
>
> **v0.2 changelog (previous revision):**
> Added **§10a Neural Capability Layer** — ruv-FANN / ruv-swarm / Neuro-Divergent / midstream integration phased across V0.5 → V2.
> Updated **§5** with future `continuum_spawn_swarm` MCP tool (V1.5).
> Updated **§6** with ruv-FANN WASM-native local digest path (V0.5).
> Updated **§15 Roadmap** with neural-layer phasing.
> Updated **§16 Related Documents** with ruv-FANN, ruv-swarm, midstream, open-claude-code.
> Locked **D4** (digest engine) — phased: template fallback V0 → ruv-FANN local V0.5 → external LLM optional override.
>
> **v0.1 changelog (previous revision):**
> Reverse-engineered 5 verified patterns from `thedotmack/claude-mem` v13.2.0
> (installed at `~/.claude/plugins/marketplaces/thedotmack/`):
> §3 — 5 lifecycle hook listeners replace generic source-change trigger.
> §4 — Hybrid SQLite-FTS5 + Chroma interaction made explicit.
> §5 — Progressive Disclosure (3-layer MCP tools) replaces flat search tools — ~10x token savings.
> §6 — Background Worker Service added as V0 component (Bun/Node HTTP).
> §8 — `<private>` elevated from convention to **core invariant**, enforced at Aggregator.
> §14 — D2 (Chroma) and D7 (claude-mem as adapter) locked.
>
> _The product we're building to solve the AI-collaborator memory problem.
> Dogfooded first for our own VoiceCosmos dev workflow, then shipped as
> a standalone product for any solo founder / small team using AI coding
> assistants. Same architecture eventually powers ARIA's "knows the
> property" memory for hotel tenants._

---

## TL;DR

A persistent intelligence layer between you and any AI coding assistant. An MCP server that aggregates 5 sources of project truth — `/docs` (RAG), memory observations (claude-mem-compatible), feedback signals (SONA-style HITL rewards), git history, AI session transcripts — and produces:

1. **Timestamped `product_state[]` snapshots** — "what was true on May 14?" → verifiable answer.
2. **Auto-generated session-start briefing** — your AI opens with full context, not cold.
3. **Live todo pipeline** — open commitments tracked from discussion → action → verification.

**Killer feature:** the 5-source aggregation IS the moat. Nobody else combines docs + memory + feedback + git + transcripts into checkpointed state.

---

## 1. System Context

```
                  ┌────────────────────────────────────────┐
                  │       CONTINUUM (this product)         │
                  │                                        │
   AI clients ───▶│  MCP server (stdio + HTTP)             │
   (Claude Code,  │     ↑                                  │
    Desktop,      │     │  tools, resources, prompts       │
    Cursor,       │     │                                  │
    Cline,        │  ┌──┴────────────────────────────────┐ │
    ChatGPT)      │  │     CORE                          │ │
                  │  │  - Aggregator                     │ │
                  │  │  - Index + Search                 │ │
                  │  │  - Checkpoint Engine              │ │
                  │  │  - Todo Manager                   │ │
                  │  │  - Digest Generator               │ │
                  │  └──┬────────────────────────────────┘ │
                  │     │                                  │
                  │  ┌──┴────────────────────────────────┐ │
                  │  │  SOURCE ADAPTERS (5)              │ │
   Source ◀───────│──┤  docs · mem · sona · git · export │ │
   systems        │  └───────────────────────────────────┘ │
                  │                                        │
   Operator ─────▶│  CLI · Web UI · Status                 │
                  └────────────────────────────────────────┘
```

**Inputs:** filesystem, Supabase, claude-mem SQLite, git, Claude session JSONL.
**Outputs:** MCP tool responses, checkpoint files, digest markdown, todo state.
**Consumer:** any MCP-aware AI client. **Primary target: Open Claude Code** (and the broader Anthropic CC family). Open Claude Code's first-class MCP support unlocks all 4 transports Continuum exposes:

- **stdio** — local subprocess invocation (V0 default — invoked by AI client per project)
- **SSE (Server-Sent Events)** — streaming responses over HTTP (V1 — Docker self-host)
- **Streamable HTTP** — bidirectional MCP over HTTP (V1 — preferred over SSE where supported)
- **WebSocket** — full-duplex realtime (V1+ — for hosted multi-client scenarios)

By supporting all four, Continuum runs as a local subprocess for solo devs (V0), as a Docker service for small teams (V1), and as a hosted multi-tenant service (V2) — without changing the MCP contract or forcing client migrations.

---

## 2. Component Map

```
                                    Continuum
   ┌─────────────────────────────────────────────────────────────┐
   │                                                             │
   │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
   │   │   MCP        │   │     CLI      │   │   Web UI     │    │
   │   │   Server     │   │              │   │  (optional)  │    │
   │   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘    │
   │          │                  │                  │            │
   │          └──────────────────┴──────────────────┘            │
   │                             │                               │
   │                             ▼                               │
   │   ┌─────────────────────────────────────────────────────┐   │
   │   │                   CORE ENGINE                       │   │
   │   │                                                     │   │
   │   │  Aggregator → Indexer → State → Checkpoints → Todo  │   │
   │   │                                       │             │   │
   │   │  Digest Generator (LLM-assisted) ─────┘             │   │
   │   └─────────────────────────────────────────────────────┘   │
   │                             │                               │
   │                             ▼                               │
   │   ┌─────────────────────────────────────────────────────┐   │
   │   │              SOURCE ADAPTERS (pluggable)            │   │
   │   │                                                     │   │
   │   │  docs    mem    sona    git    export    (slack?)   │   │
   │   │  RAG     mem-   HITL    log    *.jsonl   (linear?)  │   │
   │   │          search reward                              │   │
   │   └─────────────────────────────────────────────────────┘   │
   │                             │                               │
   │                             ▼                               │
   │   ┌─────────────────────────────────────────────────────┐   │
   │   │              PERSISTENCE LAYER                      │   │
   │   │                                                     │   │
   │   │   SQLite (state, todos, sessions)                   │   │
   │   │   Chroma (vector index for semantic search)         │   │
   │   │   /checkpoints/*.json (immutable state snapshots)   │   │
   │   └─────────────────────────────────────────────────────┘   │
   └─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

Continuum's ingest path is **hook-driven**, not poll-driven. We mirror
`claude-mem`'s 5-lifecycle-hook architecture so every AI-client event becomes
an opportunity to capture, correlate, or checkpoint. Each hook is also exposed
to external source adapters (git, docs watcher, SONA webhook) via the same
internal event bus.

**The 5 lifecycle hooks (Continuum + AI client wiring):**

```
SessionStart       → Worker boots (if not running)
                     → Aggregator loads recent context window
                     → MCP server emits session-start briefing
                       (current StateSnapshot + latest Digest + open Todos)

UserPromptSubmit   → Aggregator records prompt as Observation
                     → Adapters pre-warm: relevant /docs chunks for prompt topic
                     → Optional: claude-mem-style context injection

PostToolUse        → Tool output captured as Observation (type-tagged)
                     → Indexer writes SQLite + Chroma
                     → Todo Manager checks: did this resolve an open commitment?
                     → If verify_command on a Todo matched and passed → mark done

Stop               → Mid-session state capture (lightweight)
                     → No checkpoint write (avoid noise)

SessionEnd         → Checkpoint Engine writes immutable product_state[]
                     → Digest Generator composes session digest
                     → Todo Manager reconciles open commitments vs new commits
                     → Worker flushes write buffers
```

**External source adapters bridge to the same hooks:**

```
git commit (post-commit hook)        → emits PostToolUse-equivalent
docs/ file change (chokidar watcher) → emits UserPromptSubmit-equivalent
sona_events insert (Supabase webhook) → emits PostToolUse-equivalent
session.jsonl tail follow            → emits PostToolUse-equivalent per turn
claude-mem observation write          → forwarded directly (we consume their hook)
```

**Query path (session-start + on-demand):**

```
AI client calls MCP tool (continuum_search, continuum_get_state, etc.)
   ↓
MCP server routes to Worker over HTTP (or in-process for stdio mode)
   ↓
Worker queries SQLite (FTS5) + Chroma (vector) — see §4 for fusion
   ↓
Optional: Digest Generator composes narrative (LLM-assisted if configured)
   ↓
Returns structured result to AI client (Progressive Disclosure — see §5)
```

---

## 4. Data Model

**Five core entities:**

```
Source         { id, type: docs|mem|sona|git|export, config, last_synced_at }

Observation    { id, source_id, type, content, embedding,
                 timestamp, refs[] }

StateSnapshot  { id, timestamp, active[], dormant[], broken[], hash }

Todo           { id, title, status: open|blocked|in_progress|done,
                 refs[], created_at, completed_at,
                 verify_command?, blocked_by[] }

Digest         { id, window_start, window_end, narrative,
                 commits[], state_diff, todo_delta }
```

**Key invariants:**

- Every `Observation` has a `source_id` + `timestamp` (immutable).
- `StateSnapshots` are append-only (you can query history — "what was true on May 14?").
- `Todos` reference `Observations` (provenance — "where did this commitment come from?").
- `Digests` are regeneratable from sources (not the source-of-truth themselves — sources are).
- **Hybrid index: every Observation is written to BOTH SQLite-FTS5 AND Chroma.** Never just one.
- **Privacy invariant** (`<private>` enforcement) is enforced at the Aggregator BEFORE indexing — see §8.

---

### 4a. Hybrid Search: SQLite-FTS5 + Chroma (verified pattern from claude-mem)

The Indexer is **simultaneously dual-write** — every accepted Observation lands
in both stores. The two stores serve complementary failure modes of pure
keyword vs pure semantic search.

```
                            ┌───────────────────────────────┐
                            │  Aggregator (privacy-scrubbed) │
                            └───────────────┬───────────────┘
                                            │
                              ┌─────────────┴─────────────┐
                              ▼                           ▼
                  ┌───────────────────────┐   ┌───────────────────────┐
                  │   SQLite + FTS5       │   │  Chroma (vector DB)   │
                  │                       │   │                       │
                  │  Tables: observations,│   │  Embeddings: per-      │
                  │   sources, todos,     │   │   observation chunk    │
                  │   snapshots, digests  │   │                       │
                  │                       │   │  Distance: cosine     │
                  │  FTS5 virtual table   │   │                       │
                  │   on observation.text │   │  Indexer: HNSW        │
                  │   for exact /         │   │                       │
                  │   keyword / code-     │   │  Use case: fuzzy      │
                  │   snippet matching    │   │   semantic intent     │
                  │   (high precision)    │   │   (high recall)       │
                  └──────────┬────────────┘   └──────────┬────────────┘
                             │                           │
                             └─────────────┬─────────────┘
                                           ▼
                            ┌───────────────────────────┐
                            │  Rank Fusion              │
                            │  (Reciprocal Rank Fusion) │
                            │  on continuum_search()    │
                            └───────────────────────────┘
```

**Read path:**

`continuum_search(query)` runs **both** stores in parallel, merges results via
RRF (Reciprocal Rank Fusion), and returns the unified compact index. Callers
fetch full content selectively via `continuum_get_observations(ids[])` — see §5.

**Why both, not one:**

- **FTS5 alone** misses paraphrase ("error handling" should find "exception").
- **Chroma alone** misses precise code snippets, hashes, file paths, error codes.
- **Together** = recall + precision. Mirrors claude-mem's verified approach.

---

## 5. MCP Interface — Progressive Disclosure (3-layer pattern)

Naive flat retrieval (`search_docs(...) → Observation[]` with full text) blows
the context window. claude-mem's verified solution is a **3-layer workflow**
that filters by IDs before fetching content, yielding ~10x token savings.
Continuum adopts the same pattern across all 5 aggregated sources.

### Layer 1 — Search (compact index, ~50–100 tokens/result)

```
continuum_search({
  query: string,
  source?: 'docs'|'mem'|'sona'|'git'|'export'|undefined,  // omit = all
  type?: string,                                          // e.g. 'commit', 'file_edit', 'pain_signal'
  before?: timestamp,
  after?: timestamp,
  limit?: int = 20
})
→ SearchHit[]
  where SearchHit = {
    id: string,           // canonical Observation id
    source: string,       // which adapter produced it
    type: string,
    timestamp: ISO8601,
    title: string,        // 1-line summary (~60 chars)
    score: number,        // RRF score from FTS5 + Chroma fusion
    has_more: boolean     // true if get_observations would return >2KB
  }
```

### Layer 2 — Timeline (chronological context around interesting hits)

```
continuum_timeline({
  anchor: string | { query: string },   // ID or fresh query
  window: '1h'|'24h'|'7d'|'session' = '24h',
  source?: string,
  limit?: int = 50
})
→ TimelineEntry[]
  where TimelineEntry = SearchHit & { context_before: string[], context_after: string[] }
```

Lets the AI see "what was happening AROUND this observation" without fetching
every full record. Useful for understanding causality
("this commit broke X — what was the conversation right before?").

### Layer 3 — Full fetch (only the IDs the AI explicitly requests)

```
continuum_get_observations({
  ids: string[],          // BATCH multiple IDs — never call this one-at-a-time
  format?: 'raw'|'rendered'|'with_refs' = 'rendered'
})
→ Observation[]
  where Observation = {
    id, source, type, timestamp, refs[],
    content: string,      // FULL text — only fetched on demand
    metadata: Record<string, unknown>
  }
```

**Token cost discipline:**

- Layer 1 search: ~1–2 KB per 20 results (just the index)
- Layer 2 timeline: ~5–10 KB per 50 results (titles + neighbors)
- Layer 3 fetch: ~500–2000 tokens per observation (full content)

The AI is expected to filter aggressively before reaching Layer 3.
Documentation + prompts (see below) reinforce this workflow.

### Stateful tools (not observation-shaped — return directly)

These remain compact by definition. No progressive disclosure needed.

```
continuum_get_state(at?: ISO8601)               → StateSnapshot
continuum_get_digest(window?: '24h'|'7d'|...)   → Digest
continuum_get_todos(status?, refs?)             → Todo[]            // already small
continuum_create_todo({...})                    → Todo
continuum_update_todo({id, ...})                → Todo
continuum_record_checkpoint(reason: string)     → StateSnapshot
```

### Resources (MCP)

- `continuum://state/current` — current StateSnapshot as markdown
- `continuum://digest/latest` — latest digest
- `continuum://todos/open` — open todos
- `continuum://session/briefing` — pre-rendered "what's happening" for session start

### Prompts (MCP)

- `continuum.session_start` — pre-built prompt: "Read `continuum://session/briefing` first, then use `continuum_search` (filter by IDs) before `continuum_get_observations` (fetch content)."
- `continuum.cite` — given an Observation ID, return canonical citation block for inclusion in chat.

---

## 6. Deployment

Continuum requires a **persistent background process** for asynchronous work
(source polling, embedding generation, checkpoint scheduling, LLM-assisted
digest composition). Following claude-mem's verified pattern, the Worker
Service is a first-class V0 component — not optional, not deferred to V1.

```
┌────────────────────────────────────────────────────────────────────┐
│  V0 (this week): Local CLI + Background Worker                     │
│                                                                    │
│     ┌──────────────────────────────┐                               │
│     │  AI client (Claude Code,     │                               │
│     │  Desktop, Cursor)            │                               │
│     └──────────┬───────────────────┘                               │
│                │ stdio (MCP transport)                             │
│                ▼                                                   │
│     ┌──────────────────────────────┐                               │
│     │  MCP stdio adapter           │  thin — routes calls to       │
│     │  (`continuum mcp` cmd)       │  the Worker over HTTP         │
│     └──────────┬───────────────────┘                               │
│                │ HTTP                                              │
│                ▼                                                   │
│     ┌──────────────────────────────┐                               │
│     │  Worker Service              │  ← managed by Bun (preferred) │
│     │  on http://localhost:37778   │     or Node fallback          │
│     │                              │                               │
│     │  • Source polling loop       │                               │
│     │  • Indexer (FTS5 + Chroma)   │                               │
│     │  • Checkpoint scheduler      │                               │
│     │  • Digest generator (LLM)    │                               │
│     │  • Todo state machine        │                               │
│     │  • Static web viewer UI      │                               │
│     │  • 10+ HTTP search endpoints │                               │
│     └──────────┬───────────────────┘                               │
│                │                                                   │
│                ▼                                                   │
│     SQLite + Chroma + /checkpoints  (under ~/.continuum/{project}) │
│                                                                    │
│  Port: 37778 (deliberate +1 offset from claude-mem's 37777 to      │
│              avoid collision when both run side-by-side)           │
│                                                                    │
│  CLI:                                                              │
│     `continuum init`         → scaffold ~/.continuum/{project}/    │
│     `continuum start`        → boot Worker (background daemon)     │
│     `continuum stop`         → stop Worker                         │
│     `continuum status`       → health + counts                     │
│     `continuum mcp`          → start MCP stdio adapter             │
│                                  (invoked by AI client config)     │
│     `continuum checkpoint    → manual snapshot trigger             │
│        <reason>`                                                   │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  V1 (week 2-3): Docker self-host                                   │
│     • Single container — Worker exposed over HTTP + WebSocket      │
│     • Persistent volumes for SQLite + Chroma                       │
│     • MCP stdio adapter still client-side (connects to remote      │
│       worker)                                                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  V2 (month 2): Hosted SaaS                                         │
│     • Multi-tenant Worker fleet                                    │
│     • OAuth, billing, team workspaces                              │
│     • Cross-device sync (workspace_id-scoped)                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  V1.5 (parallel to Docker): OpenClaw Gateway distribution          │
│                                                                    │
│     Single-command installer (mirrors claude-mem's pattern):       │
│                                                                    │
│       curl -fsSL https://install.continuum.dev/openclaw.sh | bash  │
│                                                                    │
│     Installs Worker + MCP adapter as a persistent plugin on        │
│     OpenClaw AI gateways alongside any other tools (claude-mem,    │
│     custom MCP servers, etc.).                                     │
│                                                                    │
│     This accelerates adoption among AI-assisted developers who     │
│     already run gateway infrastructure — Continuum becomes the     │
│     "persistent state" plugin alongside claude-mem's "persistent   │
│     memory" plugin (complementary, not competing — see D7).        │
└────────────────────────────────────────────────────────────────────┘
```

**Why Worker + thin MCP adapter (not pure stdio MCP):**

1. **Async work survives session boundaries.** Embedding a 3000-doc /docs
   tree can take 5+ minutes. We can't block the AI client's stdio.
2. **Multiple clients can share the same Worker.** Claude Desktop + Claude
   Code + Cursor on the same machine all see the same state.
3. **Web viewer UI** for human inspection (status, manual checkpoint, recent
   observations) lives alongside the API without a second process.
4. **Matches claude-mem's verified runtime model** — proven to handle this
   load profile.

---

## 7. Extension Points

### Source adapter SDK

`interface SourceAdapter { sync(), search(), listen() }`. Anyone can add Slack, Linear, Jira, Notion, Figma, etc. New adapters require zero changes to Core — they bind to the same hook bus from §3.

### Sink adapter SDK

`interface Sink { onCheckpoint(), onDigest(), onTodoChange() }`. Notify Slack, email digest, post to discord, push to GitHub Issues, etc.

### LLM provider abstraction

Digest generation pluggable: OpenAI, Anthropic, local Ollama, or template-only fallback (no LLM required for V0).

### Embedding provider abstraction

Chroma's default vs. OpenAI vs. local. Default in V0: Chroma's built-in.

### Open Claude Code execution synergy — Todo Pipeline ↔ Built-in Tools

Continuum **flags state**. Open Claude Code **resolves it** with its 25+ built-in tools. The two systems compose:

| Continuum surfaces… | Open Claude Code resolves with… |
|---|---|
| Open todo with `verify_command` | `Bash` — runs the verify command |
| Open todo "edit X to Y" | `Edit` / `MultiEdit` — applies the change |
| Open todo "build/refactor feature" | `Task` (sub-agent) — delegates with full Continuum context |
| Open todo "review branch X" | `EnterWorktree` — isolated review env |
| Drift between STATE.md and code | `Read` + `Grep` — verify the entry's `verify_command` |
| New observation from `PostToolUse` | `TodoWrite` — Open Claude Code captures the next step in its own queue |

This is **not** Continuum spawning Claude Code. It's Continuum providing the **CONTEXT** Open Claude Code needs to use its tools effectively. The boundary is clean: Continuum knows what's true; Open Claude Code knows what to do.

---

## 8. Security / Privacy

### Privacy is a core invariant, not a convention

The `<private>...</private>` tag (and configurable additional patterns) is a
**Continuum invariant enforced at the Aggregator**, BEFORE content reaches
the Indexer. This is elevated from claude-mem's "convention" status because
Continuum aggregates 5 sources — any one of which could contain secrets,
PII, or sensitive ops data. A single leak point is unacceptable.

**Enforcement rule:**

```
Every Observation accepted by the Aggregator passes through PrivacyFilter
BEFORE any indexing or storage occurs.

PrivacyFilter.scan(content):
  1. Strip any <private>...</private> block content (keep markers as
     [PRIVATE_REDACTED] for audit).
  2. Apply configured regex patterns (e.g. /sk-[a-zA-Z0-9]{20,}/,
     /API_KEY\s*=/, /BEGIN PRIVATE KEY/).
  3. If >50% of an Observation's content is private (heuristic),
     DROP the entire Observation rather than store partial.
  4. Emit a redaction Audit entry: {observation_id_would_be, source,
     reason, byte_count_redacted, timestamp}.
```

This applies to **all 5 sources** — including:

- `/docs` markdown (someone might paste a key into a doc)
- `claude-mem` observations (forwarded — we honor the tag)
- `sona_events` rows (corrected feedback may contain customer PII)
- **git commit messages** (people accidentally commit secrets to messages too)
- **session transcripts** (Claude conversations may include credentials)

### Other privacy + security guarantees

- **Local-first by default.** Nothing leaves your machine unless you explicitly enable a sync sink (V1+).
- **Encryption at rest:** SQLite + Chroma optionally encrypted (libSQL with encryption support).
- **Tenant isolation (V2+ SaaS):** Postgres row-level security per `workspace_id`, enforced at every table.
- **No telemetry by default** — opt-in for usage analytics.
- **Configurable redaction rules** (`~/.continuum/privacy.json`) — operators add their own patterns (e.g. internal customer ID formats).
- **Audit log for redactions** queryable via `continuum_search({type: 'audit'})` — operators can see WHAT was dropped and WHY, without seeing the redacted content itself.

---

## 9. Multi-Tenant Model

```
V0/V1 (local):   single user, per-project SQLite in
                 ~/.continuum/{project_id}/

V2 (hosted):     workspace_id at every table level, RLS enforced
                 user → workspace M:N, role-based (owner/admin/viewer)
```

**For VoiceCosmos integration:** each hotel tenant gets a Continuum instance whose `workspace_id` = `tenant_id`. The MCP server they consume is scoped to their data.

---

## 10. Observability

- `GET /health` — liveness
- `GET /stats` — counts (observations, todos, snapshots) per source
- **Audit log** — every checkpoint + todo transition recorded with cause
- Structured logs to stdout/file

---

## 10a. Neural Capability Layer (ruv-FANN integration)

Continuum's V0 ships as a passive memory + state aggregator. Beginning V0.5, the
[**ruv-FANN**](https://github.com/ruvnet/ruv-FANN) neural framework (WASM-native, CPU-only, MCP-first) is embedded into the Worker
as a **Neural Capability Layer**. This transforms Continuum from passive state-tracker
into an active, autonomous problem-solving engine — without any change to the
MCP contract or the 5-source aggregation model.

**Why ruv-FANN, not external LLMs:**

- **WASM-native** — embeds directly into Continuum's Node/TypeScript Worker, no separate process.
- **CPU-only** — no GPU required, runs on any developer machine.
- **<100ms decisions** — fast enough for synchronous MCP tool responses.
- **Zero API cost** — no OpenAI/Anthropic round-trip per digest or todo evaluation.
- **MCP-first** — Continuum exposes ruv-FANN capabilities as MCP tools to the AI client.

### Phased integration

```
V0    (current)  → no neural layer; template-based digest fallback only
V0.5  (week 2-3) → ruv-FANN embedded for local digest generation
V1    (month 1)  → ruv-swarm for ephemeral per-adapter source aggregation
V1.5  (month 2)  → continuum_spawn_swarm MCP tool (autonomous todo execution)
V2    (month 3)  → Neuro-Divergent forecasting models for predictive snapshots
```

### V0.5 — Local digest generation (replaces optional LLM call)

The Digest Generator currently has an "optional LLM provider abstraction" (§7).
V0.5 makes ruv-FANN the **primary local path**, with external LLMs as opt-in override:

```
Digest Generator
   ├─ Template fallback (V0, no LLM)             — always available
   ├─ ruv-FANN local (V0.5+)                     — default, zero-cost, <100ms
   └─ External LLM (optional override)           — OpenAI/Anthropic when richer narrative needed
```

### V1 — Swarm-based source aggregation

Continuum's Aggregator (§2, §3) currently runs source adapters in the Worker
process. V1 introduces **ephemeral ruv-swarm agents** — one per adapter — that
ingest and normalize concurrently, resolve conflicts via swarm consensus, and
dissolve once their batch is committed to SQLite/Chroma.

```
                            ┌─────────────────────────┐
                            │   Continuum Aggregator   │
                            └──────────┬──────────────┘
                                       │ spawn ephemeral swarm
                ┌──────────┬───────────┼───────────┬──────────┐
                ▼          ▼           ▼           ▼          ▼
            docs       mem agent     sona       git agent   export
            agent      (mesh)        agent      (ring)      agent
            (mesh)                   (ring)                 (hierarchical)
                │          │           │           │          │
                └──────────┴───────────┴───────────┴──────────┘
                                       │ swarm-consensus normalize
                                       ▼
                            ┌─────────────────────────┐
                            │  Single Observation     │
                            │  stream (canonical)     │
                            └──────────┬──────────────┘
                                       ▼
                                  Indexer (FTS5 + Chroma)
                                       │
                                       ▼
                                 Swarm dissolves
```

**Topology per adapter** (cognitive pattern fit):

- **docs** (mesh) — peer chunks coordinate around shared concept clusters
- **mem** (mesh) — peer observations cross-reference
- **sona** (ring) — temporal feedback signals require chronological coherence
- **git** (ring) — commits inherently chronological
- **export** (hierarchical) — session transcripts have nested turn structure

### V1.5 — `continuum_spawn_swarm` MCP tool

A new MCP tool exposes ephemeral swarm spawning to the AI client (Open Claude Code, etc.):

```
continuum_spawn_swarm({
  task: string,                                 // natural language description
  topology?: 'mesh'|'ring'|'hierarchical'|'star',
  max_agents?: int = 5,
  cognitive_pattern?: 'convergent'|'divergent'|'lateral',
  verify_command?: string,                      // if provided, swarm must satisfy before declaring done
  lifecycle: 'ephemeral'                        // always — dissolves after success or timeout
})
→ SwarmResult = {
    swarm_id: string,
    status: 'succeeded' | 'failed' | 'timed_out',
    artifacts: Observation[],                    // anything the swarm produced (commits, files, tests)
    verify_passed: boolean,
    runtime_ms: number,
    agents_spawned: int
  }
```

**Use case:** an open Todo with `verify_command` set. Open Claude Code invokes
`continuum_spawn_swarm` with the todo as task and its verify_command — the
ephemeral swarm attempts the work, the verify_command is run, and the swarm
dissolves regardless of outcome (artifacts persist as Observations either way).

This is the **autonomous Todo resolution path** — distinct from human/AI manual
resolution. Operator/Riaan retains HITL approval over swarm-produced commits.

### V2 — Neuro-Divergent predictive snapshots

[**Neuro-Divergent**](https://github.com/ruvnet/ruv-FANN/tree/main/neuro-divergent) (subproject of ruv-FANN) provides 27+ neural forecasting models. Continuum's
StateSnapshot model gains a `forecast` field:

```
StateSnapshot {
  // ... existing fields ...
  forecast?: {
    timeline_slip_probability: number,       // 0..1 — likelihood of missing next milestone
    components_likely_to_break: string[],    // by file/module
    todos_likely_to_unblock: string[],       // by todo id
    confidence: number,                       // 0..1
    model: string,                            // which Neuro-Divergent model produced this
    generated_at: ISO8601
  }
}
```

**Input signals:** git commit velocity, todo completion rate, observation
type distribution over time, claude-mem session frequency, SONA feedback
sentiment trends. Architectural symmetry with VoiceCosmos's ARIA approach
to predictive guest engagement (same forecast primitives, different domain).

### V1+ — midstream for streaming transport

[**midstream**](https://github.com/ruvnet/midstream) (sibling project) provides real-time streaming primitives that
fit Continuum's V1+ HTTP/SSE/WebSocket transport (§6). When the worker handles
multi-client subscriptions (Claude Desktop + Code + Cursor all watching the
same workspace), midstream's pub/sub layer brokers state-change broadcasts
without each client polling.

### Hard separations

To avoid scope creep into V0:

- **No ruv-FANN dependency in V0 packages.** Worker stays pure-TS until V0.5.
- **All neural-layer code lives behind feature flags.** Operators can disable
  the entire layer with `CONTINUUM_NEURAL=disabled` and Continuum runs the
  V0 path indefinitely.
- **Verify-then-dissolve discipline** for every swarm spawn — no long-lived
  agents in V1.5 by design.

---

## 10b. Unified Persistence Layer (RuVector integration — V0.5+)

V0 uses SQLite + Chroma + FTS5 (§4 / §4a) — battle-tested, ships in week 1.
Beginning **V0.5**, the persistence layer migrates to [**RuVector**](https://github.com/ruvnet/RuVector) — a unified
vector/graph/relational engine designed for AI-native workloads. This is not
an additive layer; it **replaces** the SQLite + Chroma split, simplifying
Continuum's storage from "two engines + custom diff logic" to "one engine with
native semantics for everything we need."

### Why migrate from SQLite + Chroma to RuVector at V0.5

| Capability | V0 (SQLite + Chroma) | V0.5+ (RuVector) |
|---|---|---|
| **Vector search** | Chroma | Native, embedded |
| **Keyword search** | SQLite FTS5 | Native, unified with vector |
| **Relational queries** | SQLite | Native |
| **Graph queries** (e.g., observation refs[]) | Manual joins | Native, GNN-indexed |
| **Self-learning relevance** | None — same results every time | **GNN reinforces search paths from query patterns** |
| **State snapshots** | Manual JSON serialization | **RVF cognitive containers — Git-like COW branching** |
| **Snapshot size (1M vectors + 100 edits)** | ~hundreds of MB | **~2.5 MB** |
| **Tamper resistance** | None | **Cryptographic witness chain** |
| **state_diff / todo_delta** | Custom comparison logic | **Native Delta Behavior module (CRDTs + causal ordering)** |
| **Multi-tenant (V2)** | Migrate to Postgres + RLS | **Native multi-tenant "collections"** |
| **Scale path** | Postgres rewrite | **Raft consensus, multi-master replication, auto-sharding** |

### The five integration vectors (mapped to Continuum's §3, §4, §5 surface)

```
                    ┌─────────────────────────────────┐
                    │      Continuum Aggregator        │
                    │  (privacy-scrubbed Observations) │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │            RuVector              │
                    │  ┌───────────────────────────┐  │
                    │  │  Vector + Graph + KV +    │  │
                    │  │  Relational (one engine)  │  │
                    │  │                           │  │
                    │  │  + GNN learns from        │  │
                    │  │    query sequences        │  │
                    │  │  + RVF COW snapshots      │  │
                    │  │  + Delta Behavior CRDTs   │  │
                    │  │  + ruvllm local AI        │  │
                    │  │  + multi-tenant native    │  │
                    │  └───────────────────────────┘  │
                    └─────────────────────────────────┘
                                     ▲
                                     │ unified read/write
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
       continuum_search       continuum_get_state    continuum_record_
       (GNN-reinforced)       (RVF snapshot fetch)   checkpoint
                                                     (RVF COW branch)
```

### 1. Unified self-learning persistence (replaces §4a hybrid)

Where V0 dual-writes every Observation to SQLite-FTS5 AND Chroma, V0.5+ writes
once to RuVector. The GNN ("Graph Neural Network") layer learns from **query
sequences and timing** — when an AI client searches for "voice cutoff" then
immediately fetches a specific observation, RuVector reinforces that path.
Over weeks, `continuum_search` gets measurably better at predicting which
observations the AI will want next — without any model retraining.

**Net effect:** the longer you use Continuum, the smarter its memory becomes.
This is the core defensible moat for the V1+ hosted product.

### 2. RVF cognitive containers as native snapshots

`continuum_record_checkpoint` currently (V0 plan) serializes a JSON state file.
At V0.5+ it instead creates an **RVF branch** — Git-like copy-on-write of the
entire database state. Querying `continuum_get_state(at: '2026-05-14')` becomes
a cheap branch checkout, not a JSON parse.

**Size profile** (verified RuVector benchmark): ~2.5 MB per snapshot of a 1M-vector
+ 100-edit corpus. Means we can keep **hundreds** of historical snapshots in the
single-user case without storage pressure.

**Tamper-evident witness chain** — every snapshot is cryptographically linked to
its parent. State history cannot be silently rewritten (closes a category of
attacks/mistakes that pure-filesystem-snapshot approaches leave open).

### 3. `ruvllm` local AI runtime (joins §10a digest options)

RuVector ships with **ruvllm** — an embedded GGUF model runtime supporting
Metal (Apple Silicon), CUDA (NVIDIA), and WebGPU (cross-platform). This means
the Digest Generator (§5, §10a) can:

- Run a local GGUF model (~3-7B parameters) for narrative digest composition
- Achieve <500ms digest generation on M-series Macs
- Zero API cost, zero data egress

**Updated digest stack** (D4):

```
V0    — template fallback only (no LLM)
V0.5+ — three options, operator picks (or feature-flags):
        a) ruvllm (RuVector built-in, GGUF model, Metal/CUDA/WebGPU)
        b) ruv-FANN (§10a, pure WASM, lighter weight)
        c) External LLM (OpenAI/Anthropic, opt-in override)
```

### 4. Native Delta Behavior (replaces custom diff logic)

Continuum's Digest model (§4) requires `state_diff` and `todo_delta` fields.
V0 plan: write custom comparison logic per entity type. V0.5+ with RuVector:
the Delta Behavior module emits structured deltas natively, using **CRDTs and
causal ordering** to merge concurrent writes safely.

**Operator-visible benefit:** when two AI clients (Claude Code + Cursor) modify
state in parallel during the same window, the digest still shows a coherent
narrative — not a "race condition" mess.

### 5. Multi-tenant native (closes V2 deployment gap)

§6's V2 (Hosted SaaS) plan requires a separate persistence rewrite to support
multi-tenant + auth + cross-device sync. **RuVector's native multi-tenant
collections** mean the V2 migration is config, not code:

```
V0.5 local:   one RuVector instance per project at ~/.continuum/{project}/
V2 hosted:    one RuVector cluster, each tenant = one collection
                + Raft consensus
                + multi-master replication
                + auto-sharding
```

**Same engine, same query layer, same MCP tools.** No rewrite. This is the
single largest derisk for the Continuum SaaS business model.

### Phasing & verification gate before V0.5

Before V0.5 builds on RuVector:

- [ ] Verify RuVector v1.0+ release maturity (production-readiness)
- [ ] Verify Node.js/TypeScript SDK ergonomics (we don't want to FFI from TS into Rust if it's painful)
- [ ] Verify embedded WASM build size + cold-start time
- [ ] Benchmark vs the V0 SQLite-FTS5 + Chroma baseline on real /docs corpus
- [ ] Confirm migration tool: V0 state → RuVector ingestion

If any gate fails, V0.5 stays on the V0 path and migration deferred to V1.

### Hard separation from V0

- **No RuVector dependency in V0 packages.** `packages/core` stays pure-TS with
  better-sqlite3 + chromadb until V0.5 gate passes.
- **Storage adapter pattern in V0:** the Indexer talks to an abstract
  `StorageBackend` interface from day one. V0 implementation = SQLite+Chroma.
  V0.5 swap-in = RuVector. Same interface, different backend.
- **Migration is reversible:** RuVector → SQLite+Chroma export tool ships
  alongside the migration tool, so we never get locked in by storage choice.

---

## 11. Repo Structure (standalone — locked: Option A)

```
voicecosmos/continuum/
├── README.md
├── ARCHITECTURE.md          ← this doc (lives at root of new repo)
├── packages/
│   ├── core/                ← Aggregator, Indexer, State, Checkpoints, Todos
│   ├── mcp-server/          ← MCP stdio + HTTP server
│   ├── cli/                 ← `continuum init/start/status/checkpoint`
│   ├── adapters/
│   │   ├── docs/
│   │   ├── claude-mem/
│   │   ├── sona/
│   │   ├── git/
│   │   └── export/
│   └── web-ui/              ← (optional, V1)
├── docs/                    ← user-facing docs
├── examples/                ← integration examples
└── tests/
```

Monorepo with pnpm workspaces. TypeScript end-to-end. SQLite via `better-sqlite3`. Chroma via `chromadb-default-embed`.

---

## 12. V0 Scope (dogfood — minimum that solves OUR problem first)

The first thing built must let Claude (this assistant) open tomorrow's session with full context of today. Everything else is later.

- [ ] Repo skeleton at `voicecosmos/continuum` (org-level repo)
- [ ] `core` package — data model + SQLite migrations + checkpoint engine
- [ ] `adapters/git` + `adapters/docs` + `adapters/export` (the easy 3 sources)
- [ ] `mcp-server` — 4 tools: `get_state`, `get_digest`, `search_docs`, `record_checkpoint`
- [ ] `cli` — `continuum init` + `continuum start`
- [ ] Register with this VC-Hospitality project's `.mcp.json` (or `~/.claude.json`)
- [ ] First `product_state[2026-05-14T...]` checkpoint written and queryable

**Defer to V1:** `claude-mem` adapter, `sona` adapter, todo manager, web UI, LLM-summarized digests.

---

## 13. Three Customers, One Architecture

```
Customer #1: Us (tonight)
  → Dogfood — kills Riaan's 4-month memory time-theft.
  → Proof point: Claude opens tomorrow's session with full context.

Customer #2: AI-assisted builders (1-3 months)
  → Open-source MCP server (free, self-host).
  → Hosted SaaS tier for teams.
  → ICP: solo founders, small startups, consultants using Claude Code /
    Cursor / Desktop daily.

Customer #3: VoiceCosmos hotel tenants (already in roadmap)
  → Same engine, tenant-scoped, embedded in ARIA.
  → The Voice OS that "knows the property" is a Continuum instance
    pointed at the hotel's data (Mews, OpenTable, Mindbody, etc.).
  → Closes the dogfood loop: same architecture sells to ARIA
    customers as solves the dev problem.
```

**The dogfood IS the demo.** When Claude can ship VoiceCosmos with Riaan because Continuum works for the dev side, that's the customer testimony. Dev experience = product proof.

---

## 14. Open Decisions

Locked tonight or before code begins.

| # | Decision | Options | Lean | Locked |
|---|---|---|---|---|
| **D0** | Repo strategy | Standalone / inside VC / inside engine | **Standalone** | ✅ Locked 2026-05-14 |
| **D1** | Working name | Continuum / Anchor / Recall / Through / Memex / other | Continuum | pending |
| **D2** | Persistence engine | SQLite+Chroma / pgvector / RuVector / other | phased — see §10b | ✅ Locked 2026-05-14 — **Phased: V0 SQLite-FTS5 + Chroma (battle-tested, ships week 1) → V0.5+ RuVector (unified vector/graph/relational, GNN-reinforced search, RVF COW snapshots, native multi-tenant). Storage adapter pattern keeps V0 and V0.5 swappable.** Migration gate: RuVector v1.0+ maturity, Node SDK ergonomics, embedded build size, benchmark vs V0 baseline. |
| **D3** | Monorepo tool | pnpm workspaces / turborepo / nx | pnpm (smallest) | ⚠️ Decided: **npm workspaces** for V0 (pnpm not installed; migration trivial). Locked 2026-05-14 |
| **D4** | Digest generation engine | external LLM / ruv-FANN / ruvllm / template | phased — see §10a + §10b | ✅ Locked 2026-05-14 — **Phased: V0 template fallback → V0.5+ operator picks among (a) ruvllm (RuVector built-in, GGUF Metal/CUDA/WebGPU, §10b), (b) ruv-FANN (pure WASM, lighter, §10a), (c) external LLM optional override**. No external API dependency in default config. |
| **D5** | License | MIT / Apache-2.0 / dual | Apache-2.0 (matches claude-mem) | ✅ Locked 2026-05-14 — Apache-2.0. Easy to embed in MCP servers, agent harnesses, enterprise stacks. Matches claude-mem. |
| **D6** | GitHub org | own org / under VoiceCosmos / personal | own org for OSS clarity | ✅ Locked 2026-05-14 — `number7even` (matches existing VC-Hospitality, VC-Spa, VC-Restaurants, number7evencrm). Repo: github.com/number7even/CONTINUUM |
| **D7** | claude-mem relationship | adapter (we consume) / fork / competitor | adapter — orchestrate, don't reinvent | ✅ Locked 2026-05-14 (verified install at `~/.claude/plugins/marketplaces/thedotmack/` — proven runtime model adopted in §3, §4a, §5, §6, §8) |
| **D8** | First checkpoint trigger | git commit / session end / both | both | ✅ Locked 2026-05-14 — **both**. SessionEnd hook (§3) writes auto-checkpoints; `git post-commit` hook writes mid-session checkpoints. Manual `continuum_record_checkpoint` always available. |

---

## 15. Roadmap & Phased Execution Plan (post-V0)

### 15a. Version roadmap

- **V0** (shipped 2026-05-14): dogfood-ready, **7 MCP tools + 1 Resource**, 1 source adapter (`export`), local-only, **SQLite + FTS5 storage** (Chroma deferred to V0.5 — V0 ships keyword-only), no neural layer. **StorageBackend abstraction shipped** (commit `e725ae7`) — V0.5 RuVector is a single-line factory swap.
- **V0 polish** (in progress 2026-05-20+): 3 additional Resources (`continuum://state/current`, `continuum://digest/latest`, `continuum://session/briefing`), 2 Prompts (`continuum.session_start`, `continuum.cite`), `agent_handoff` observation kind (V0-compatible intent capture, see Issue #3), `docs` + `git` adapters, STATE.md → first-checkpoint parser, CLI (`npx continuum init/start/status`).
- **V0.5** (week 2–3): `claude-mem` + `sona` adapters, **ruv-FANN OR ruvllm for local digest** (§10a + §10b), **RuVector migration** if gates pass (§10b), Chroma backfill or skip-and-go-direct-to-RuVector decision.
- **V1** (month 1): Docker self-host, **MCP over HTTP/SSE**, Apache-2.0 OSS release, **ruv-swarm for per-adapter ephemeral source aggregation** (§10a), **RVF COW snapshots replace JSON checkpoints** (§10b), DSPy.ts integration begins ([Issue #1](https://github.com/number7even/CONTINUUM/issues/1)).
- **V1.5** (month 2): web UI (status dashboard, manual checkpoint controls), **`continuum_spawn_swarm` MCP tool** (§10a), **OpenClaw Gateway distribution** (§6), **GNN-reinforced search** matures (§10b), Ruflo orchestration ([Issue #2](https://github.com/number7even/CONTINUUM/issues/2)), RecursiveMAS latent-space recursion ([Issue #3](https://github.com/number7even/CONTINUUM/issues/3) — gated by local inference engine `ruvllm` shipping in V0.5), Agentic-Jujutsu for concurrent swarm commits ([Issue #6](https://github.com/number7even/CONTINUUM/issues/6)).
- **V1.x** (interleaved with V1/V1.5): MidStream + Prime-Radiant real-time hallucination gating ([Issue #5](https://github.com/number7even/CONTINUUM/issues/5)).
- **V2** (month 3): hosted SaaS — **RuVector native multi-tenant collections** + Postgres control plane for tenancy/OAuth (resolves D-V2.2 flag), billing, team workspaces, **Neuro-Divergent predictive snapshots** (§10a), **midstream streaming transport** (§10a), Mike legal addon ([Issue #4](https://github.com/number7even/CONTINUUM/issues/4)), TaskmasterAI PRD-ingestion adapter ([Issue #7](https://github.com/number7even/CONTINUUM/issues/7) — may land earlier in V0.5+).
- **V3** (quarter 2): ARIA hotel integration — same RuVector engine, tenant-scoped, embedded in Voice OS.

### 15b. Phased execution plan (the four canonical steps)

The version timeline above ladders into four discrete execution steps. Each step has hard preconditions; jumping ahead is what partner-agreement clause #3 was written to prevent.

| Step | Phase | Goal | Hard precondition | Key deliverables | Parked integrations to activate |
|---|---|---|---|---|---|
| **1** | V0 polish | Establish the baseline — close the gap between the README narrative and shipped code. | V0 already shipped (done). | 3 Resources, 2 Prompts, `agent_handoff` schema, `docs`/`git` adapters, CLI, STATE.md parser, **CTO-doc privacy-row correction** (privacy filter is actually shipped — §8 invariant lives inside `observation.ts:insertObservation`, not in a dedicated Aggregator module). | None. |
| **2** | V0.5 RuVector | Unified persistence — swap storage engine without touching consumers. | Step 1 complete. RuVector v1.0+ maturity verified. Benchmark beats V0 SQLite-FTS5 baseline on representative workload. | RuVector backend (`packages/core/src/storage-ruvector.ts`), feature-flag at `openStorage()`, RVF native snapshots, GNN-reinforced search active. | Issue #1 (DSPy.ts AgentDB-vs-RuVector decision must close before V1). |
| **3** | V1 → V1.5 Swarm | Activate concurrent swarms; ground RecursiveMAS *only if* local inference is real. | Step 2 complete. `ruvllm` local inference engine shipping in V0.5 confirmed. RecursiveMAS Q1–Q4 hard problems (Issue #3) answered: local-model topology, latent-bridge implementation, falsification benchmark vs text-loop baseline. | `continuum_spawn_swarm` MCP tool, RecursiveMAS RecursiveLink in-swarm comms, Agentic-Jujutsu opt-in worktrees, MidStream coherence gate on final emission. | Issues #2, #3, #5, #6. |
| **4** | V2 Multi-Tenant + Addons | Enterprise scale — multi-tenant boundary + first vertical addon. | Step 3 complete. D-V2.2 tenancy reconciliation locked (RuVector data plane + Postgres control plane). Mike license verified. Legal counsel sign-off on court-admissibility claim. | RuVector multi-tenant collections, Postgres RLS, OAuth, billing, Mike SPA/NDA review presets, court-admissible audit chain. | Issue #4 (Mike). Issue #7 (TaskmasterAI) likely activated earlier — V0.5–V1. |

### 15c. The seven parked integrations (durable record)

The partner agreement requires that no integration #5+ lands ahead of V0 ship. The integrations below are tracked as GitHub Issues; this section is the canonical cross-reference.

| # | Integration | Target phase | Status |
|---|---|---|---|
| [#1](https://github.com/number7even/CONTINUUM/issues/1) | DSPy.ts — self-optimising digest, experience replay, ReActReflexion, AgentDB-vs-RuVector decision | V0.4 / V1 | Parked |
| [#2](https://github.com/number7even/CONTINUUM/issues/2) | Ruflo — GOAP A* todo execution, 12 workers, mTLS federation, Web UI, SONA-HNSW | V1.5 | Parked |
| [#3](https://github.com/number7even/CONTINUUM/issues/3) | RecursiveMAS — latent-space agent recursion, RecursiveLink modules, ReasoningBank | V1.5+ (gated by local inference) | Parked |
| [#4](https://github.com/number7even/CONTINUUM/issues/4) | Mike — tabular review legal addon, parallel diligence, court-admissible citations | V2 | Parked |
| [#5](https://github.com/number7even/CONTINUUM/issues/5) | MidStream + Prime-Radiant — real-time hallucination gating via sheaf Laplacian coherence | V1.x | Parked |
| [#6](https://github.com/number7even/CONTINUUM/issues/6) | Agentic-Jujutsu — lock-free concurrent commits for AI swarms | V1+ | Parked |
| [#7](https://github.com/number7even/CONTINUUM/issues/7) | TaskmasterAI — PRD → Live Todo Pipeline ingestion | V0.4 | Parked |

---

## 16. Related Documents

### Continuum's own state files (in dogfood repo)

- `STATE.md` (VC-Hospitality root) — canonical activation state, source for Continuum's first checkpoint snapshot
- `STATE_DOCS_INDEX.md` (VC-Hospitality root) — canonical /docs map (what `adapters/docs` ingests on first sync)
- `MEMORY.md` (Claude's project memory) — insights store (complementary to Continuum, not replaced)

### Memory + AI client primitives

- [**claude-mem**](https://github.com/thedotmack/claude-mem) v13.2.0 — installed 2026-05-14 at `~/.claude/plugins/marketplaces/thedotmack/`. Continuum consumes via `adapters/claude-mem` per D7.
- [**open-claude-code**](https://github.com/ruvnet/open-claude-code) — primary AI client target (§1). Native MCP support across 4 transports.

### Neural capability layer (V0.5+ — see §10a)

- [**ruv-FANN**](https://github.com/ruvnet/ruv-FANN) — WASM-native neural framework. Powers local digest generation (V0.5 option b), source-adapter swarms (V1), `continuum_spawn_swarm` (V1.5).
- [**ruv-FANN / Neuro-Divergent**](https://github.com/ruvnet/ruv-FANN/tree/main/neuro-divergent) — 27+ forecasting models. Powers V2 predictive snapshots.
- [**midstream**](https://github.com/ruvnet/midstream) — real-time streaming primitives. Powers V1+ multi-client subscription transport.

### Unified persistence layer (V0.5+ — see §10b)

- [**RuVector**](https://github.com/ruvnet/RuVector) — unified vector/graph/relational engine with GNN-reinforced search, RVF cognitive containers (Git-like COW snapshots), tamper-evident witness chain, Delta Behavior CRDTs, native multi-tenant collections. Replaces V0's SQLite+Chroma split.
- **ruvllm** (RuVector subsystem) — embedded GGUF model runtime supporting Metal / CUDA / WebGPU. Powers V0.5 local digest option (a).

---

_End of architecture map v0._
_Update this file as decisions lock. Re-version on material change._

IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
Co-Authored-By: claude-flow <ruv@ruv.net>
