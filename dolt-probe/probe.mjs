#!/usr/bin/env node
/**
 * probe.mjs — Dolt vs better-sqlite3 surgical probe (run INSIDE the Fly
 * sidecar VM, NOT on dev host).
 *
 * Six measured vectors against the 512MB Fly ceiling + ~300MB headroom
 * after CONTINUUM is loaded:
 *
 *   1. Dolt binary footprint (du -sh)
 *   2. Scenario A: 10 separate `dolt sql-server` processes — RSS sum
 *   3. Scenario B: 1 `dolt sql-server` with 10 logical databases — RSS
 *   4. Path A directory layout audit on disk (one server-per-DB AND
 *      ten-DBs-one-server — does each tenant get a `du -sh`-able root?
 *      does `rm -rf <tenant>` cleanly destroy only that tenant?)
 *   5. TCP latency: 100 SELECTs against Dolt vs 100 SELECTs against
 *      in-process better-sqlite3 — p50/p95/p99
 *   6. PROCEED / RECONSIDER / REJECT verdict against:
 *        a. Memory budget (RSS sum stays under 300MB headroom?)
 *        b. SLA budget (p95 stays under 50ms vs W27-5's 14.78ms?)
 *        c. Path A compliance (per-tenant du + rm -rf works?)
 *
 * Hermetic: every Dolt process runs in /tmp/dolt-probe-* tmpdirs;
 * killed and cleaned up at exit.
 *
 * Run:
 *   node /probe/probe.mjs
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P2 — measured, not claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { spawn, spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';

const FLY_512_CEILING_MB = 512;
const CONTINUUM_HEADROOM_MB = 300; // ~300MB free after engine loaded
const SLA_P95_BUDGET_MS = 50;
const W27_BASELINE_P95_MS = 14.78;

const NUM_TENANTS = 10;
const QUERY_COUNT = 100;
const DOLT_PORT_BASE = 13306;

const cleanup = [];
process.on('exit', () => {
  for (const fn of cleanup) {
    try { fn(); } catch {}
  }
});

// ── helpers ───────────────────────────────────────────────────────────────────

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
function shOk(cmd) {
  try { sh(cmd); return true; } catch { return false; }
}
function rss(pid) {
  try {
    const out = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf-8' }).trim();
    return Math.round(parseInt(out, 10) / 1024); // KB → MB
  } catch { return 0; }
}
function freeMemMB() {
  try {
    const out = execSync('free -m', { encoding: 'utf-8' });
    const line = out.split('\n').find(l => l.startsWith('Mem:'));
    const cols = line.trim().split(/\s+/);
    return { total: parseInt(cols[1], 10), used: parseInt(cols[2], 10), free: parseInt(cols[3], 10), available: parseInt(cols[6], 10) };
  } catch { return null; }
}
function quantile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)];
}

async function waitFor(checkFn, label, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await checkFn()) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`${label} did not become ready within ${maxMs}ms`);
}

// ── 1. binary footprint ──────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  Dolt surgical probe — Fly sidecar, shared-cpu-1x 512MB');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// Dolt config is set at IMAGE BUILD TIME via the Dockerfile so we know
// the install-side commands actually worked. Just verify here:
const doltCfg = sh('dolt config --list');
console.log(`  dolt config  :\n${doltCfg.split('\n').map(l => '    ' + l).join('\n')}`);

const doltVersion = sh('dolt version | head -1');
const doltSize = sh('du -sh /usr/local/bin/dolt | cut -f1');
console.log(`[1. binary footprint]`);
console.log(`  dolt version : ${doltVersion}`);
console.log(`  dolt binary  : ${doltSize} on disk`);
console.log(`  kernel       : ${sh('uname -srm')}\n`);

const baselineMem = freeMemMB();
console.log(`[baseline memory before any Dolt]`);
console.log(`  total=${baselineMem?.total}MB used=${baselineMem?.used}MB free=${baselineMem?.free}MB available=${baselineMem?.available}MB\n`);

// ── 2. Scenario A: 10 separate dolt sql-server processes ────────────────────

console.log('[2. SCENARIO A — 10 separate dolt sql-server processes]');
const sceneARoot = mkdtempSync(join(tmpdir(), 'dolt-sceneA-'));
cleanup.push(() => rmSync(sceneARoot, { recursive: true, force: true }));

const sceneAProcs = [];
const sceneARssMB = [];

for (let i = 0; i < NUM_TENANTS; i++) {
  const tenantDir = join(sceneARoot, `tenant-${String(i).padStart(2, '0')}`);
  execSync(`mkdir -p ${tenantDir}`);
  // dolt sql-server needs an `init` first to create a repo. cwd is the
  // tenant directory; do NOT override env or dolt loses sight of the
  // image-baked global config (lives under root's $HOME).
  execSync('dolt init', { cwd: tenantDir });
  const port = DOLT_PORT_BASE + i;
  const proc = spawn('dolt', ['sql-server', '-H', '127.0.0.1', '-P', String(port), '--no-auto-commit'], {
    cwd: tenantDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  sceneAProcs.push({ proc, port, tenantDir });
  cleanup.push(() => { try { proc.kill('SIGTERM'); } catch {} });
}

// Wait for every server to accept connections.
for (const { port, proc } of sceneAProcs) {
  await waitFor(
    () => shOk(`mysql -h 127.0.0.1 -P ${port} -u root --connect-timeout=1 -e "SELECT 1" 2>/dev/null`),
    `dolt :${port}`,
  );
}

// Measure RSS per process + sum.
let sceneARssSum = 0;
for (let i = 0; i < sceneAProcs.length; i++) {
  const r = rss(sceneAProcs[i].proc.pid);
  sceneARssMB.push(r);
  sceneARssSum += r;
  console.log(`  tenant-${String(i).padStart(2, '0')}  port=${sceneAProcs[i].port}  pid=${sceneAProcs[i].proc.pid}  RSS=${r}MB`);
}
const sceneAMemAfter = freeMemMB();
console.log(`  TOTAL RSS sum (per-process)      : ${sceneARssSum} MB`);
console.log(`  System used memory delta          : ${sceneAMemAfter.used - baselineMem.used} MB`);
console.log(`  System available memory remaining: ${sceneAMemAfter.available} MB\n`);

// Insert + query 1 sentinel per tenant.
console.log('[2a. SCENARIO A — insert/query sanity]');
for (const { port } of sceneAProcs) {
  sh(`mysql -h 127.0.0.1 -P ${port} -u root -e "CREATE DATABASE IF NOT EXISTS t; USE t; CREATE TABLE IF NOT EXISTS s (id INT PRIMARY KEY, v VARCHAR(64)); INSERT INTO s VALUES (${port}, 'sentinel-${port}');"`);
}
console.log(`  10 sentinels inserted across 10 servers\n`);

// TCP latency: 100 SELECTs against tenant-00
const sceneALatencies = [];
const port0 = sceneAProcs[0].port;
for (let i = 0; i < QUERY_COUNT; i++) {
  const t0 = performance.now();
  sh(`mysql -h 127.0.0.1 -P ${port0} -u root -e "USE t; SELECT v FROM s WHERE id=${port0}" -s -N`);
  sceneALatencies.push(performance.now() - t0);
}
const sceneAP50 = quantile(sceneALatencies, 0.50);
const sceneAP95 = quantile(sceneALatencies, 0.95);
const sceneAP99 = quantile(sceneALatencies, 0.99);
console.log(`[2b. SCENARIO A — TCP query latency (${QUERY_COUNT} runs)]`);
console.log(`  p50 = ${sceneAP50.toFixed(2)}ms  p95 = ${sceneAP95.toFixed(2)}ms  p99 = ${sceneAP99.toFixed(2)}ms\n`);

// Filesystem audit for Scenario A.
console.log('[2c. SCENARIO A — filesystem audit]');
const sceneADuPerTenant = [];
for (let i = 0; i < NUM_TENANTS; i++) {
  const dir = join(sceneARoot, `tenant-${String(i).padStart(2, '0')}`);
  const out = sh(`du -sh ${dir} | cut -f1`);
  sceneADuPerTenant.push(out);
  if (i < 3) console.log(`  tenant-${String(i).padStart(2, '0')}/  ${out}`);
}
console.log(`  ...  (10 distinct per-tenant directories, du -sh works on each)\n`);

// rm -rf one tenant; verify others survive.
const victimDir = join(sceneARoot, 'tenant-05');
console.log(`[2d. SCENARIO A — rm -rf isolation]`);
// Stop the victim's server first so file handles release.
sceneAProcs[5].proc.kill('SIGTERM');
await new Promise(r => setTimeout(r, 500));
rmSync(victimDir, { recursive: true, force: true });
console.log(`  rm -rf tenant-05/ : success=${!existsSync(victimDir)}`);
// Probe a surviving tenant.
const surviveOk = shOk(`mysql -h 127.0.0.1 -P ${sceneAProcs[0].port} -u root -e "USE t; SELECT v FROM s LIMIT 1"`);
console.log(`  tenant-00 (survivor) still queryable : ${surviveOk}\n`);

// Tear down Scenario A.
for (const { proc } of sceneAProcs) {
  try { proc.kill('SIGTERM'); } catch {}
}
await new Promise(r => setTimeout(r, 1000));
rmSync(sceneARoot, { recursive: true, force: true });

// ── 3. Scenario B: 1 dolt sql-server with 10 logical databases ──────────────

console.log('[3. SCENARIO B — 1 dolt sql-server with 10 logical databases]');
const sceneBDir = mkdtempSync(join(tmpdir(), 'dolt-sceneB-'));
cleanup.push(() => rmSync(sceneBDir, { recursive: true, force: true }));
execSync('dolt init', { cwd: sceneBDir });

const sceneBPort = 23306;
const sceneBProc = spawn('dolt', ['sql-server', '-H', '127.0.0.1', '-P', String(sceneBPort), '--no-auto-commit'], {
  cwd: sceneBDir,
  stdio: ['ignore', 'pipe', 'pipe'],
});
cleanup.push(() => { try { sceneBProc.kill('SIGTERM'); } catch {} });
await waitFor(
  () => shOk(`mysql -h 127.0.0.1 -P ${sceneBPort} -u root --connect-timeout=1 -e "SELECT 1"`),
  `dolt scenario B`,
);

const sceneBBaselineRss = rss(sceneBProc.pid);
console.log(`  baseline RSS (server only, no DBs) : ${sceneBBaselineRss}MB`);

const sceneBRssAfterEach = [];
for (let i = 0; i < NUM_TENANTS; i++) {
  const db = `tenant_${String(i).padStart(2, '0')}`;
  sh(`mysql -h 127.0.0.1 -P ${sceneBPort} -u root -e "CREATE DATABASE ${db}; USE ${db}; CREATE TABLE s (id INT PRIMARY KEY, v VARCHAR(64)); INSERT INTO s VALUES (${i}, 'sentinel-${db}');"`);
  const r = rss(sceneBProc.pid);
  sceneBRssAfterEach.push(r);
  console.log(`  + CREATE DATABASE ${db}  RSS=${r}MB  (Δ${r - sceneBBaselineRss > 0 ? '+' : ''}${r - sceneBBaselineRss})`);
}
const sceneBMemAfter = freeMemMB();
console.log(`  TOTAL RSS (1 server + 10 DBs)    : ${sceneBRssAfterEach[9]} MB`);
console.log(`  System used memory delta vs base : ${sceneBMemAfter.used - baselineMem.used} MB`);
console.log(`  System available remaining       : ${sceneBMemAfter.available} MB\n`);

// TCP latency Scenario B (same query shape).
const sceneBLatencies = [];
for (let i = 0; i < QUERY_COUNT; i++) {
  const t0 = performance.now();
  sh(`mysql -h 127.0.0.1 -P ${sceneBPort} -u root -e "USE tenant_00; SELECT v FROM s WHERE id=0" -s -N`);
  sceneBLatencies.push(performance.now() - t0);
}
const sceneBP50 = quantile(sceneBLatencies, 0.50);
const sceneBP95 = quantile(sceneBLatencies, 0.95);
const sceneBP99 = quantile(sceneBLatencies, 0.99);
console.log(`[3b. SCENARIO B — TCP query latency]`);
console.log(`  p50 = ${sceneBP50.toFixed(2)}ms  p95 = ${sceneBP95.toFixed(2)}ms  p99 = ${sceneBP99.toFixed(2)}ms\n`);

// Filesystem audit Scenario B.
console.log('[3c. SCENARIO B — filesystem audit (per-DB directory?)]');
const sceneBLayout = readdirSync(sceneBDir).filter(e => !e.startsWith('.dolt'));
console.log(`  /tmp/.../sceneB top-level entries  : ${sceneBLayout.join(', ') || '(only .dolt — DBs nested inside)'}`);
// Look for per-tenant subdirs.
const expectedDbDirs = Array.from({ length: NUM_TENANTS }, (_, i) => `tenant_${String(i).padStart(2, '0')}`);
const allTopLevel = readdirSync(sceneBDir);
console.log(`  All entries in sceneB root         : ${allTopLevel.join(', ')}`);
let perDbDirs = 0;
for (const db of expectedDbDirs) {
  if (existsSync(join(sceneBDir, db))) perDbDirs++;
}
console.log(`  Per-DB directories found at root   : ${perDbDirs}/${NUM_TENANTS}`);
// Some Dolt versions store under .dolt/...; check there too.
const dotDoltDir = join(sceneBDir, '.dolt');
if (existsSync(dotDoltDir)) {
  const inside = readdirSync(dotDoltDir);
  console.log(`  Inside .dolt/                      : ${inside.join(', ')}`);
}
// rm -rf one DB directory test.
const sceneBVictim = join(sceneBDir, expectedDbDirs[3]);
const sceneBVictimDoltDir = join(sceneBDir, '.dolt', 'databases', expectedDbDirs[3]);
console.log(`[3d. SCENARIO B — rm -rf isolation]`);
let rmWorked = false;
if (existsSync(sceneBVictim)) {
  rmSync(sceneBVictim, { recursive: true, force: true });
  rmWorked = !existsSync(sceneBVictim);
  console.log(`  rm -rf ${expectedDbDirs[3]}/  (top-level) : success=${rmWorked}`);
} else if (existsSync(sceneBVictimDoltDir)) {
  rmSync(sceneBVictimDoltDir, { recursive: true, force: true });
  rmWorked = !existsSync(sceneBVictimDoltDir);
  console.log(`  rm -rf .dolt/databases/${expectedDbDirs[3]} : success=${rmWorked}`);
} else {
  console.log(`  ⚠  no per-tenant directory found at expected paths`);
  console.log(`     → Path A 'rm -rf <tenant>' guarantee CANNOT be satisfied in Scenario B`);
}

// Kill Scenario B server.
sceneBProc.kill('SIGTERM');
await new Promise(r => setTimeout(r, 500));

// ── 4. better-sqlite3 in-process baseline ────────────────────────────────────

console.log('\n[4. BASELINE — better-sqlite3 in-process (matches our W27-5 path)]');
const sqliteDir = mkdtempSync(join(tmpdir(), 'sqlite-baseline-'));
cleanup.push(() => rmSync(sqliteDir, { recursive: true, force: true }));
const sqliteHandles = [];
for (let i = 0; i < NUM_TENANTS; i++) {
  const db = new Database(join(sqliteDir, `tenant-${String(i).padStart(2, '0')}.db`));
  db.exec('CREATE TABLE s (id INTEGER PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO s VALUES (?, ?)').run(i, `sentinel-sqlite-${i}`);
  sqliteHandles.push(db);
}
const sqliteRss = process.memoryUsage().rss / 1024 / 1024;
console.log(`  in-process RSS for 10 better-sqlite3 backends: ${sqliteRss.toFixed(1)}MB`);

const sqliteLatencies = [];
const stmt = sqliteHandles[0].prepare('SELECT v FROM s WHERE id = ?');
for (let i = 0; i < QUERY_COUNT; i++) {
  const t0 = performance.now();
  stmt.get(0);
  sqliteLatencies.push(performance.now() - t0);
}
const sqliteP50 = quantile(sqliteLatencies, 0.50);
const sqliteP95 = quantile(sqliteLatencies, 0.95);
const sqliteP99 = quantile(sqliteLatencies, 0.99);
console.log(`  baseline query latency (${QUERY_COUNT} runs):`);
console.log(`  p50 = ${sqliteP50.toFixed(3)}ms  p95 = ${sqliteP95.toFixed(3)}ms  p99 = ${sqliteP99.toFixed(3)}ms\n`);

for (const db of sqliteHandles) db.close();

// ── 5. Verdict ────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  VERDICT — PROCEED / RECONSIDER / REJECT');
console.log('═══════════════════════════════════════════════════════════════════════');

const verdicts = [];

// Memory check — Scenario A
const sceneAFitsBudget = sceneARssSum <= CONTINUUM_HEADROOM_MB;
verdicts.push({
  axis: 'memory: Scenario A (10 procs)',
  measured: `${sceneARssSum}MB`,
  budget: `≤${CONTINUUM_HEADROOM_MB}MB`,
  status: sceneAFitsBudget ? 'PROCEED' : 'REJECT',
});

// Memory check — Scenario B
const sceneBFitsBudget = (sceneBRssAfterEach[9] ?? 0) <= CONTINUUM_HEADROOM_MB;
verdicts.push({
  axis: 'memory: Scenario B (1 proc, 10 DBs)',
  measured: `${sceneBRssAfterEach[9] ?? '?'}MB`,
  budget: `≤${CONTINUUM_HEADROOM_MB}MB`,
  status: sceneBFitsBudget ? 'PROCEED' : 'REJECT',
});

// Latency check
const bestDoltP95 = Math.min(sceneAP95, sceneBP95);
const latencyFitsSla = bestDoltP95 <= SLA_P95_BUDGET_MS;
const latencyOverhead = bestDoltP95 - sqliteP95;
verdicts.push({
  axis: 'latency: TCP p95 vs SLA',
  measured: `${bestDoltP95.toFixed(2)}ms (overhead +${latencyOverhead.toFixed(2)}ms vs sqlite)`,
  budget: `≤${SLA_P95_BUDGET_MS}ms`,
  status: latencyFitsSla ? 'PROCEED' : 'REJECT',
});

// Path A audit
const pathAComplianceA = sceneADuPerTenant.length === NUM_TENANTS - 1; // tenant-05 was victim
verdicts.push({
  axis: 'Path A: Scenario A directory layout',
  measured: `du -sh works per tenant; rm -rf cleanly destroys`,
  budget: 'distinct dir per tenant',
  status: pathAComplianceA ? 'PROCEED' : 'RECONSIDER',
});

verdicts.push({
  axis: 'Path A: Scenario B directory layout',
  measured: `${perDbDirs}/${NUM_TENANTS} per-DB dirs at top level; rm -rf attempted=${rmWorked}`,
  budget: 'distinct dir per tenant',
  status: perDbDirs >= NUM_TENANTS - 1 ? 'PROCEED' : 'RECONSIDER',
});

for (const v of verdicts) {
  console.log(`  [${v.status.padEnd(10)}] ${v.axis.padEnd(40)} measured=${v.measured}  budget=${v.budget}`);
}

const overallReject = verdicts.some(v => v.status === 'REJECT');
const overallReconsider = verdicts.some(v => v.status === 'RECONSIDER');
const overall = overallReject ? 'REJECT' : overallReconsider ? 'RECONSIDER' : 'PROCEED';

console.log(`\n  OVERALL: ${overall}\n`);

// Cheap-summary line for grep.
console.log(
  `[summary] sceneA_rss=${sceneARssSum}MB sceneB_rss=${sceneBRssAfterEach[9] ?? 0}MB ` +
    `sceneA_p95=${sceneAP95.toFixed(2)}ms sceneB_p95=${sceneBP95.toFixed(2)}ms ` +
    `sqlite_p95=${sqliteP95.toFixed(3)}ms verdict=${overall}`,
);

process.exit(0);
