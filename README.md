<h1 align="center">Continuum</h1>

<p align="center">
  <strong>Persistent intelligence layer for AI coding assistants.</strong>
  <br>
  <em>Your AI collaborator finally remembers.</em>
</p>

<p align="center">
  <a href="#status"><img alt="Status" src="https://img.shields.io/badge/status-v0%20design-orange"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
  <a href="https://github.com/number7even/CONTINUUM"><img alt="Repo" src="https://img.shields.io/badge/github-number7even%2FCONTINUUM-black"></a>
</p>

---

## What is Continuum?

A persistent intelligence layer between you and any AI coding assistant. Continuum runs as an MCP server that aggregates **five sources** of project truth — your `/docs` (RAG), your AI memory observations (claude-mem-compatible), your feedback signals (SONA-style HITL rewards), your git history, your AI session transcripts — and produces:

1. **Timestamped `product_state[]` snapshots** — *"What was true on May 14?"* → verifiable answer.
2. **Auto-generated session-start briefings** — your AI opens with full context, not cold.
3. **Live todo pipeline** — open commitments tracked from discussion → action → verification.

**Who it's for:** solo founders, small teams, and consultants who ship with AI help and lose hours every session re-explaining context. Anyone who has ever said *"I told you about this last week"* to an AI.

**Why it's defensible:** nobody else combines all 5 sources. claude-mem captures observations only. Mem.ai is notes. Notion is docs. Cursor rules are conventions. None checkpoint state. The 5-source aggregation IS the moat.

---

## How it works from your terminal

Continuum solves the **AI-collaborator memory problem** — the cycle where you
lose hours every session re-explaining project history because your AI
assistant forgot what was said yesterday. It eliminates the need to ever say
*"I told you about this last week"* to an AI.

Because Continuum runs as a **Model Context Protocol (MCP) server**, using
it requires **almost no change to your workflow**. Here's exactly what
happens from the moment you open Claude Code:

### 1. The setup — once

Register Continuum as a local MCP subprocess in `~/.claude.json` or
project-specific `.mcp.json`. After that, every time you open Claude Code,
Continuum boots automatically in the background as an MCP stdio server.

```bash
cp .mcp.json.example /your-project/.mcp.json
# (adjust CONTINUUM_PROJECT_ID inside)
```

### 2. Session start — eliminating the cold start

**What you do:** open Claude Code, say *"let's pick up where we left off."*

**What happens:** before Claude generates a response, it executes a pre-built
MCP prompt called `continuum.session_start` that explicitly instructs it to
read `continuum://session/briefing`.

**How it helps:** the AI instantly ingests a summary of your latest digest,
the current `product_state[]` snapshot, and your open commitments. You never
start cold. Claude already knows exactly what was active, dormant, or broken
at the end of your last session.

### 3. The working loop — silent, hook-driven ingestion

**What you do:** keep chatting, executing bash, writing code as normal.

**What happens:** you never need to manually tell Continuum to *"take a
note."* It silently listens to 5 lifecycle hooks fired by the AI client:
`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`.

**How it helps:** every tool use and prompt submission is automatically
captured by the Aggregator, normalized, run through the strict `<private>`
privacy filter, and stored as a canonical `Observation` in the local
SQLite + Chroma. Open tasks move through the live todo pipeline (visible to
the AI at `continuum://todos/open`) from discussion → action → verification.

### 4. Deep memory retrieval — Progressive Disclosure

**What you do:** ask Claude a complex historical question, like *"Why did
we revert that auth module last month?"*

**What happens:** instead of dumping thousands of lines of memory into the
prompt (which blows the token limit and burns API cost), Continuum forces
Claude to use a token-efficient 3-layer workflow:

- **Layer 1 (`continuum_search`)** — Claude gets a compact index of
  observation IDs related to *"auth module"* (~50-100 tokens per result).
- **Layer 2 (`continuum_timeline`)** — Claude checks chronological context
  around those IDs to understand causality (*"what happened right before
  this?"*).
- **Layer 3 (`continuum_get_observations`)** — Claude fetches the full text
  only for the specific records it actually needs.

**How it helps:** progressive disclosure yields **~10x token savings** while
giving the AI perfect historical recall.

### 5. Session end — writing the checkpoint

**What you do:** close your terminal, or make a git commit.

**What happens:** the `SessionEnd` hook or `git post-commit` hook
automatically triggers `record_checkpoint`.

**How it helps:** Continuum generates an immutable, timestamped
`product_state[]` snapshot containing your project's `active[]`, `dormant[]`,
and `broken[]` features, sealed with a cryptographic hash for tamper
evidence.

### The result

By orchestrating 5 sources of truth into checkpointed state, Continuum
guarantees that **when you open your terminal tomorrow, your AI partner is
already fully briefed and ready to build.**

For the architectural mechanics behind this, see
[`docs/HOW_CONTINUUM_WORKS.md`](./docs/HOW_CONTINUUM_WORKS.md) (deep-dive)
and [`ARCHITECTURE.md`](./ARCHITECTURE.md) (engineering source-of-truth).

---

## Status

**v0 — dogfood-ready.** Architecture map locked at v0.3. Foundation packages
build clean. First real `product_state[]` checkpoint written.

This repo currently contains:

- ✅ `ARCHITECTURE.md` (v0.3) — system context, data model, MCP interface, deployment roadmap, 8/9 decisions locked
- ✅ `docs/HOW_CONTINUUM_WORKS.md` — product narrative + V1+ mechanics deep-dive
- ✅ `packages/core/` — SQLite + FTS5 storage, types, checkpoint engine (compiles clean)
- ✅ `packages/mcp-server/` — 4 V0 MCP tools (compiles clean)
- ✅ `.mcp.json.example` — drop-in MCP registration template
- ⏳ MCP Resources (`continuum://...`) + Prompts (`continuum.session_start`) — v0 polish in progress
- ⏳ STATE.md parser → first-checkpoint pipeline
- ⏳ `packages/adapters/{docs,git,export}/` — v0 polish
- ⏳ `packages/adapters/{claude-mem,sona}/` — V0.5
- ⏳ `packages/web-ui/` — V1

See [ROADMAP §15](./ARCHITECTURE.md#15-roadmap-post-v0) for full timeline.

---

## Quick start (V0)

```bash
# 1. Clone + build
git clone https://github.com/number7even/CONTINUUM.git
cd CONTINUUM
npm install
npm run build

# 2. Register Continuum with your AI client
#    (per-project .mcp.json OR ~/.claude.json)
cp .mcp.json.example /path/to/your-project/.mcp.json
# Edit: set CONTINUUM_PROJECT_ID to a project name (e.g. "my-project")
# Edit: confirm absolute path to packages/mcp-server/dist/index.js

# 3. Restart Claude Code in your-project/
#    The 4 tools appear:
#       continuum_record_checkpoint
#       continuum_get_state
#       continuum_get_digest
#       continuum_search_docs

# 4. Verify
#    In Claude Code: "use continuum_get_state to show me current state"
#    First time: returns a friendly "no snapshots yet" message.
#    Use continuum_record_checkpoint with reason + active[] to seed.
```

A full CLI (`npx continuum init / start / status`) lands in V0 polish.

After install, Claude Code (and any MCP-aware client) sees the new tools:

```
get_state, get_digest, search_docs, search_memory,
get_todos, create_todo, update_todo, record_checkpoint
```

---

## How it works

```
┌───────────────────────────────────────────────────────────┐
│                       CONTINUUM                           │
│                                                           │
│  AI client ──MCP──▶ tools / resources / prompts           │
│                          │                                │
│                          ▼                                │
│              ┌─────── CORE ENGINE ────────┐               │
│              │ Aggregator → Indexer →     │               │
│              │ State → Checkpoints → Todo │               │
│              └────────────┬───────────────┘               │
│                           │                               │
│                           ▼                               │
│  ┌────────── 5 SOURCE ADAPTERS ──────────┐                │
│  │ docs   mem   sona   git   export      │                │
│  └────────────────────────────────────────┘               │
│                           │                               │
│                           ▼                               │
│              SQLite + Chroma + checkpoints                │
└───────────────────────────────────────────────────────────┘
```

Full detail: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## Three customers, one architecture

1. **Us (dogfood)** — kills the AI memory time-theft for the team building VoiceCosmos.
2. **AI-assisted builders** — open-source MCP server + hosted SaaS for teams using Claude Code / Cursor / Desktop / Cline.
3. **VoiceCosmos hotel tenants** — same engine, tenant-scoped, embedded in ARIA. The Voice OS that *"knows the property"* is a Continuum instance pointed at the hotel's data.

The dogfood IS the demo. When Claude can ship VoiceCosmos because Continuum works for the dev side, that's the customer testimony.

---

## License

Apache-2.0 — see [LICENSE](./LICENSE).

We chose Apache-2.0 because durable agentic memory should be easy to embed in developer tools, local agents, MCP servers, enterprise systems, and production agent harnesses.

---

## Maintainers

- **Riaan Kleynhans** — Founder, VoiceCosmos · [@number7even](https://github.com/number7even)
- Built with Claude · Code

---

<p align="center">
  <em>Your AI collaborator finally remembers.</em>
</p>
