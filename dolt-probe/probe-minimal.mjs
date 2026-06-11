#!/usr/bin/env node
/**
 * probe-minimal.mjs — Focused fallback after the full probe hung in
 * Scenario A. Measures just enough to make a verdict call.
 *
 *   1. dolt binary footprint
 *   2. ONE dolt sql-server RSS at steady state
 *   3. ONE mysql TCP query latency × 50
 *   4. ONE better-sqlite3 in-process query latency × 50
 *   5. Path A audit on a single .dolt/ directory
 *   6. Verdict — extrapolate 10-procs cost; report Scenario B is feasible
 *      ONLY if 1 proc RSS < 100MB (gives headroom for embedder+CONTINUUM)
 *
 * Idea: if ONE server consumes >300MB, Path A's 10-proc scenario is
 * dead immediately. If it consumes <150MB, Scenario B (1 proc 10 DBs)
 * is worth a full follow-up probe.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';

function sh(cmd) { return execSync(cmd, { encoding: 'utf-8' }).trim(); }
function shOk(cmd) { try { sh(cmd); return true; } catch { return false; } }
function rss(pid) {
  try { return Math.round(parseInt(execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf-8' }).trim(), 10) / 1024); } catch { return 0; }
}
function freeMem() {
  const out = execSync('free -m', { encoding: 'utf-8' });
  const line = out.split('\n').find(l => l.startsWith('Mem:'));
  const c = line.trim().split(/\s+/);
  return { total: +c[1], used: +c[2], free: +c[3], available: +c[6] };
}
function q(arr, p) { return [...arr].sort((a, b) => a - b)[Math.floor(arr.length * p)]; }

const cleanup = [];
process.on('exit', () => cleanup.forEach(fn => { try { fn(); } catch {} }));

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  Dolt minimal probe — focused fallback (full Scenario A hung)');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// 1. Footprint
console.log('[1. binary + version]');
console.log(`  ${sh('dolt version | head -1')}`);
console.log(`  binary  : ${sh('du -sh /usr/local/bin/dolt | cut -f1')}`);
console.log(`  kernel  : ${sh('uname -srm')}\n`);

const base = freeMem();
console.log('[baseline before dolt sql-server]');
console.log(`  total=${base.total}MB used=${base.used}MB free=${base.free}MB available=${base.available}MB\n`);

// 2. Spawn ONE dolt sql-server
console.log('[2. ONE dolt sql-server — RSS measurement]');
const dir = mkdtempSync(join(tmpdir(), 'dolt-minimal-'));
cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
execSync('dolt init', { cwd: dir });
const port = 13306;
console.log(`  spawning dolt sql-server in ${dir} on :${port}…`);
const proc = spawn('dolt', ['sql-server', '-H', '127.0.0.1', '-P', String(port)], {
  cwd: dir,
  stdio: ['ignore', 'pipe', 'pipe'],
});
cleanup.push(() => { try { proc.kill('SIGTERM'); } catch {} });

// Capture stderr for diagnostic
let stderrBuf = '';
proc.stderr.on('data', d => { stderrBuf += d.toString(); });

// Wait for connection (15s budget)
const start = Date.now();
let connected = false;
while (Date.now() - start < 30000) {
  if (shOk(`mysql -h 127.0.0.1 -P ${port} -u root --connect-timeout=1 -e "SELECT 1" 2>/dev/null`)) {
    connected = true;
    break;
  }
  await new Promise(r => setTimeout(r, 500));
}
if (!connected) {
  console.log(`  ✗ FAIL — server did not accept connections in 30s`);
  console.log(`  stderr tail:\n${stderrBuf.slice(-500).split('\n').map(l => '    ' + l).join('\n')}`);
  process.exit(1);
}
const connWall = ((Date.now() - start) / 1000).toFixed(1);
console.log(`  ✓ ready in ${connWall}s`);

// Settle for 2 seconds then measure RSS
await new Promise(r => setTimeout(r, 2000));
const doltRss = rss(proc.pid);
const afterStart = freeMem();
console.log(`  dolt sql-server RSS         : ${doltRss}MB`);
console.log(`  system used (Δ baseline)    : +${afterStart.used - base.used}MB`);
console.log(`  system available remaining  : ${afterStart.available}MB\n`);

// 3. CREATE DB + INSERT + 50 SELECT
console.log('[3. TCP latency × 50 SELECTs]');
sh(`mysql -h 127.0.0.1 -P ${port} -u root -e "CREATE DATABASE t; USE t; CREATE TABLE s (id INT PRIMARY KEY, v VARCHAR(64)); INSERT INTO s VALUES (1, 'hello');"`);
const tcpLat = [];
for (let i = 0; i < 50; i++) {
  const t0 = performance.now();
  sh(`mysql -h 127.0.0.1 -P ${port} -u root -e "USE t; SELECT v FROM s WHERE id=1" -s -N`);
  tcpLat.push(performance.now() - t0);
}
console.log(`  p50=${q(tcpLat, 0.5).toFixed(2)}ms p95=${q(tcpLat, 0.95).toFixed(2)}ms p99=${q(tcpLat, 0.99).toFixed(2)}ms\n`);

// 4. better-sqlite3 baseline
console.log('[4. better-sqlite3 baseline × 50 SELECTs]');
const dbFile = join(dir, 'sqlite-baseline.db');
const db = new Database(dbFile);
db.exec('CREATE TABLE s (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO s VALUES (1, "hello");');
const stmt = db.prepare('SELECT v FROM s WHERE id = ?');
const sqliteLat = [];
for (let i = 0; i < 50; i++) {
  const t0 = performance.now();
  stmt.get(1);
  sqliteLat.push(performance.now() - t0);
}
db.close();
console.log(`  p50=${q(sqliteLat, 0.5).toFixed(3)}ms p95=${q(sqliteLat, 0.95).toFixed(3)}ms p99=${q(sqliteLat, 0.99).toFixed(3)}ms\n`);

// 5. Path A audit
console.log('[5. Path A on-disk layout]');
const layout = sh(`ls -la ${dir} | head -20`);
console.log(layout.split('\n').map(l => '  ' + l).join('\n'));
console.log(`  du -sh         : ${sh(`du -sh ${dir} | cut -f1`)}`);
const doltSubdir = join(dir, '.dolt');
console.log(`  .dolt/ exists  : ${existsSync(doltSubdir)}`);
if (existsSync(doltSubdir)) {
  const inner = readdirSync(doltSubdir);
  console.log(`  .dolt/ contents: ${inner.join(', ')}`);
}

// 6. Verdict
console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('  VERDICT');
console.log('═══════════════════════════════════════════════════════════════════════');

const CONTINUUM_OVERHEAD = 177; // node + http + embedder steady (W27-5 burst data)
const FLY_TOTAL = base.total;
const headroom = FLY_TOTAL - CONTINUUM_OVERHEAD;
const scenarioAProjected = doltRss * 10;
const scenarioBProjected = doltRss + 10; // 1 proc + ~1MB per DB metadata
const tcpP95 = q(tcpLat, 0.95);
const sqliteP95 = q(sqliteLat, 0.95);
const tcpOverhead = tcpP95 - sqliteP95;

console.log(`  Fly VM total              : ${FLY_TOTAL}MB`);
console.log(`  CONTINUUM steady-state    : ${CONTINUUM_OVERHEAD}MB (from W27-5 burst measurement)`);
console.log(`  Available for Dolt        : ${headroom}MB`);
console.log(`  ONE dolt sql-server RSS   : ${doltRss}MB`);
console.log(`  ──`);
console.log(`  Scenario A projected (10) : ${scenarioAProjected}MB  ${scenarioAProjected <= headroom ? 'FITS' : 'EXCEEDS by ' + (scenarioAProjected - headroom) + 'MB'}`);
console.log(`  Scenario B projected (1+) : ${scenarioBProjected}MB  ${scenarioBProjected <= headroom ? 'FITS' : 'EXCEEDS by ' + (scenarioBProjected - headroom) + 'MB'}`);
console.log(`  ──`);
console.log(`  Dolt TCP p95              : ${tcpP95.toFixed(2)}ms`);
console.log(`  better-sqlite3 p95        : ${sqliteP95.toFixed(3)}ms`);
console.log(`  TCP overhead per query    : +${tcpOverhead.toFixed(2)}ms`);
console.log(`  W25 SLA budget            : <50ms p95`);
console.log(`  Latency verdict           : ${tcpP95 <= 50 ? 'WITHIN BUDGET' : 'EXCEEDS SLA by ' + (tcpP95 - 50).toFixed(2) + 'ms'}`);

const sceneAReject = scenarioAProjected > headroom;
const sceneBReject = scenarioBProjected > headroom;
const latencyReject = tcpP95 > 50;
let overall = 'PROCEED';
if (sceneAReject && sceneBReject) overall = 'REJECT';
else if (sceneAReject || latencyReject) overall = 'RECONSIDER';

console.log(`\n  OVERALL: ${overall}`);
console.log(`  [summary] doltRss=${doltRss}MB sceneA=${scenarioAProjected}MB sceneB=${scenarioBProjected}MB doltP95=${tcpP95.toFixed(2)}ms sqliteP95=${sqliteP95.toFixed(3)}ms verdict=${overall}`);

proc.kill('SIGTERM');
await new Promise(r => setTimeout(r, 500));
rmSync(dir, { recursive: true, force: true });
process.exit(0);
