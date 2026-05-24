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
  - `packages/cli/` — **`continuum init / start / serve / status /
    import-state`** CLI. Single bin. `init` creates DB + prints MCP
    registration snippet; `start` execs stdio MCP server; `serve` execs
    HTTP/SSE MCP server (V1, requires `$CONTINUUM_HTTP_TOKEN`);
    `status` shows latest snapshot + todo counts + data path;
    `import-state` parses STATE.md into a checkpoint.
  - `apps/console/` — **Next.js 15 frontend** (added 2026-05-24).
    Server-rendered page connects to a running CONTINUUM HTTP/SSE
    engine via the MCP SDK `SSEClientTransport` and renders the live
    tool/resource/prompt registry. **Deploys to Vercel** (set Root
    Directory to `apps/console`; set `CONTINUUM_HTTP_URL` +
    `CONTINUUM_HTTP_TOKEN` env vars). The AaaS frontend proof.
  - `packages/adapters/export/` — Claude session JSONL → Observation
    adapter (commit `0dd867b`, shipped pre-2026-05-15).
- **Verify-then-dissolve discipline proven end-to-end** (2026-05-15): row
  `81223c05-4465-480c-a56d-14f665ffb581` in the `vc-hospitality` DB —
  hospitality-aria deploy verified via SHA-grep of bundle `buildId`
  (commit `2aa4f96a5`), row closed only after fresh `verifyCommand`
  exited 0. Re-runnable witness encoded in the DB row itself.
- **`product_state[]` checkpoints in DB:**
  - `vc-hospitality` project (3 rows):
    - `aa102d94` — "Continuum V0 born" (2026-05-14)
    - `028d1cd3` — Grok failover stack live (2026-05-14)
    - `e22985e0` — V0 polish milestone (2026-05-15; reproducible via
      `scripts/checkpoints/v0-polish-2026-05-15.mjs`)
  - `continuum` project (V1 HTTP stub on top of V0.5 on top of V0-polish):
    - **(latest)** `b0f54355` — **V1 HTTP/SSE stub COMPLETE** (2026-05-24;
      reproducible via `scripts/checkpoints/v1-http-stub-2026-05-24.mjs`).
      8 active (V0-polish + Issue #8 metadata fix + refactor reflected in
      updated verify_commands) + 7 dormant (4 V0.5 + 3 V1 — all opt-in
      behind env vars). All 15 entries verify-green at stamp time; hash
      `16bbe4835a322a60…`.
    - `2e21bcaa` — V0.5 hybrid-stub COMPLETE (2026-05-24; reproducible
      via `scripts/checkpoints/v0.5-hybrid-stub-2026-05-24.mjs`). 8
      active + 4 dormant (V0.5 stub — opt-in via
      `CONTINUUM_STORAGE_BACKEND=hybrid`).
    - `208c56b2` — V0 polish COMPLETE (2026-05-24; reproducible via
      `scripts/checkpoints/v0-polish-complete-2026-05-24.mjs`).
      Real canonical hash `2b18a91527851b7e…`. All 9 entries verified
      green at stamp time (8 active + 1 dormant).
    - `a63eb576`, `c6291935` — earlier drafts of the V0-polish-complete
      checkpoint with broken verify_commands and broken pre-fix hashes.
      Kept in DB per append-only invariant as the iteration log.

## What's NOT done yet (do not claim otherwise)

- ✅ MCP Resources — **4 of 4 shipped** as of 2026-05-23 (commit `31fe885`):
  `continuum://todos/open`, `continuum://state/current`,
  `continuum://digest/latest`, `continuum://session/briefing`.
- ✅ MCP Prompts (`continuum.session_start`, `continuum.cite`) — **shipped**
  2026-05-23 (commit `31fe885`).
- ✅ CLI (`continuum init / start / status`) — **shipped** 2026-05-23.
- ✅ `packages/adapters/docs` — **shipped** 2026-05-23. Idempotent
  markdown ingester (`.md` / `.mdx`), stable per-file IDs from
  `sha256(relativePath)` formatted as UUID-shape. Smoke-test: ingested
  this repo's own `docs/` into the `continuum` project (3 files, 3
  upserts, idempotent on re-run, FTS5 verified). Privacy filter
  enforced via `storage.upsertObservation()`. Backed by
  `StorageBackend.upsertObservation()` method.
- ✅ `packages/adapters/git` — **shipped** 2026-05-23. One Observation
  per commit with `type='commit'`, raw 40-char SHA as the stable ID
  (slice(0,8) = git short-hash). `git log -z --pretty=format` with
  `\x1f` field separators for safe multi-line parsing. Content is
  subject + body (diffs intentionally excluded — token bloat + privacy
  risk; `git show <sha>` recovers them). Smoke-test: ingested 15-of-15
  commits from this repo, idempotent on re-run, cross-source FTS5
  search for "StorageBackend" returns hits across both git commits
  and docs.
- ✅ STATE.md → first-checkpoint parser — **shipped** 2026-05-24.
  Pure parser in `packages/core/src/state-md.ts` (string → CheckpointInput,
  no I/O). Wired into `continuum init` (auto-imports if STATE.md present
  AND no checkpoints exist yet — avoids noise on re-running init) and
  exposed as `continuum import-state` for forced re-imports. Smoke-tested
  on the real VC-Hospitality STATE.md: 11 active + 3 dormant + 0 broken,
  4 legitimate warnings (entries missing Verify correctly dropped).
  First-word category classification (not regex on full heading) — caught
  the "DORMANT (built but not the **active** path)" trap.
- ⚠️ **Post-V0-polish review backlog** — [Issues #8–#20](https://github.com/number7even/CONTINUUM/issues?q=is%3Aissue+is%3Aopen+sort%3Acreated-desc)
  captured 2026-05-24 immediately after V0-polish-complete. **Tier A
  defects to fix before V0.5 starts:** #8 (privacy filter doesn't scrub
  Observation.metadata), #9 (CLI project-id case-sensitivity foot-gun),
  #10 (`deleteObservation` for incident response). Tier B (sustainability
  / refactor): #11 (`node --test` framework), #12 (mcp-server split before
  it hits 1000 lines), #13 (`continuum verify` CLI command). Tier C+D:
  briefing freshness header (#14), configurable window (#15), adapter
  watch mode (#16), Issue #1–#7 triage (#17), FTS5 canary fixture (#18),
  **RVM source checkout** (#19 — added 2026-05-24 under explicit override
  of partner-clause #3; source at `~/Development/rvm`, `cargo check` clean,
  no integration code yet). **V0.5 RuVector architecture gap (#20) — Path A
  chosen and SHIPPED as stub 2026-05-24**: `HybridStorageBackend` composes
  SQLite (relational) + RuVector @0.2.25 native (HNSW vector index) +
  `@xenova/transformers` MiniLM-L6-v2 (384-dim embeddings). Opt-in via
  `CONTINUUM_STORAGE_BACKEND=hybrid`; sqlite remains the default. Smoke
  test `scripts/ruvector-smoke.mjs` passes all 9 checks. **Issue #8 closed
  2026-05-24** — privacy filter now deep-scrubs `Observation.metadata`
  strings (mandatory gate before V1 HTTP exposure). **V1 HTTP/SSE
  transport stub SHIPPED 2026-05-24**: Express + `SSEServerTransport` +
  Bearer auth + project routing in `packages/mcp-server/src/http.ts`;
  `continuum serve` CLI command wraps it. mcp-server refactored into
  thin `index.ts` (42 lines, stdio) + factory `server.ts` (783 lines,
  buildServer) + `http.ts` (163 lines, HTTP/SSE) — partial address of
  Issue #12. 7-check end-to-end smoke `scripts/http-smoke.mjs` round-
  trips a real SDK `SSEClientTransport` against the live server.
- ✅ Privacy filter §A3 extensions — **shipped** 2026-05-24. Eleven named
  patterns total (4 baseline + 7 new: JWT / GCP service account / GitHub
  tokens / Slack / Google API / Stripe live secret + publishable). Patterns
  now **actually scrub** (replace with `[REDACTED:<label>]`) instead of
  just detecting. Operator-extensible via JSON file at
  `$CONTINUUM_PRIVACY_CONFIG` (default `~/.continuum/privacy.json`).
  Optional Shannon-entropy detector gated by env var
  `CONTINUUM_PRIVACY_ENTROPY_DETECTOR=1` (4.5 bits/char threshold —
  above hex commit SHAs at ~4.0). 13-check smoke test in
  `scripts/privacy-smoke.mjs` exercises every pattern + edge cases (commit
  SHA not redacted, operator config loaded, bad config gracefully ignored).
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
