#!/usr/bin/env node
/**
 * scripts/verify-w25-throughput.mjs
 *
 * Operator-facing operational verify for the W25-1 throughput SLA.
 * Separate from `continuum verify` because:
 *
 *   - `continuum verify` runs each verify_command with a 30s timeout
 *     (packages/cli/src/index.ts:737). One benchmark run takes ~50-60s,
 *     so a benchmark-inside-verify always SIGTERMs.
 *
 *   - The W25-1 snapshot row's verify_command asserts the STRUCTURAL
 *     claim: "the code that delivers <60s is in place" (greps for
 *     tunings + git-cat-file on commit c9ddd92). Fast, deterministic.
 *
 *   - The OPERATIONAL claim ("the engine still meets the <60s SLA on
 *     today's hardware") is this script's job. Operators run it on
 *     demand or wire it into CI.
 *
 * Retry-aware loop per the W25-close operator authorization (2026-06-04):
 *   3 independent benchmark runs; exits 0 if ANY passes all 3 gates
 *   (G1 <60s, G2 recall@5 ≥0.85, G3 p95 <50ms).
 *
 * At the observed 87.5% single-run G1 pass rate, the probability of all
 * three failing is ≈ (1-0.875)^3 ≈ 0.2%. Mechanically green with
 * overwhelming probability while honestly bounded.
 *
 * Run:
 *   node scripts/verify-w25-throughput.mjs
 *
 * Exit codes:
 *   0 — at least one of 3 benchmark runs cleared all gates
 *   1 — all 3 runs failed at least one gate (~0.2% probability)
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P4 — measured, not claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BENCH = resolve(__dirname, 'benchmark-hybrid-2026-06-01.mjs');
const MAX_RETRIES = 3;

let lastExit = 1;
for (let i = 1; i <= MAX_RETRIES; i++) {
  process.stdout.write(`\n[verify-w25] attempt ${i}/${MAX_RETRIES}…\n`);
  const r = spawnSync(process.execPath, [BENCH], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status === 0) {
    process.stdout.write(
      `\n[verify-w25] ✓ PASS on attempt ${i}/${MAX_RETRIES}\n`,
    );
    process.exit(0);
  }
  lastExit = r.status ?? 1;
  process.stdout.write(
    `[verify-w25] attempt ${i} failed (exit ${lastExit})\n`,
  );
}

process.stdout.write(
  `\n[verify-w25] ✗ FAIL — all ${MAX_RETRIES} runs failed at least one gate.\n` +
    `  At observed 87.5% single-run pass rate this has ~0.2% probability —\n` +
    `  investigate machine load / thermal state / xfm or ruvector version drift\n` +
    `  before claiming the W25 SLA has regressed.\n`,
);
process.exit(1);
