# Sprint 2026-W26 — V1 Swarm Aggregation (ruv-swarm ephemeral ingestion)

> **Window:** 2026-07-03 → 2026-07-17 (two calendar weeks).
> **Discipline:** Bound by [The Nine](../AGENTS.md) v0.1.0.
> **Anchor:** Transition the 5-source ingestion pipeline from linear, single-threaded scripts to **ephemeral ruv-swarm agents** that ingest → normalise → resolve conflicts → commit → dissolve, per ARCHITECTURE.md §10a (V1 Neural Capability Layer).
> **Predecessor checkpoint:** `83faa040` (SPRINT-W25 CLOSED, 2026-06-05 · V0.5 throughput hardened to 53.4s median).

---

## Goal in one sentence

Replace the linear `for (const x of inputs) await upsertObservation(x)` ingestion path in each source adapter with an **ephemeral ruv-swarm** that spawns at ingest-start, orchestrates concurrent normalisation across a topology matched to the source's cognitive structure, votes on conflicts via Byzantine-majority consensus at the CONTINUUM aggregation layer, commits the batch through the W25-hardened `HybridStorageBackend.insertObservationsBulk`, and immediately calls `swarm.terminate()` to dissolve — with the entire lifecycle gated by tests that fail on any orphan agent or pre-commit leak.

---

## Why ruv-swarm now (architectural rationale)

`83faa040` proves the V0.5 hybrid backend ingests 10,000 observations in 53.4s (G1<60s) on a single-threaded source feeder. That number is the **engine** throughput; the **adapter** throughput is currently bottlenecked elsewhere — `adapter-git` walks `git log` sequentially, `adapter-docs` walks the markdown tree sequentially, and `adapter-export` parses JSONL session transcripts one turn at a time. When multi-tenant V1.2 lands and a single engine fields five tenants each running `continuum adapter docs --backfill` concurrently, the linear adapter path will serialise them at the source-read level long before the storage layer feels load. Per the W25→W26 directive: **scaling the engine without scaling the source path is solving the wrong problem.**

Ephemeral ruv-swarm agents address this at three layers simultaneously:

1. **Concurrency** — a swarm of N agents reads N independent slices of the source in parallel (e.g. `adapter-git` shards by commit-hash prefix, `adapter-docs` shards by file-tree branch).
2. **Conflict resolution** — when two agents derive different normalised forms for the same observation (different timestamp parsing, different content excerpt boundaries, etc.), a Byzantine-majority vote at the CONTINUUM aggregation layer picks the winning form deterministically rather than letting last-write-wins corrupt the history.
3. **Lifecycle discipline** — `swarm.terminate()` after every batch enforces the verify-then-dissolve invariant ARCHITECTURE.md §3 names as foundational. No long-lived adapter daemons holding open file handles or accumulating drift between scheduled runs.

Building V1.2 multi-tenant native before this lands would create exactly the derived complexity partner-clause #3 was written to detect: a tenancy layer over a sequential ingestion path would have to be retrofitted into concurrent shards in V1.3, breaking every adapter's API in the process.

---

## Honest findings from the ruv-swarm@1.0.20 API probe (2026-06-05)

I probed the package surface before writing this spec rather than assume. Three findings the spec is built around:

### ✅ Topologies are real and configurable

`RuvSwarm.createSwarm({ topology: 'mesh' | 'ring' | 'hierarchical' | 'star', maxAgents: N, ... })` — confirmed in README + source. Topology selection per source is mechanically supported.

### ✅ Verify-then-dissolve is native

`Swarm.prototype` exposes exactly the lifecycle the operator named:
- `spawn` (instantiate agents into the topology)
- `orchestrate` (execute the assigned work)
- `getStatus` / `monitor` (progress + health)
- **`terminate`** (the dissolve primitive — the constraint we'll enforce in every adapter)

`Agent.prototype` exposes `execute`, `getMetrics`, `updateStatus`. The metric surface lets us assert post-hoc that no agent leaked compute past `swarm.terminate()`.

### ⚠️ Byzantine consensus is NOT a ruv-swarm primitive

The operator's close-directive named "Byzantine fault-tolerant consensus to agree on the facts." The probe confirmed: ruv-swarm provides **topology + lifecycle + orchestration + neural agents**. It does NOT ship a built-in BFT voting protocol. The README discusses "collective learning" but the methods list has no `vote`, `propose`, `commit`, or `byzantineRound` primitive.

**Implication for the spec:** Byzantine voting lives at the **CONTINUUM aggregation layer**, not inside ruv-swarm. Each adapter's swarm produces N candidate normalisations per input; the aggregator collects all N, runs majority voting (with deterministic tiebreaker — see W26-4), and submits the winning observation to the storage backend. This is honest about what we're building vs. what we're consuming.

### ⚠️ COGNITIVE_PATTERNS ≠ network topology

ruv-swarm's `COGNITIVE_PATTERNS` export (`CONVERGENT`, `DIVERGENT`, `LATERAL`, `SYSTEMS`, `CRITICAL`, `ABSTRACT`) describes **per-agent thinking styles**, NOT network topology. The operator's mapping (mesh for docs/mem, ring for git/sona, hierarchical for export) lands on the `topology` config — confirmed correct. The cognitive-pattern axis is orthogonal: per-source we MAY also choose a default cognitive pattern (e.g. `SYSTEMS` for git history because chronology is systemic, `LATERAL` for docs because cross-reference is associative). Calling this out so we don't conflate them in the implementation.

### ✅ Journey 3 zero-config: COMPATIBLE

`ruv-swarm@1.0.20` adds **three transitive deps** (`better-sqlite3` which we already have, `uuid`, `ws`). Engine = node >=18.20.8 (we're on 20+). WASM-based — no native compilation beyond what we already have. ESM module type — matches our packages. `npm install` footprint stays modest. The zero-config promise holds.

---

## Non-goals (strictly out of scope this sprint — per partner-clause #3)

- **V1.2 multi-tenant native** — this sprint is the *prerequisite* for it; we don't pre-scaffold the consumer.
- **The `mem` adapter** — no source adapter exists for the `mem` source type yet (the schema has it; no ingest code does). Adding one is out of scope; the `mem` line in the operator's topology mapping is informational only this sprint.
- **Neural-agent training** — ruv-swarm exports `NeuralAgent` + `NeuralNetwork`. We use the **non-neural** `Agent` class this sprint. Neural-augmented agents are V1.5+ territory (queued for the V1.5 anchor that Issue #1 DSPy.ts proposes).
- **`vectorSearch` MCP tool surfacing** — V0.6+ work (RRF hybrid-search fusion).
- **MCP `swarm_init` tool surfacing** — the operator-facing CONTINUUM MCP surface doesn't grow this sprint. Swarms are an internal adapter implementation detail.
- **RVM / GitReverse / H-MARA / Vibely / Ruflo / TaskmasterAI / DSPy.ts / RecursiveMAS / MidStream / Mike / Agentic-Jujutsu / Genzil** — all multi-layer-up; firmly parked. Open Issues #1-#7, #19, #21, #22 stay in proposal state.
- **`continuum adapter mem` CLI command** — depends on the (out-of-scope) mem adapter.

Mentioning any of these in a session note is fine. Writing code for any of them is the operator's leap, not this sprint's scope.

---

## Open commitments tracked from W25

- **`scripts/verify-w25-throughput.mjs`** stays as the operational SLA verify. Each W26 deliverable must run it post-merge and confirm the 53.4s median holds (i.e. the W26 work doesn't regress the W25 win).
- The hardened `EMBED_BATCH_SIZE=128` + `EMBED_BATCH_QUIET_MS=200` + `db.insertBatch` path stays the storage write target for every swarm batch. Adapters call `insertObservationsBulk` (not per-row `insertObservation`) to keep the win.

---

## The deliverables

### W26-1 · Land ruv-swarm as a dependency + Journey 3 verification

**Owner:** coder
**Acceptance:**

- `ruv-swarm@^1.0.20` added to `packages/adapters/*/package.json` (or a shared `packages/swarm-runtime/` workspace if we factor it — see Procedure for the decision).
- Fresh-clone smoke: `rm -rf node_modules && npm install` completes without compilation prompts, native-build failures, or peer-warning storms. Document the install delta (added MB, install seconds delta vs. W25-close).
- A new dormant entry in the next checkpoint: `ruv-swarm-runtime-available` — verifies the package resolves and `RuvSwarm.initialize()` succeeds via a 5-line probe script.
- README footnote on the install-size delta so operators know what to expect.

**Estimate:** 1 commit · ~2 hours (mostly verification).

---

### W26-2 · Replace linear ingestion with ephemeral swarms (adapter-docs first)

**Owner:** coder
**Acceptance:**

- New `packages/adapters/docs/src/swarm-ingest.ts` (or refactored `index.ts`) replaces the existing sequential `for (const file of files) await upsertObservation(...)` with:

  ```ts
  const swarm = await ruv.createSwarm({ topology: 'mesh', maxAgents: N });
  await swarm.spawn(N);
  const candidates = await swarm.orchestrate({
    work: shardedFiles,
    perAgent: 'normaliseAndExtract',
  });
  // candidates: Array<{ inputId, agentId, normalised: ObservationDraft }>
  const winners = byzantineVote(candidates);          // W26-4
  storage.insertObservationsBulk(winners);            // W25 hardened path
  await swarm.terminate();                            // verify-then-dissolve
  ```

- All existing `adapter-docs` integration tests pass against the new path. **No semantic regression:** the same input directory produces the same set of Observation IDs and the same content after the swarm path as the linear path did.
- A new test asserts `swarm.terminate()` was called exactly once and that `swarm.getStatus()` reports zero living agents post-call.
- `adapter-docs` ships first because it has the simplest source (a tree of markdown files), the most independent shards (file boundaries are natural), and the smallest blast radius if the design has rough edges.

**Estimate:** 2-3 commits · ~6 hours.

---

### W26-3 · Cognitive topology wiring (per-source topology selection)

**Owner:** coder
**Acceptance:**

- `packages/adapters/git/` lands the swarm pattern with `topology: 'ring'` — agents process commits in chronological order, each agent passing its terminal state to the next agent in the ring (enforces the operator-named "strict chronological coherence" constraint).
- `packages/adapters/export/` lands the swarm pattern with `topology: 'hierarchical'` — root agent reads the JSONL session header, children parse turn-by-turn nested structure (matches the JSONL transcript's nested shape).
- Per-source topology selection lives in one place: a `topologyFor(sourceType)` helper that returns `{ topology, maxAgents, cognitivePattern }` so the choice is auditable in one file.
- Documentation: a short table in `docs/V0.5-HYBRID.md` (or a new `docs/V1-SWARM-AGGREGATION.md` if it grows beyond 30 lines) listing each source's topology choice with the one-sentence rationale.
- **Honest:** the `mem` and `sona` adapters do not exist yet, so this sprint cannot wire them. The `topologyFor` helper has the planned mappings (mesh for mem, ring for sona) commented but inert.

**Estimate:** 3 commits (one per adapter + one for the helper) · ~8 hours.

---

### W26-4 · Byzantine-majority voting at the aggregation layer

**Owner:** coder
**Acceptance:**

- New `packages/core/src/byzantine-vote.ts` — pure function `byzantineVote(candidates: Candidate[]): Observation[]`:
  - Groups candidates by `inputId` (the source-level identifier — file path, commit SHA, session-turn ID).
  - Per group, picks the majority normalised form (≥ ⌈N/2⌉+1 agreement).
  - Deterministic tiebreaker: lowest agent-ID wins (ties only happen at exact even splits; reproducible).
  - Logs all minority dissents to a side-channel audit observation with `type: 'aggregation_dissent'` so we can investigate divergence later without polluting the canonical observation set.
- Tolerates `f < ⌈N/3⌉` faulty agents per group (the classical BFT bound) — verified by a property-test that injects `f` random-garbage candidates and asserts the canonical form still wins when `f < N/3`.
- **Honest:** this is NOT cryptographic BFT (no signing, no Merkle round). It is **deterministic majority voting** over independent agent outputs, which is the practically useful subset of BFT for this single-process aggregation pattern. Naming it "Byzantine-majority" rather than "Byzantine consensus" to keep the claim accurate.

**Estimate:** 1 commit + tests · ~4 hours.

---

### W26-5 · Verify-then-dissolve enforcement (architectural invariant)

**Owner:** coder
**Acceptance:**

- A new `node --test` file `packages/core/src/swarm-lifecycle.test.ts` asserts the invariant across all three adapters:
  1. Every adapter ingest call MUST end with `swarm.terminate()` exactly once.
  2. Post-terminate, `swarm.getStatus()` returns zero `living` agents.
  3. Process-level: a `weakref`/finalisation hook fires on the swarm object within one GC cycle after terminate (detects accidental capture by closures keeping the swarm alive).
  4. Throw-path: if `swarm.orchestrate()` throws, the `finally` block in the adapter STILL calls `terminate()` — no orphan agents on error paths.
- New static check in CI: a grep rule that fails the build if any file in `packages/adapters/` imports `ruv-swarm` but doesn't reference `terminate` in the same module.
- One reproducible-witness script `scripts/verify-w26-swarm-lifecycle.mjs` that spawns 50 swarms in sequence, runs each through a deterministic input, and asserts process RSS doesn't drift more than ±10MB over the 50 runs (detects long-tail leaks the unit tests miss).

**Estimate:** 1 commit · ~3 hours.

---

## Procedure

A workstream sequencing decision rather than a measure-tune loop (W26 is a structural sprint, not a perf sprint):

1. **W26-1 first** (~half day) — land the dependency, run zero-config check, document the install delta. Do not proceed to W26-2+ until Journey 3 is verified holding.
2. **W26-4 second** (~half day) — implement Byzantine-majority voting + property tests as a PURE function with no swarm dependency. Tests use synthetic candidate arrays. This unblocks W26-2/W26-3 having a known-good aggregation primitive to call into.
3. **W26-2 third** (~full day) — refactor `adapter-docs` first as the simplest case. Get the swarm spawn/orchestrate/vote/commit/terminate cycle proven end-to-end on one adapter before generalising.
4. **W26-3 fourth** (~full day) — clone the W26-2 pattern to `adapter-git` (ring) and `adapter-export` (hierarchical). One commit per adapter so per-adapter regressions are bisect-isolable.
5. **W26-5 fifth** (~half day) — write the lifecycle tests + the 50-swarm RSS-drift script. These should pass against the work landed in W26-2/W26-3.
6. **Operational SLA re-check** — run `node scripts/verify-w25-throughput.mjs` post-merge to confirm the 53.4s W25 median holds. The W25 closing checkpoint's verify_command still passes against the (unchanged) storage layer.

Workspace structuring decision (made first action of W26-1): if ruv-swarm code appears in multiple adapters, factor a `packages/swarm-runtime/` workspace exporting `createEphemeralSwarm({ topology, work, normaliser })` so we don't duplicate the spawn/orchestrate/vote/terminate boilerplate three times. If it's just a thin wrapper, leave it per-adapter and revisit.

---

## Guardrails

1. **Journey 3 zero-config promise.** `npm install` on a fresh clone must complete without compilation prompts. If ruv-swarm transitively pulls in a native build chain we don't already have, **stop and report** before proceeding past W26-1.
2. **W25 perf SLA unchanged.** Every PR runs the structural W25 verify (sub-second). Final close runs `verify-w25-throughput.mjs` to confirm the operational SLA still holds.
3. **No fixture rigging.** The integration tests use the same source content as the linear path's tests (real markdown files, real git history slices). The expected observation IDs and content are frozen.
4. **`swarm.terminate()` is non-negotiable.** Every adapter's swarm code path goes through the same `withEphemeralSwarm(opts, body)` helper (if W26-3 spawns the shared workspace) so `terminate()` lives in one `finally` block per code path. No exceptions.
5. **Honest Byzantine framing.** "Byzantine-majority voting" everywhere in code + docs. Never just "Byzantine consensus" — we don't ship cryptographic rounds this sprint.
6. **One-knob-at-a-time still applies.** Same W25 discipline: one structural change per commit, per-adapter measurement triple (insert-throughput, agent-RSS, terminate-latency) in the commit message.

---

## Local environment readiness check

Pre-flight checks (as of 2026-06-05 — to be re-run at W26 start):

- ✅ V0.5 hybrid is default and W25-hardened (snapshot `83faa040` verifies 35/35 green in 9s)
- ✅ `ruv-swarm@1.0.20` exists on npm and resolves to a WASM-based ESM package
- ✅ Topology API confirmed: `RuvSwarm.createSwarm({topology, maxAgents})` accepts `mesh`/`ring`/`hierarchical`
- ✅ Lifecycle API confirmed: `spawn` / `orchestrate` / `getStatus` / `monitor` / `terminate`
- ✅ Agent API confirmed: `execute` / `getMetrics` / `updateStatus`
- ⚠️ **Byzantine consensus is NOT a ruv-swarm primitive** — to be built at the CONTINUUM aggregation layer in W26-4. Spec accounts for this; "Byzantine-majority voting" naming used throughout.
- ⚠️ **`COGNITIVE_PATTERNS` ≠ network topology** — orthogonal axes; the spec uses `topology` for the operator's stated mesh/ring/hierarchical and treats cognitive patterns as a follow-on optimisation.
- ⚠️ **`mem` and `sona` adapters do not exist** — out of scope; `topologyFor()` carries planned mappings inert.
- ⚠️ Three transitive deps added (`uuid`, `ws`, `better-sqlite3` which we already have). Install footprint impact to be measured in W26-1.

**Baseline run is the first action of W26-1.** If `npm install` of `ruv-swarm` triggers a native compile prompt, breaks the Journey 3 dev loop, or balloons the install size by more than the W26-1 budget, the sprint pauses and an investigation note goes to the operator before any adapter code is touched.

---

## Sprint exit criteria

A sprint review document `docs/SPRINT-REVIEW-W27.md` written on 2026-07-17 must answer:

1. **Are all three adapters running on ephemeral swarms?** `adapter-docs` (mesh), `adapter-git` (ring), `adapter-export` (hierarchical). Each one's tests pass; each one's commit message carries a triple (input count, swarm-RSS peak, terminate-latency).
2. **Is the `swarm.terminate()` invariant mechanically enforced?** `swarm-lifecycle.test.ts` passes; the `verify-w26-swarm-lifecycle.mjs` 50-swarm RSS-drift script exits 0.
3. **Is `byzantineVote()` covered by property tests?** ≥1000 random-input trials per topology with `f < N/3` faulty candidates injected; majority always wins.
4. **Does the W25 SLA still hold?** `verify-w25-throughput.mjs` exits 0 — the W26 work introduced no regression in the storage path.
5. **Is Journey 3 still zero-config?** Fresh `git clone && npm install && continuum start` works in under 60 seconds on a clean machine. Documented.
6. **Is the closing checkpoint stamped** and does `continuum verify` come back green against it? Snapshot row for `v1-swarm-aggregation-w26` carries static greps + a git-cat-file proof of the canonical commit.
7. **What's the next sprint's anchor?** Either V1.2 multi-tenant native (now unblocked by concurrent ingestion), V0.6 vectorSearch MCP tool surfacing, V1.5 neural-agent integration (Issue #1 DSPy.ts), or another priority the operator names.

---

## Related

Sprint chain: [← W25](./SPRINT-2026-W25.md) · [W27 →](./SPRINT-W27.md) · Ledger: [STATUS](./STATUS-2026-05-29.md) · Hub: [INDEX](./INDEX.md)

_Last updated: 2026-06-05._
_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
