# Continuum — CLAUDE.md

> **Audience:** Claude (any AI assistant) opening a session in this repo.
> **Purpose:** session-start onboarding — tells Claude what Continuum is,
> what's currently built, and what to read first.

---

## Read these in order, before responding to the first user message

1. **`README.md`** — what Continuum is, who it helps, how it works from a
   user's terminal (5-step walkthrough), current status, quick-start.
2. **`docs/HOW_CONTINUUM_WORKS.md`** — product narrative + architectural
   mechanics deep-dive. Read sections §6 (V1+ Roadmap Mechanics) and §7
   (Three Customers) for strategic context.
3. **`ARCHITECTURE.md`** — engineering source-of-truth. **Especially** §14
   (Open Decisions) to know what's locked vs pending. **8 of 9 decisions
   are locked as of 2026-05-14.**
4. **`docs/INDEX.md`** — documentation map.
5. **GitHub Issues #1 + #2** — preserved integration proposals (DSPy.ts +
   Ruflo) for v0.4+. **Do NOT** propose adding these to v0.3 architecture.
   They are tracked. The partner agreement was: no integration #5+ before
   V0 ships.

---

## What's true RIGHT NOW (verify in code before claiming)

- **Repo:** `github.com/number7even/CONTINUUM`
- **Architecture version:** v0.3 (commit `c6708ce` and forward)
- **License:** Apache-2.0
- **Workspace tool:** npm workspaces (D3 locked — pnpm migration trivial later)
- **Storage engine V0:** SQLite + FTS5 via `better-sqlite3`. RuVector swap
  comes V0.5+ via storage adapter pattern (D2 locked).
- **V0 packages compiled clean:**
  - `packages/core/` — types, db, checkpoint engine
  - `packages/mcp-server/` — 4 MCP tools (`continuum_record_checkpoint`,
    `continuum_get_state`, `continuum_get_digest`, `continuum_search_docs`)
- **First real `product_state[]` checkpoint exists** for `vc-hospitality`
  project at `~/.continuum/vc-hospitality/continuum.db`.

## What's NOT done yet (do not claim otherwise)

- ❌ MCP Resources (`continuum://state/current`, `continuum://digest/latest`,
  `continuum://todos/open`, `continuum://session/briefing`) — V0 polish gap.
- ❌ MCP Prompts (`continuum.session_start`, `continuum.cite`) — V0 polish gap.
- ❌ `packages/adapters/{docs,git,export}` — V0 polish.
- ❌ STATE.md → first-checkpoint parser — V0 polish.
- ❌ CLI (`npx continuum init / start / status`) — V0 polish.
- ❌ `claude-mem` + `sona` adapters — V0.5.
- ❌ RuVector storage backend — V0.5 (behind verification gate).
- ❌ ruv-FANN / ruvllm digest generation — V0.5.
- ❌ ruv-swarm ingestion — V1.
- ❌ Web UI — V1.5.
- ❌ HTTP/SSE/WebSocket transports — V1.
- ❌ Hosted SaaS multi-tenant — V2.

---

## Partner agreement — what this repo was born from

Continuum was born 2026-05-14 night session, addressing 4 months of memory
time-theft Riaan named explicitly:

> *"the dissapointments is just getting too much for me to handle"*
> *"rinse repeat for 4 months"*
> *"we cant go on like this"*

The partner agreement governing future sessions in this repo:

1. **Verify before assertion.** When Riaan says "we did X," verify in code
   before agreeing or building on it. If you can't verify, say so plainly.
2. **No silent overrides.** When pushback is offered, get a clear
   accept/override decision. Do not quietly do the work after a flag was
   raised.
3. **Code > architecture revision.** If Riaan starts adding "integration #N"
   while V0 still ships zero working code, flag the pattern. The architecture
   is the menu; food doesn't arrive until we cook.
4. **Stop signals.** "I'm tired" / "this isn't working" mean STOP. Not "let
   me pitch a new system." Stop. He'll push you to keep going when he wants.

This file IS one of the structural counter-measures to the memory problem.
You will start cold. This file tells you exactly enough to start warm.

---

## Three customers, one engine — strategic context

Continuum serves three customers from the same architecture:

1. **Us (dogfood):** the VoiceCosmos dev team. Already shipped V0.
2. **Other AI-assisted builders:** V1 OSS release for solo HITL founders.
3. **VoiceCosmos hotel tenants:** V3 ARIA embedding. Same engine,
   tenant-scoped.

The architecture is identical across all three. Only configuration changes.

---

## Repo conventions

- **Branching:** `feature/<name>`, `fix/<name>`. PR required.
- **Commit format:** Conventional Commits (`feat`, `fix`, `docs`, `chore`,
  `refactor`, `test`, `perf`).
- **Decision locks:** Update `ARCHITECTURE.md §14` table from `pending` to
  `✅ Locked YYYY-MM-DD` in the same PR.
- **IP attribution:** Every source file ends with the IP notice.

---

## Quick map: where to write what

| You're working on… | File / package |
|---|---|
| Storage / schema / checkpoint engine | `packages/core/src/` |
| MCP tool definitions or handlers | `packages/mcp-server/src/` |
| Source adapter (docs, git, export, etc.) | `packages/adapters/{name}/` |
| Architectural decision | `ARCHITECTURE.md` (lock D-decision in §14) |
| User-facing narrative | `docs/HOW_CONTINUUM_WORKS.md` |
| Test files | `packages/{name}/src/**/*.test.ts` |

---

_Last updated: 2026-05-14._
_Update this file whenever V0 polish lands, V0.5 begins, or any partner
agreement clause is revised._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
