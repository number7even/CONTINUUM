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
5. **GitHub Issues #1, #2, #3** — preserved integration proposals (DSPy.ts,
   Ruflo, RecursiveMAS) for v0.4+ / v1.5+. **Do NOT** propose adding these
   to v0.3 architecture. They are tracked. The partner agreement was: no
   integration #5+ before V0 ships.
   - **#3 (RecursiveMAS, parked 2026-05-20)** explicitly requires V0.5+
     local inference (`ruvllm`) before any code lands — cloud API models
     do not expose hidden states, so RecursiveLink is incoherent against
     Anthropic/OpenAI/Google APIs. See Issue #3 §"Hard problems Q1–Q4"
     and `docs/CTO_ANALYSIS_2026-05-20.md`.

---

## What's true RIGHT NOW (verify in code before claiming)

- **Repo:** `github.com/number7even/CONTINUUM`
- **Architecture version:** v0.3 (commit `c6708ce` and forward)
- **License:** Apache-2.0
- **Workspace tool:** npm workspaces (D3 locked — pnpm migration trivial later)
- **Storage engine V0:** SQLite + FTS5 via `better-sqlite3`. RuVector swap
  comes V0.5+ via storage adapter pattern (D2 locked **and now materialised
  in code** — see below).
- **Storage Adapter pattern (D2) materialised in code** (commit `e725ae7`,
  2026-05-15): `StorageBackend` interface in `packages/core/src/storage.ts`,
  `SQLiteStorageBackend` impl in `packages/core/src/storage-sqlite.ts`,
  factory `openStorage(projectId)`. All consumers (`mcp-server`,
  `adapter-export`) go through the abstraction. V0.5 RuVector swap is a
  single-line change at the factory.
- **V0 packages compiled clean:**
  - `packages/core/` — types, db, checkpoint engine, todo CRUD, storage
    abstraction, **`AgentHandoffMetadata` type + `createAgentHandoffObservation()`
    helper** (V0-compatible RecursiveMAS intent capture per Issue #3, commit
    `31fe885`, 2026-05-23)
  - `packages/mcp-server/` — **7 MCP tools** + **4 Resources** + **2 Prompts**:
    - Tools: `continuum_record_checkpoint`, `continuum_get_state`,
      `continuum_get_digest`, `continuum_search_docs` (V0 baseline);
      `continuum_get_todos`, `continuum_create_todo`,
      `continuum_update_todo` (added 2026-05-15, commit `c9def2c`)
    - Resources: `continuum://todos/open` (2026-05-15, `c9def2c`);
      `continuum://state/current`, `continuum://digest/latest`,
      `continuum://session/briefing` — Layer-0 markdown brief composing
      state + open todos + recent activity in one cheap read
      (2026-05-23, commit `31fe885`)
    - Prompts: `continuum.session_start` (Layer-0→1→3 retrieval protocol),
      `continuum.cite` (Observation-ID citation discipline)
      (2026-05-23, commit `31fe885`)
  - `packages/cli/` — **`continuum init / start / status`** CLI
    (2026-05-23). Single bin, hand-rolled argv. `init` creates DB +
    prints MCP registration snippet; `start` execs the MCP stdio server;
    `status` shows latest snapshot + todo counts + data path.
  - `packages/adapters/export/` — Claude session JSONL → Observation
    adapter (commit `0dd867b`, shipped pre-2026-05-15).
- **Verify-then-dissolve discipline proven end-to-end** (2026-05-15): row
  `81223c05-4465-480c-a56d-14f665ffb581` in the `vc-hospitality` DB —
  hospitality-aria deploy verified via SHA-grep of bundle `buildId`
  (commit `2aa4f96a5`), row closed only after fresh `verifyCommand`
  exited 0. Re-runnable witness encoded in the DB row itself.
- **`product_state[]` checkpoints in DB** (3 rows in `vc-hospitality`):
  - `aa102d94` — "Continuum V0 born" (2026-05-14)
  - `028d1cd3` — Grok failover stack live (2026-05-14)
  - `e22985e0` — V0 polish milestone (2026-05-15; reproducible via
    `scripts/checkpoints/v0-polish-2026-05-15.mjs`)

## What's NOT done yet (do not claim otherwise)

- ✅ MCP Resources — **4 of 4 shipped** as of 2026-05-23 (commit `31fe885`):
  `continuum://todos/open`, `continuum://state/current`,
  `continuum://digest/latest`, `continuum://session/briefing`.
- ✅ MCP Prompts (`continuum.session_start`, `continuum.cite`) — **shipped**
  2026-05-23 (commit `31fe885`).
- ✅ CLI (`continuum init / start / status`) — **shipped** 2026-05-23.
- ❌ `packages/adapters/{docs,git}` — V0 polish (`export` shipped at `0dd867b`).
- ❌ STATE.md → first-checkpoint parser — V0 polish.
- ❌ Privacy filter extensions (JWT shapes, GCP service-account JSON,
  entropy detector, operator-extensible patterns config) — V0 polish per
  CTO doc §A3. Base filter (`<private>` tags + sk-/xai-/AKIA/PEM patterns)
  **is already shipped** in `packages/core/src/observation.ts:42`.
- ❌ `claude-mem` + `sona` adapters — V0.5.
- ❌ RuVector storage backend — V0.5 (drop-in point now wired at
  `openStorage()` factory — V0.5 work is the implementation, not the seam).
- ❌ ruv-FANN / ruvllm digest generation — V0.5.
- ❌ ruv-swarm ingestion — V1.
- ❌ Web UI — V1.5.
- ❌ HTTP/SSE/WebSocket transports — V1. **Backlog encoded as todos**
  V1.1→V1.4 in the `vc-hospitality` pipeline (2026-05-15).
- ❌ Hosted SaaS multi-tenant — V2. **Backlog encoded as todos** V2.1
  (WebSocket) + V2.2 (Postgres RLS + OAuth — see architectural flag below)
  in the `vc-hospitality` pipeline (2026-05-15).

**Open architectural flag (2026-05-15):** V2.2 todo title says "Postgres
RLS" but D2 locks RuVector as the V0.5+ unified persistence engine. Two
coherent reconciliations: (a) RuVector holds data, Postgres wraps it as the
auth/tenancy directory (common SaaS pattern, no D2 revision needed); or
(b) V2 reverts to Postgres which would require a D2 lock-revision conversation
in ARCHITECTURE.md §14. Decide before V2.2 work begins.

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

_Last updated: 2026-05-15._
_Update this file whenever V0 polish lands, V0.5 begins, or any partner
agreement clause is revised._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
