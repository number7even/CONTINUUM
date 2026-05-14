# Continuum — Architecture Map

> **Status:** v0 draft — design before code
> **Date:** 2026-05-14
> **Authors:** Riaan Kleynhans + Claude
> **Working name:** Continuum (open — see D1)
> **Repo:** to be created at `voicecosmos/continuum` (Option A: standalone, locked 2026-05-14)
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
**Consumer:** any MCP-aware AI client. Primary target: Claude Code.

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

**Ingest path (continuous + on-demand):**

```
Source change (git commit, file edit, session tick, sona event)
   ↓
Source adapter detects (poll or webhook)
   ↓
Aggregator normalizes to a canonical Observation record
   ↓
Indexer writes: SQLite row + Chroma embedding
   ↓
If checkpoint trigger fires → Checkpoint Engine writes immutable snapshot
   ↓
If todo signal detected → Todo Manager updates state
```

**Query path (session-start, on-demand):**

```
AI client calls MCP tool (e.g. get_digest, search_memory)
   ↓
MCP server routes to Core
   ↓
Core queries SQLite + Chroma
   ↓
Digest Generator composes response (with LLM optionally)
   ↓
Returns structured result to AI client
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

---

## 5. MCP Interface (tools exposed to AI clients)

```
get_state(at?: timestamp) → StateSnapshot
  "What was active/dormant/broken at timestamp T?" (default: now)

get_digest(window: '24h'|'7d'|'session') → Digest
  "Summarize what happened in window W."

search_docs(query: string, limit?: int) → Observation[]
  "Find relevant /docs chunks for query." (RAG)

search_memory(query: string, limit?: int) → Observation[]
  "Find relevant past observations." (claude-mem-style)

get_todos(status?: 'open'|'blocked'|'done', refs?: string[]) → Todo[]
  "List todos filtered by status or reference."

create_todo({title, refs?, verify_command?}) → Todo
update_todo({id, status?, verify_command?}) → Todo

record_checkpoint(reason: string) → StateSnapshot
  "Manually snapshot current state with reason."
```

**Resources (MCP):**

- `continuum://state/current` — current StateSnapshot as markdown
- `continuum://digest/latest` — latest digest
- `continuum://todos/open` — open todos

**Prompts (MCP):**

- `continuum.session_start` — pre-built prompt that asks AI to read state+digest before responding

---

## 6. Deployment

```
┌────────────────────────────────────────────────────────────────┐
│  V0 (tonight): Local CLI — `npx continuum init/start`          │
│     • SQLite + Chroma stored at ~/.continuum/                  │
│     • MCP stdio server invoked by Claude Code per-project      │
│     • Source adapters poll on a configurable cadence           │
│                                                                │
│  V1 (week 2): Docker self-host                                 │
│     • Single container, exposes MCP over HTTP + WebSocket      │
│     • Persistent volumes for SQLite + Chroma                   │
│                                                                │
│  V2 (month 2): Hosted SaaS                                     │
│     • Multi-tenant, OAuth, billing                             │
│     • Team workspaces                                          │
│     • Cross-device sync                                        │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. Extension Points

- **Source adapter SDK** — `interface SourceAdapter { sync(), search(), listen() }`. Anyone can add Slack, Linear, Jira, Notion, Figma, etc.
- **Sink adapter SDK** — `interface Sink { onCheckpoint(), onDigest(), onTodoChange() }`. Notify Slack, email digest, etc.
- **LLM provider abstraction** — digest generation pluggable (OpenAI, Anthropic, local Ollama).
- **Embedding provider abstraction** — Chroma's default vs. OpenAI vs. local.

---

## 8. Security / Privacy

- **Local-first by default.** Nothing leaves your machine unless you explicitly enable a sync sink.
- **Encryption at rest:** SQLite + Chroma optionally encrypted (libSQL with encryption).
- **`<private>` tag honored** (claude-mem convention): observations marked private never indexed.
- **Tenant isolation:** SaaS deployment uses Postgres row-level security per workspace.
- **No telemetry by default** — opt-in for usage analytics.

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
| **D2** | Embedding store | Chroma / sqlite-vss / pgvector | Chroma (matches claude-mem) | pending |
| **D3** | Monorepo tool | pnpm workspaces / turborepo / nx | pnpm (smallest) | pending |
| **D4** | LLM for digest generation | optional from V0 / required from V1 | optional V0 (template fallback) | pending |
| **D5** | License | MIT / Apache-2.0 / dual | Apache-2.0 (matches claude-mem) | pending |
| **D6** | GitHub org | own org / under VoiceCosmos / personal | own org for OSS clarity | pending |
| **D7** | claude-mem relationship | adapter (we consume) / fork / competitor | adapter — orchestrate, don't reinvent | pending |
| **D8** | First checkpoint trigger | git commit / session end / both | both | pending |

---

## 15. Roadmap (post-V0)

- **V0** (this week): dogfood-ready, 4 MCP tools, 3 source adapters, local-only
- **V0.5** (week 2): claude-mem + sona adapters, todo manager, LLM digest
- **V1** (month 1): Docker self-host, MCP over HTTP, MIT/Apache OSS release on GitHub
- **V1.5** (month 2): web UI (status dashboard, manual checkpoint controls)
- **V2** (month 3): hosted SaaS — multi-tenant, OAuth, billing, team workspaces
- **V3** (quarter 2): ARIA hotel integration — same engine, tenant-scoped, embedded in Voice OS

---

## 16. Related Documents

- `STATE.md` (this repo root) — canonical activation state for VC-Hospitality (what Continuum will source from + replace as the primary mechanism)
- `STATE_DOCS_INDEX.md` (this repo root) — canonical /docs map (what docs adapter ingests)
- `MEMORY.md` (Claude's project memory) — insights store (complementary to Continuum, not replaced)
- `~/.claude-mem/` — claude-mem v13.2.0 installed 2026-05-14 (memory adapter source)

---

_End of architecture map v0._
_Update this file as decisions lock. Re-version on material change._

IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
Co-Authored-By: claude-flow <ruv@ruv.net>
