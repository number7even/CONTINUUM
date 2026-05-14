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

## Status

**v0 — design phase.** Architecture map is locked. Code begins after the remaining 8 design decisions in [`ARCHITECTURE.md` §14](./ARCHITECTURE.md#14-open-decisions) close.

This repo currently contains:

- ✅ `ARCHITECTURE.md` — system context, data model, MCP interface, deployment roadmap
- ✅ Monorepo skeleton (npm workspaces)
- ✅ License + governance
- ⏳ `packages/core/` — coming
- ⏳ `packages/mcp-server/` — coming
- ⏳ `packages/cli/` — coming
- ⏳ `packages/adapters/{docs,git,export}/` — coming
- ⏳ `packages/adapters/{claude-mem,sona}/` — V0.5
- ⏳ `packages/web-ui/` — V1

See [ROADMAP §15](./ARCHITECTURE.md#15-roadmap-post-v0) for full timeline.

---

## Quick start

```bash
# Coming soon — V0 dogfood-ready target: 2026-05-15

npm install -g @continuum/cli
continuum init    # creates ~/.continuum/{project_id}/
continuum start   # boots MCP server, registers with Claude Code
```

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
