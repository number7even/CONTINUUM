#!/usr/bin/env node
/**
 * scripts/burst-test-w27-5.mjs
 *
 * Quantify the per-open-tenant memory cost of HybridStorageBackend
 * BEFORE building the W27-5 TenantRegistry LRU cache. Operator
 * discipline (W25 / W26 / W27): measure first, then tune the threshold
 * from real data — don't guess CONTINUUM_MAX_OPEN_TENANTS.
 *
 * Methodology:
 *   1. Record baseline RSS + heap immediately after `import` of the
 *      core module (embedder code loaded but not initialised).
 *   2. Open 10 hybrid backends sequentially with distinct tenant IDs.
 *      For each backend, do one upsertObservation + one
 *      flushVectorWrites so the lazy-loaded layers (RuVector binding,
 *      @xenova/transformers worker pool) actually warm up.
 *   3. Measure RSS + heap after each open. Per-tenant delta = first
 *      derivative; the steady-state slope is the answer.
 *   4. Close all backends; force GC if exposed (--expose-gc).
 *   5. Print per-step table + derive recommended
 *      CONTINUUM_MAX_OPEN_TENANTS for the 512MB Fly ceiling.
 *
 * Run:
 *   node --expose-gc scripts/burst-test-w27-5.mjs
 *
 * Exit codes:
 *   0 — measurements collected successfully
 *   1 — measurement infrastructure failed (not an SLA failure)
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P2 — measured, not claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FACTORY = resolve(REPO_ROOT, 'packages/core/dist/factory.js');

const TMP = mkdtempSync(join(tmpdir(), 'continuum-w27-burst-'));
process.env.CONTINUUM_DATA_DIR = TMP;
// Force HYBRID backend — that's the real per-tenant cost (sqlite alone
// would understate, but is the floor).
process.env.CONTINUUM_STORAGE_BACKEND = 'hybrid';

const FLY_512_CEILING_MB = 512;
const FLY_BASE_OVERHEAD_MB = 80; // node runtime + http server + misc.

function rssMB() {
  return process.memoryUsage().rss / 1024 / 1024;
}
function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}
function measure(label) {
  return { label, rss: rssMB(), heap: heapMB() };
}

const measurements = [];

measurements.push(measure('00. process-start (pre-import)'));

const { openStorage } = await import(FACTORY);

measurements.push(measure('01. core-imported'));

const TENANT_COUNT = 10;
const backends = [];

for (let i = 0; i < TENANT_COUNT; i++) {
  const tenantId = `burst-tenant-${String(i).padStart(2, '0')}`;
  const s = openStorage(tenantId);
  // Trigger lazy loads: write 1 observation + flush vector queue. First
  // iteration pays the embedder + worker-pool warm-up; subsequent
  // iterations should only pay their own per-tenant overhead.
  s.upsertSource(`mem:${tenantId}`, 'mem');
  const obs = s.insertObservation({
    sourceId: `mem:${tenantId}`,
    type: 'note',
    content: `burst-test observation for ${tenantId} — triggers the lazy embedder + vector load on iteration 0.`,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: { tenant: tenantId, burst: true },
  });
  if (!obs) {
    process.stderr.write(`[burst] tenant ${tenantId} insert returned null\n`);
    process.exit(1);
  }
  // HybridStorageBackend.flushVectorWrites is the public primitive that
  // waits for the embedder + ruvector insert to settle.
  const hybrid = s;
  if (typeof hybrid.flushVectorWrites === 'function') {
    await hybrid.flushVectorWrites();
  }
  backends.push(s);
  measurements.push(measure(`02.${String(i + 1).padStart(2, '0')}. after open tenant ${i + 1}/${TENANT_COUNT}`));
}

measurements.push(measure(`03. all ${TENANT_COUNT} tenants open + warm`));

// Close all + force GC so we see the steady-state floor.
for (const b of backends) {
  try {
    b.close();
  } catch (err) {
    process.stderr.write(`[burst] close failed: ${err.message}\n`);
  }
}
if (typeof global.gc === 'function') {
  global.gc();
  global.gc(); // second pass to settle weak refs
}
measurements.push(measure('04. all closed (post-GC)'));

// ── Reporting ────────────────────────────────────────────────────────────────

process.stdout.write(
  `\n[w27-5 burst test] tmpdir=${TMP}\n` +
    `node version: ${process.version}\n` +
    `gc exposed:   ${typeof global.gc === 'function'}\n\n`,
);

process.stdout.write(
  `step                                                 rss (MB)   heap (MB)   Δrss\n`,
);
process.stdout.write(`${'─'.repeat(89)}\n`);
let prevRss = 0;
for (const m of measurements) {
  const delta = m.label === measurements[0].label ? 0 : m.rss - prevRss;
  const deltaStr = delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
  process.stdout.write(
    `${m.label.padEnd(52)}${m.rss.toFixed(1).padStart(8)}    ${m.heap.toFixed(1).padStart(8)}    ${deltaStr.padStart(6)}\n`,
  );
  prevRss = m.rss;
}

// Compute steady-state per-tenant cost from iteration 2..N (skip
// iteration 1 — that's where the worker pool + embedder warm-up lands).
const openMeasurements = measurements.filter(m => m.label.startsWith('02.'));
const firstOpen = openMeasurements[0];
const tenthOpen = openMeasurements[openMeasurements.length - 1];
const incrementalPerTenant =
  openMeasurements.length >= 2
    ? (tenthOpen.rss - openMeasurements[1].rss) / (openMeasurements.length - 2)
    : NaN;
const firstTenantCost = firstOpen.rss - measurements[1].rss; // post-import baseline

process.stdout.write(
  `\nDerived per-tenant memory cost:\n` +
    `  first tenant       (cold; loads embedder + pool):  ${firstTenantCost.toFixed(1)} MB\n` +
    `  steady-state slope (tenant 2..${openMeasurements.length}):              ${incrementalPerTenant.toFixed(2)} MB per tenant\n`,
);

const baselineWithFirstTenant = openMeasurements[0]?.rss ?? rssMB();
const budgetForMore =
  FLY_512_CEILING_MB - FLY_BASE_OVERHEAD_MB - baselineWithFirstTenant;
const recommendedExtra =
  incrementalPerTenant > 0
    ? Math.floor(budgetForMore / incrementalPerTenant)
    : NaN;
const recommendedCap = 1 + Math.max(0, recommendedExtra);

process.stdout.write(
  `\nFly shared-cpu-1x 512MB ceiling math:\n` +
    `  ceiling                              : ${FLY_512_CEILING_MB} MB\n` +
    `  reserved (node + http + headroom)    : ${FLY_BASE_OVERHEAD_MB} MB\n` +
    `  cost of 1 tenant warm                : ${baselineWithFirstTenant.toFixed(1)} MB\n` +
    `  remaining for additional tenants     : ${budgetForMore.toFixed(1)} MB\n` +
    `  per-additional-tenant slope          : ${incrementalPerTenant.toFixed(2)} MB\n` +
    `  → derived CONTINUUM_MAX_OPEN_TENANTS : ${recommendedCap}\n` +
    `    (1 first + ${recommendedExtra} additional that fit in budget)\n`,
);

rmSync(TMP, { recursive: true, force: true });
process.exit(0);
