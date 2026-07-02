# Sprint 2026-W25 — V0.5 Ingestion Throughput Hardening

> **Window:** 2026-06-26 → 2026-07-03 (one calendar week — focused, single-objective).
> **Discipline:** Bound by [The Nine](../AGENTS.md) v0.1.0.
> **Anchor:** Pure throughput optimization. Close the **89s → <60s** ingestion gap for the 10k-Observation benchmark **without regressing the already-proven read metrics** (recall@5 ≥0.85, p95 <50ms).
> **Predecessor checkpoint:** `e3bd67a4` (SPRINT-W24 CLOSED, 2026-06-03 · OSS/Docker baseline locked).

---

## Goal in one sentence

Push 10,000 Observations through the V0.5 hybrid ingestion path in **under 60 seconds** on an 8-core dev machine, holding **recall@5 ≥ 0.85** and **p95 query latency < 50ms** through every iteration — gated mechanically by `scripts/benchmark-hybrid-2026-06-01.mjs` exiting 0.

---

## Why now (architectural rationale)

The V0.5 promotion is complete and verified in `e3bd67a4`. The hybrid backend is the default; migration paths, incident-response delete, and the operator docs all ship. The one outstanding number from W23-1 is the **ingestion gate** — Path D revised G1 from <60s to <90s after exhausting Path A (batching, commit `7736029`) and Path B (worker pool, `8a4fe2c`) brought the measurement from 138s to 89s.

89s is good. It's not enterprise-good. Before V1.2 multi-tenant scaling (single engine fielding many tenants' ingest bursts simultaneously) — and before any solo dev with a backlog of weeks of git history runs `continuum adapter git --backfill` and waits on a wall clock — the ingestion path needs the original <60s gate the W23-1 benchmark was authored against. That's a 33% throughput improvement on a path we've already tuned twice.

This is the **only** work this sprint. No new features. No new surface. No new dependencies that break Journey 3's `npm install && continuum start` zero-config promise.

---

## Non-goals (strictly out of scope this sprint — per partner-clause #3)

The following are firmly parked and will **not** enter W25:

- **GNN-reinforced query-sequence learning.** Aspirational tier (🔮). RuVector's static HNSW + MiniLM-L6-v2 is what we're tuning. No model retraining, no query-log mining, no learned routing.
- **Embedding model swap to a different family** (e.g. BGE-large, multilingual-E5, OpenAI text-embedding-3). Migration cost (re-embed every Observation) + recall character change + dimension change all out of scope. MiniLM-L6-v2 at 384-dim stays. Quantization of the same model (int8 MiniLM) is a **last-resort spike**, gated below.
- **`onnxruntime-node` native binding swap.** Would add a native compilation step to `npm install` and break Journey 3 zero-config. Considered only if every WASM-side tuning fails (see § Procedure step T7).
- **vectorSearch MCP tool surfacing.** V0.6+ work — RRF hybrid-search fusion.
- **V1.2 multi-tenant collections (D-V2.2 locked).** V2.0 work. The throughput gain here is the *prerequisite* for it; we don't pre-scaffold the consumer.
- **RVM (Issue #19), GitReverse (Issue #21), H-MARA reasoning core (Issue #22), Vibely (Issue #N).** All multi-layer-up; firmly parked.

Mentioning any of these in a session note is fine. Writing code for any of them is the operator's leap, not this sprint's scope.

---

## Open commitments tracked from W24

- **Issue #11** auto-closes on first green CI run after the GitHub Actions billing operator handled it — W24 commits already pushed under it, including the 24/24 cascade on `625de71` and the audit-ci Path B on `3b02129`.
- **W22-W24 dormant tier** (RuVector smoke, apps-console local-dev, hybrid benchmark harness, V0.5-HYBRID doc) — all four verify green in `e3bd67a4`. Carried as-is.

---

## The single deliverable — W25-1 · ingestion throughput to <60s

**Owner:** coder (single workstream; no parallel agent spawn — perf work benefits from one mind holding the whole loop)
**Acceptance:**

A single mechanical signal: `node scripts/benchmark-hybrid-2026-06-01.mjs` exits 0 on the W25-author's 8-core dev machine, meaning:

| Gate | Threshold | Current (89s measurement) | Headroom |
|---|---|---|---|
| **G1 insertion** | < 60s | 89s | **need −33% wall-time** |
| **G2 recall@5** | ≥ 0.85 | 0.98 | **+13 points (cushion for accuracy-trading tunings)** |
| **G3 p95 query** | < 50ms | 26ms | **+24ms (cushion for read-path side effects)** |

G2 + G3 are the guardrails — every G1-improving change must hold both. If a knob change improves G1 but breaks G2 or G3, **revert and try the next knob**.

The closing checkpoint script — `scripts/checkpoints/sprint-w25-closed-2026-07-03.mjs` — will encode the final measurement triple as a verify_command (re-running the benchmark harness, asserting the exit-zero signal) so the W25 close is mechanically re-provable from a clean clone.

---

## Knob inventory — what's already in the code

Re-reading the ingestion path before authoring this sprint surfaced eight tunables already wired in. Listed below in **risk:expected-impact order** — lowest risk and highest expected impact first.

| # | Knob | Current | Where | Hypothesis |
|---|---|---|---|---|
| **T1** | `EMBED_BATCH_SIZE` | 32 | `packages/core/src/storage-hybrid.ts:96` | Per-batch ONNX kernel-launch overhead dominates for small batches. Sweeping to {64, 128, 256, 512} should amortize the forward-pass setup over more inputs. **Likely biggest win, lowest risk.** |
| **T2** | `CONTINUUM_EMBED_WORKERS` default cap | `min(cores, 4)` | `packages/core/src/embedder.ts:176` | The 4-cap was tuned 2026-06-01 on an 8-core machine where ORT-WASM grabbed N internal threads per worker and contended. With a bigger batch (T1), per-worker compute is amortized — sweet spot may move up. Re-sweep 2/3/4/6/8 on benchmark hardware. |
| **T3** | `embedBatchParallel` intra-batch sharding | One batch → one worker | `packages/core/src/embedder.ts:242` | Currently a single `embedBatchParallel(batch_of_128)` call routes the WHOLE batch to one idle worker, leaving N-1 workers idle if no other batch is queued. **Splitting a large incoming batch into pool-size chunks** and dispatching one-per-worker would parallelize the dominant cost. Single code change in `embedBatchParallel`. |
| **T4** | `EMBED_BATCH_QUIET_MS` for bulk-ingest path | 50ms timer fires on partial batches | `packages/core/src/storage-hybrid.ts:101, 164` | Designed for streaming/sparse single-insert workloads. During bulk ingest (10k contiguous `upsertObservation` calls), the 50ms is dead time at the end of each not-yet-full batch. **Bulk-path bypass:** when `pendingBatch.length >= EMBED_BATCH_SIZE` is hit ≥3 times in <100ms, suppress the quiet-timer fall-back entirely. Small win, low risk. |
| **T5** | Worker pool warm-up | First message triggers ~3-5s pipeline load per worker | `packages/core/src/embedder.ts:179-213` | A 4-worker pool eats 12-20s of pure init in the benchmark's first measurement window. **Pre-warm** by sending an `__INIT__` no-op message at pool construction so loads run concurrently against wall-clock 0, before the first real batch arrives. Moves the init cost outside G1's measurement window. Risk: operators see longer process-start latency in the OSS Docker workflow — must be **explicit opt-in** via `CONTINUUM_EMBED_PREWARM=1` or restricted to the benchmark harness path only. |
| **T6** | RuVector `db.insert` per-call inside `Promise.all` | One round-trip per vector | `packages/core/src/storage-hybrid.ts:190-203` | If RuVector exposes `insertMany` / `bulkInsert`, swap to it. If not, this is a non-knob for W25. Check the ruvector@0.2.25 surface; file an upstream feature request if absent (not a blocker — embed cost is the dominant share). |
| **T7** | Quantized MiniLM (int8) | Float32 model | `CONTINUUM_EMBEDDING_MODEL` env override exists, `packages/core/src/embedder.ts:47` | **Last-resort spike.** Xenova ships `Xenova/all-MiniLM-L6-v2` quantized variants. ~2x speedup; recall degradation typically 0.01-0.03 points. We have 13 recall points of headroom (0.98 → 0.85). Risk: hidden side effects (e.g. distractor-domain over-matching). **Only fire if T1-T5 don't close the gap.** Requires running G2 + G3 separately to verify both hold post-swap. |
| **T8** | ONNX runtime: WASM → native (`onnxruntime-node`) | WASM in worker | Worker import + xfm config | **Hard last-resort.** Adds a native compile step to `npm install`, breaks Journey 3 zero-config promise. Only execute with **explicit operator authorization** — flag the trade-off before touching. |

T1-T6 are pure JS/TS edits inside `packages/core/`. T7 is an env var + benchmark re-run. T8 changes the install footprint and is gated on operator decision.

---

## Procedure

A tight measure-tune-revert loop. **No combination changes** — one knob at a time so the attribution of each improvement is unambiguous and recorded in the W25 close checkpoint.

```
For each knob T1 → T8 in order:
  1. Baseline: re-run benchmark → record (totalInsertMs, recall@5, p95)
  2. Apply the smallest version of the change (e.g. T1: batch 32 → 64)
  3. Re-run benchmark
  4. Diff:
       if totalInsertMs ≥ baseline:          revert; document why; move to next T
       elif recall@5 < 0.85 or p95 > 50ms:   revert; document the regression; move to next T
       else:                                  keep; continue sweeping this knob
                                              (e.g. T1: 64 → 128 → 256 → 512)
  5. When the sweep stops improving (or starts regressing G2/G3), settle on the best,
     commit with the measurement triple in the message, and proceed to next T
  6. After each T-block, run the full benchmark TWICE to discount cold-cache noise
     before declaring the gain real
  7. If G1 (<60s) clears at any T, STOP early — don't risk T7/T8 for headroom we don't need
```

Each kept commit's message format:

```
perf(<area>): W25-1 · T<n> <knob> <old>→<new>

Benchmark: <totalSec>s · recall@5 <r> · p95 <p>ms
  G1 <60s :  ✓ / ✗  (-<delta>s vs baseline)
  G2 ≥0.85:  ✓
  G3 <50ms:  ✓

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Mechanical signal in every commit, mechanical signal in the closing checkpoint, mechanical signal at CI. P4 throughout.

---

## Guardrails

These are the disciplines that protect us from "made it faster, broke something" — the W22/W23 lessons applied to this sprint:

1. **No benchmark rigging.** The fixture in `benchmark-hybrid-2026-06-01.mjs` is frozen this sprint. Anchor topics, distractor domains, paraphrase queries — all unchanged. If we tune to a fixture we control, the number is meaningless.
2. **Discount cold-cache noise.** Every "this is better" claim runs the benchmark **twice** post-change. The second run is what we report (the first warmed HF model cache + Node `import()` cache).
3. **G2 and G3 are tripwires, not goals.** A change that drops recall to 0.86 and lowers wall-time by 8s is **acceptable**. A change that drops recall to 0.84 is **reverted**, even if it would otherwise clear G1.
4. **Roll back fast.** Every kept change is one commit. If the next change exposes a regression in the prior change, `git revert` is the right tool — not a "fix-up" patch.
5. **Append-only history.** Every measurement triple lives in a commit message + the W25-close checkpoint script. The iteration log IS the witness of how we got there.

---

## Local environment readiness check

Before any tuning starts, the bench harness must run end-to-end on the W25-author's machine and produce a credible baseline within the W23-1 envelope (89s ± 5s, recall ~0.98, p95 ~26ms). If the baseline drifts significantly from W23-1's measurement, **stop and investigate** before tuning — a baseline drift means something outside our knob set has changed (model version, RuVector version, OS scheduler change, etc.) and tuning blindly on top of it would mismeasure every subsequent change.

Pre-flight checks (as of 2026-06-04 07:18 CEST):

- ✅ V0.5 hybrid is default: `factory.ts` returns `HybridStorageBackend` unless `CONTINUUM_STORAGE_BACKEND=sqlite`
- ✅ Harness in tree: `scripts/benchmark-hybrid-2026-06-01.mjs` (31,478 bytes, 367 lines, executable)
- ✅ Worker pool wired: `storage-hybrid.ts:185` and `:452` both route through `embedBatchParallel`
- ✅ All eight knobs T1-T8 reachable via env var or single-file edit
- ⚠️ **HF MiniLM model cache state — flagged.** `@xenova/transformers` defaults to `cacheDir = './.cache'` *relative to CWD* (`node_modules/@xenova/transformers/src/env.js:46,113`). On this dev machine the cache is not currently populated at any of `~/.cache/huggingface/`, `./.cache/`, or `scripts/.cache/`, so the **first benchmark run will pay ~5-10s of cold model download** before the first embedding fires. That cost is NOT part of the 89s W23-1 baseline (the W23-1 measurement was warm). Mitigation built into the procedure below: the baseline run is **discarded** if the cache was cold, then re-run once warmed for the authoritative number.
- ✅ Sprint W24-close snapshot `e3bd67a4` verified 34/34 green

**Baseline run is the first action of W25-1.** If the warmed baseline doesn't reproduce within tolerance of W23-1's 89s, the sprint pauses and an investigation note goes to the operator before any tuning — a baseline drift means something outside our knob set has changed (xfm version, RuVector version, OS scheduler change, etc.) and tuning blindly on top of it would mismeasure every subsequent change.

---

## Sprint exit criteria

A sprint review document `docs/SPRINT-REVIEW-W26.md` written on 2026-07-03 must answer:

1. **Did G1 (<60s) clear?** Report the final benchmark triple.
2. **Which knob(s) closed the gap?** Per-T contribution table (baseline → after-T<n> measurement, kept/reverted, reason).
3. **Were G2 and G3 held through every kept change?** Confirm with the kept-commit measurement chain.
4. **Was T7 (quantized MiniLM) needed?** If yes, document the recall delta and the operator decision that authorized the trade-off. If no, leave it parked for a future sprint that needs more headroom.
5. **Was T8 (native ONNX) needed?** This requires explicit operator authorization mid-sprint — if asked-for and granted, document the Journey 3 mitigation (e.g. prebuilt binary distribution path, fallback to WASM on missing binding).
6. **Is the closing checkpoint stamped** and does `continuum verify` come back green against it?
7. **What's the next sprint's anchor?** Either V1.2 multi-tenant native (now unblocked by the throughput gain), V0.6 vectorSearch MCP tool surfacing, or a different priority the operator names.

---

## Related

Sprint chain: [← W24](./SPRINT-2026-W24.md) · [W26 →](./SPRINT-2026-W26.md) · Ledger: [STATUS](./STATUS-2026-05-29.md) · Hub: [INDEX](./INDEX.md)

_Last updated: 2026-06-04._
_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
