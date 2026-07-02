# Sprint 2026-W22 + W23 — Verify, Harden, Promote

> **Window:** 2026-05-29 → 2026-06-12 (two calendar weeks).
> **Discipline:** Bound by [The Nine](../AGENTS.md) v0.1.0.
> **Anchor checkpoint:** `d0fa50a7` (V1 AaaS LIVE).

---

## Goal in one sentence

Convert *V1 AaaS LIVE* from "the surface compiles and serves" to "the
Progressive Disclosure moat is **measured** under live fire, Tier-A defects
are closed, and V0.5 hybrid is promoted from stub to default-backable —
without expanding scope into RVM, H-MARA, Vibely, or the hyperscale layer."

---

## Non-goals (per partner-clause #3 — code > architecture revision)

The following are **out of scope for these two weeks**:

- RVM integration (Issue #19) — source checkout only, no embed.
- H-MARA prototyping (Issue #22) — vision doc exists, no Rung-1 code.
- Vibely / SIR compiler — no code, no spec.
- Hyperscale network / KV-Affinity / Knapsack broker — no code, no need at current load.
- GitReverse integration (Issue #21) — defer to v0.5+.

Mentioning them is fine; building them this sprint would be the
architecture-grows-while-code-lags antipattern The Nine warns against.

---

## Week 22 — Verify + Defect-fix (May 29 → June 5)

### W22-1 · ⏳ /chat live-fire moat verification
**Owner:** operator (the leap is theirs per P9)
**Acceptance:** Five canonical queries run against
`https://continuum-kohl.vercel.app/chat`. For each, captured to
`docs/evidence/chat-W22-runs.md`:
- (a) the user query verbatim,
- (b) the *ordered* tool-call sequence the agent emitted,
- (c) the final assistant reply,
- (d) `inputTokens / outputTokens / $cost` from the inline counter.

**Pass criteria:** at least 3 of 5 runs show a Layer-1 card (`continuum_search_docs`) **before** any Layer-3 card (`continuum_get_observations`). One run without Layer-3 at all is acceptable. Zero runs where Layer-3 fires before Layer-1.

**Fail mode:** if Sonnet skips straight to `continuum_get_observations` on
shallow queries, the system prompt is failing to bias correctly. Mitigation
is **prompt-hardening only**, not framework change. Estimated fix: 1 commit.

**Suggested canonical queries:**
1. "What did we ship today?" (warm-state question, expect Layer 0 → 1)
2. "Show me the V1 AaaS LIVE checkpoint." (specific, expect Layer 1 → 3 by ID)
3. "How does the V1 HTTP transport wire to storage?" (causal, expect Layer 1 → 2 → 3)
4. "What's the privacy filter doing differently after Issue #8?" (defect-history, expect Layer 1 → 2)
5. "What's broken right now?" (state question, expect Layer 0 briefing only)

---

### W22-2 · Issue #9 — CLI project-id case sensitivity
**Owner:** coder
**Acceptance:** `continuum init MyProject` then `continuum start --project myproject` resolves to the same DB. Test in `packages/cli/src/cli.test.ts` covers both casings + a mixed-case third call. Closes #9.
**Estimate:** 1–2 commits.

---

### W22-3 · Issue #10 — `StorageBackend.deleteObservation`
**Owner:** coder
**Acceptance:**
- `StorageBackend.deleteObservation(id: string): Promise<boolean>` added to the interface in `packages/core/src/storage.ts`.
- Implemented in `storage-sqlite.ts` (with FTS5 trigger cleanup) and `storage-hybrid.ts` (vector + relational delete).
- New MCP tool `continuum_delete_observation` exposed (Layer-?? — incident-response, not user-discoverable in normal flow; description starts with "**INCIDENT RESPONSE ONLY**").
- Smoke test: insert → search-hit → delete → search-miss → FTS5 row gone.
Closes #10.
**Estimate:** 2–3 commits.

---

### W22-4 · `/chat` token-counter calibration
**Owner:** coder (small)
**Acceptance:** Confirm Sonnet 4.6 pricing constants in `apps/console/app/chat/page.tsx`:
- `PRICE_IN_PER_M = 3` (USD per million input tokens)
- `PRICE_OUT_PER_M = 15` (USD per million output tokens)
Add a third constant `PRICE_CACHED_PER_M = 0.30` and surface cached-input separately in the UsageBar. Add a one-line "vs raw grep" comparator: estimate the same query against `grep -r` + `Read` and show the ratio.
**Estimate:** 1 commit.

---

### W22-5 · Issue #12 — finish `mcp-server` split
**Owner:** coder
**Acceptance:** `packages/mcp-server/src/server.ts` (currently 783 lines) split into:
- `tools/index.ts` (tool registry + dispatcher map)
- `tools/<each tool>.ts` (one per MCP tool, 1 file each)
- `resources/index.ts` + per-resource files
- `prompts/index.ts` + per-prompt files
- `server.ts` (factory, ~150 lines)
No behavior change. All existing smoke-tests pass. Closes #12.
**Estimate:** 1 commit.

---

## Week 23 — V0.5 promotion + observability (June 5 → June 12)

### W23-1 · Issue #20 — V0.5 hybrid backend promotion path
**Status today:** stub-quality, opt-in via `CONTINUUM_STORAGE_BACKEND=hybrid`. Smoke test `scripts/ruvector-smoke.mjs` passes 9/9.

**Acceptance for promotion (G1 REVISED 2026-06-01 — see §"G1 revision history" below):**
- Benchmark: 10k `Observation` records inserted in **<90s** (revised from <60s); recall@5 ≥ 0.85 on a fixture query set of 50 questions; p95 query latency <50ms.
- Index rebuild path: `continuum reindex --backend hybrid` command works without data loss.
- Migration path: a CLI subcommand to migrate an existing SQLite-only DB to hybrid without losing observation IDs or FTS5 hits.
- Documented in `docs/V0.5-HYBRID.md` (one page, gated by Path A choice — defer creation until promotion criteria met).

**Out-of-scope this sprint:** the GNN-from-query-sequence claim. That stays roadmap.
**Estimate:** ~5 commits across the week.

#### G1 revision history (2026-06-01) — Path D

The original G1 (10k inserts <60s) was an arbitrary synthetic bulk-import constraint. It was held as a hard gate through two JS-native optimisation passes:

- **Path A — batching** (commit `7736029`). Routed embeds through `embedBatch(32)` to amortise the JS↔WASM call boundary. Result: 138s → 105s (-24%). G1 still failed.
- **Path B — `worker_threads` pool** (commit `8a4fe2c`). Added an N-worker pool that each loads its own MiniLM-L6-v2 pipeline; default `min(cores, 4)` after empirical sweep showed 4 = sweet spot vs 8 (oversubscription) and 2 (under-utilization). Result best case: 89s (-36% vs baseline). G1 still failed.
- **Path B + `numThreads=1` pin** attempted. V8 segfaulted (`Check failed: node->IsInUse()`). Closed route.
- **Path C — native embedder (fastembed-rs / candle / llama.cpp bindings)** considered. Would cross the threshold (<15s) but breaks Journey 3's zero-config `npm install` promise per UX-JOURNEYS.md. Operator rejected.
- **Path D — revise G1 against actual workload.** Authorized after Paths A and B were shipped and the structural ceiling was proven empirical (ORT WASM internal threading prevents true N×parallelism; variance 89s ↔ 118s across runs).

**Reframing rationale (P4 — honest):**

The G1 60s target was for bulk-insert throughput. The actual CONTINUUM workload, per `UX-JOURNEYS.md`, is trickle-ingest:

- **Journey 2 (ARIA tenants):** continuous per-property events (RAG doc updates, observation logs, todo state changes). Single-digit inserts per second sustained.
- **Journey 3 (solo dogfood):** single MCP tool calls + occasional docs/git adapter syncs. <1 insert/sec average; <100/min burst.
- **Bulk migration** (rare): one-time per project when running `continuum migrate --backend hybrid`. 10k observations is the entire-project case, not a steady-state cost. ~90s for a one-time migration is acceptable.

The revised G1 (<90s for 10k bulk) corresponds to **~112 inserts/sec sustained throughput** which is >100× the realistic steady-state ingest rate. G2 (recall 0.98, gate ≥0.85) and G3 (p95 26ms, gate <50ms) both passed comfortably, confirming the retrieval moat is intact.

**This revision is explicit and committed.** Per P5 (the rule binds its keeper), it is NOT a silent goalpost move — it ships as a deliberate amendment to this sprint doc with full benchmark evidence linked. The discipline is preserved by being honest about WHY the original target was wrong, not pretending the engine cleared it.

---

### W23-2 · Issue #11 — `node --test` as canonical test framework
**Owner:** coder
**Acceptance:** All `packages/*/src/**/*.test.ts` runnable via `node --test`. Root `npm test` script invokes it. CI workflow (GitHub Actions) green on PR. Closes #11.
**Estimate:** 2 commits.

---

### W23-3 · Issue #13 — `continuum verify` CLI command
**Owner:** coder
**Acceptance:** `continuum verify` finds the latest snapshot in the current project DB, iterates its `verify_commands`, runs each, exits with the count of failures. Exit 0 = all green. Surfaces the exact failing command + its stderr on first failure. Closes #13.
**Estimate:** 1 commit.

---

### W23-4 · Briefing freshness + window config (Issues #14, #15)
**Owner:** coder
**Acceptance:**
- `continuum://session/briefing` resource adds a freshness header: `## Briefing as of YYYY-MM-DD HH:MM TZ · N observations in window`.
- Window size configurable via `CONTINUUM_BRIEFING_WINDOW_HOURS` (default 24).
- Closes #14 + #15.
**Estimate:** 1 commit.

---

### W23-5 · Adapter watch mode (Issue #16)
**Owner:** coder
**Acceptance:** `continuum adapter <name> --watch` runs the docs and git adapters in a daemon, debounced 2s on file change, idempotent re-upserts. Closes #16.
**Estimate:** 1–2 commits.

---

## Daily standup template (5 lines, copy/paste)

```
Date: YYYY-MM-DD
Shipped yesterday: <commit SHA — title>
Working today: <ticket-id from this sprint>
Blocked by: <empty | issue-N | needs operator leap on X>
Verification owed: <empty | obs-id needing verify_command rerun>
```

---

## Sprint exit criteria

A sprint review document `docs/SPRINT-REVIEW-W23.md` written on 2026-06-12 must answer:

1. Did `/chat` pass the 3-of-5 Progressive Disclosure test? (Yes / partial / no)
2. Are Issues #9, #10, #11, #12, #13, #14, #15, #16 all closed? (List which.)
3. Is V0.5 hybrid backend default-backable per the promotion criteria? (Yes / no / which criterion failed.)
4. What is the next-sprint anchor — V1.1 (HTTP polish), V0.5-default-flip, or V1.2 (multi-tenant)?

If criterion 1 fails, the rest of this sprint pauses for prompt-hardening
until it passes. The economic moat ranks higher than tech-debt clearance.

---

## Out-of-band risks tracked, not actioned

These could derail the sprint but are not in scope. Watching only:

- **Vercel AI SDK v6 still in flux** (canary releases for `@ai-sdk/react`; we ship vanilla). If the API stabilizes mid-sprint we may revisit; if it churns, no action.
- **Fly.io free-tier pressure** — `continuum-engine` runs on shared-cpu-1x 512MB. First paying customer triggers a paid plan.
- **DNS for `api.continuum.rest`** still pending (cert issued). Cosmetic; not a moat lever. Defer.
- **`ANTHROPIC_API_KEY` rotation policy** — currently a single Vercel-stored key, no rotation. Add to V1.3 hardening sprint, not this one.

---

_Bound by The Nine v0.1.0. Per P5: when this sprint plan and AGENTS.md
conflict, AGENTS.md wins. Per P9: each ticket above is a proposal; the
operator chooses what to start, in what order, and when to stop._

## Related

Sprint chain: [W24 →](./SPRINT-2026-W24.md) · Ledger: [STATUS](./STATUS-2026-05-29.md) · Hub: [INDEX](./INDEX.md) · Map: [router.md](../router.md)

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
