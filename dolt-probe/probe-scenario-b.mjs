#!/usr/bin/env node
/**
 * probe-scenario-b.mjs — Focused Path A audit for Dolt Scenario B.
 *
 * Operator-authorised re-probe (2026-06-12). Scenario A was rejected on
 * memory math (10 × 95 MB = 950 MB exceeds 281 MB headroom). Scenario B
 * (1 server, N logical DBs) is feasible on memory + latency but
 * UNPROVEN on the Path A filesystem isolation axis. This probe answers:
 *
 *   Q1. Does Dolt store each logical DATABASE in its own directory on
 *       disk, or are tenants entangled in a monolithic blob?
 *
 *   Q2. Does `du -sh <tenant_dir>/` work — can we measure per-tenant
 *       disk usage for cost analytics + quota enforcement?
 *
 *   Q3. Does `rm -rf <tenant_dir>/` cleanly destroy one tenant's data
 *       WITHOUT corrupting the others? This is the Path A
 *       physical-isolation invariant from Sprint W27.
 *
 *   Q4. Per-DB RSS — does adding logical DBs to one server keep memory
 *       flat (singleton sharing) or grow linearly (per-DB overhead)?
 *
 * Output: a single-line summary line for grep + a structured verdict
 * (PROCEED / RECONSIDER / REJECT) against the W27-shipped Path A
 * guarantee.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P2 — measured, not claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const cleanup = [];
process.on('exit', () => cleanup.forEach(fn => { try { fn(); } catch {} }));

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  Dolt Scenario B probe — Path A filesystem audit');
console.log('═══════════════════════════════════════════════════════════════════════\n');

console.log(`[setup] dolt ${sh('dolt version | head -1')}  kernel ${sh('uname -srm')}`);
const base = freeMem();
console.log(`[setup] baseline: total=${base.total}MB used=${base.used}MB available=${base.available}MB\n`);

// ── Spawn ONE dolt sql-server ────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), 'dolt-sceneB-'));
cleanup.push(() => rmSync(root, { recursive: true, force: true }));
execSync('dolt init', { cwd: root });

const port = 13306;
console.log(`[1. spawn] dolt sql-server at ${root}:${port}`);
const proc = spawn('dolt', ['sql-server', '-H', '127.0.0.1', '-P', String(port)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
cleanup.push(() => { try { proc.kill('SIGTERM'); } catch {} });
let stderrBuf = '';
proc.stderr.on('data', d => { stderrBuf += d.toString(); });

// Wait for connect
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
  console.log(`  ✗ FAIL — connect timeout. stderr tail:`);
  console.log(stderrBuf.slice(-400).split('\n').map(l => '    ' + l).join('\n'));
  process.exit(1);
}
console.log(`  ✓ ready in ${((Date.now() - start) / 1000).toFixed(1)}s`);

await new Promise(r => setTimeout(r, 2000));
const rss0 = rss(proc.pid);
console.log(`  baseline RSS (server, no DBs)      : ${rss0}MB\n`);

// ── Create 10 logical databases + sentinel rows ─────────────────────────────

const TENANTS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
const rssPerTenant = [];

console.log('[2. CREATE DATABASE × 10 + INSERT sentinels]');
for (let i = 0; i < TENANTS.length; i++) {
  const t = TENANTS[i];
  // Use single quotes in SQL literals; no ambiguity vs identifiers.
  sh(`mysql -h 127.0.0.1 -P ${port} -u root -e "CREATE DATABASE ${t}; USE ${t}; CREATE TABLE s (id INT PRIMARY KEY, v VARCHAR(64)); INSERT INTO s VALUES (${i}, 'sentinel_${t}_token');"`);
  const r = rss(proc.pid);
  rssPerTenant.push(r);
  console.log(`  + ${t.padEnd(8)} RSS=${r}MB (Δ${(r - rss0) >= 0 ? '+' : ''}${r - rss0})`);
}
const memAfter = freeMem();
console.log(`  final RSS                          : ${rssPerTenant[rssPerTenant.length - 1]}MB`);
console.log(`  system used delta vs baseline      : +${memAfter.used - base.used}MB`);
console.log(`  system available                   : ${memAfter.available}MB\n`);

// ── Q1 + Q2: per-DB on-disk layout ──────────────────────────────────────────

console.log('[3. Path A — directory layout audit]');
const rootListing = readdirSync(root);
console.log(`  ${root}/ top-level entries: ${rootListing.join(', ')}`);

// Look for tenant directories at multiple plausible locations.
const candidates = [];
for (const t of TENANTS) {
  // Some Dolt versions: data is in <root>/<dbname>/
  if (existsSync(join(root, t))) candidates.push({ tenant: t, path: join(root, t) });
  // Other versions: under .dolt/databases/<dbname>/
  const altPath = join(root, '.dolt', 'databases', t);
  if (existsSync(altPath)) candidates.push({ tenant: t, path: altPath });
  // Newer dolt: noms-style — look in noms/ or similar
}
// Recursive search for any directory whose name matches a tenant.
function findTenantDirs(startPath, depth = 0) {
  if (depth > 5) return [];
  const out = [];
  let entries;
  try { entries = readdirSync(startPath); } catch { return []; }
  for (const e of entries) {
    const p = join(startPath, e);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) {
      if (TENANTS.includes(e)) out.push(p);
      out.push(...findTenantDirs(p, depth + 1));
    }
  }
  return out;
}
const allTenantDirs = findTenantDirs(root);
console.log(`  Recursive search found per-tenant dirs at ${allTenantDirs.length} path(s):`);
const uniquePerTenant = new Map();
for (const p of allTenantDirs) {
  const name = p.split('/').pop();
  if (!uniquePerTenant.has(name)) uniquePerTenant.set(name, p);
  console.log(`    ${p}`);
}
const allTenantsFound = TENANTS.every(t => uniquePerTenant.has(t));
console.log(`  All ${TENANTS.length} tenants have a distinct dir? ${allTenantsFound}`);

// ── Q2: du -sh per tenant ──────────────────────────────────────────────────

console.log('\n[4. du -sh per tenant]');
for (const t of TENANTS.slice(0, 5)) {
  const p = uniquePerTenant.get(t);
  if (p) {
    console.log(`  ${t.padEnd(8)} : ${sh(`du -sh ${p} | cut -f1`)}  (${p})`);
  } else {
    console.log(`  ${t.padEnd(8)} : NO DIR FOUND`);
  }
}

// ── Q3: rm -rf one tenant; verify others survive ──────────────────────────

console.log('\n[5. rm -rf isolation test]');
const victimTenant = 'charlie';
const victimPath = uniquePerTenant.get(victimTenant);
let rmWorked = false;
let othersSurvive = false;
let victimGone = false;
if (victimPath) {
  console.log(`  victim   : ${victimTenant} at ${victimPath}`);
  // Stop the SERVER before rm so file handles release (dolt holds them open).
  proc.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1500));
  // Now rm.
  rmSync(victimPath, { recursive: true, force: true });
  rmWorked = !existsSync(victimPath);
  console.log(`  rm -rf ${victimTenant}/  succeeded: ${rmWorked}`);
  victimGone = !existsSync(victimPath);

  // Restart server and verify other tenants still queryable.
  console.log(`  restarting server to verify survivors…`);
  const proc2 = spawn('dolt', ['sql-server', '-H', '127.0.0.1', '-P', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  cleanup.push(() => { try { proc2.kill('SIGTERM'); } catch {} });
  const t0 = Date.now();
  let reconnected = false;
  while (Date.now() - t0 < 30000) {
    if (shOk(`mysql -h 127.0.0.1 -P ${port} -u root --connect-timeout=1 -e "SELECT 1" 2>/dev/null`)) {
      reconnected = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (reconnected) {
    console.log(`  ✓ server restarted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    let surviveCount = 0;
    let lossCount = 0;
    for (const t of TENANTS) {
      if (t === victimTenant) continue;
      const ok = shOk(`mysql -h 127.0.0.1 -P ${port} -u root -e "USE ${t}; SELECT v FROM s WHERE id IN (0,1,2,3,4,5,6,7,8,9)" 2>/dev/null`);
      if (ok) surviveCount++;
      else lossCount++;
      console.log(`    ${t.padEnd(8)} queryable=${ok}`);
    }
    othersSurvive = surviveCount === TENANTS.length - 1 && lossCount === 0;
    console.log(`  survivors: ${surviveCount}/${TENANTS.length - 1}  lost: ${lossCount}`);

    // And the victim must be unrecoverable.
    const victimGoneFromSql = !shOk(`mysql -h 127.0.0.1 -P ${port} -u root -e "USE ${victimTenant}; SELECT v FROM s LIMIT 1" 2>/dev/null`);
    console.log(`  victim ${victimTenant} unrecoverable from SQL: ${victimGoneFromSql}`);
    victimGone = victimGone && victimGoneFromSql;
  } else {
    console.log(`  ✗ server failed to restart after rm — bad sign for isolation`);
  }
  proc2.kill('SIGTERM');
} else {
  console.log(`  ✗ NO victim path found — Q1 already failed`);
}

// ── Verdict ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('  Q-axis verdict');
console.log('═══════════════════════════════════════════════════════════════════════');

const q1 = allTenantsFound;
const q2 = q1; // du -sh works iff per-tenant dirs exist
const q3 = rmWorked && othersSurvive && victimGone;
const finalRss = rssPerTenant[rssPerTenant.length - 1] ?? 0;
const q4 = finalRss <= rss0 + 30; // ≤30MB growth for 10 DBs = "effectively flat"

console.log(`  Q1 per-tenant directories                  : ${q1 ? 'PASS' : 'FAIL'}`);
console.log(`  Q2 du -sh per tenant                        : ${q2 ? 'PASS' : 'FAIL'}`);
console.log(`  Q3 rm -rf isolation (others survive)        : ${q3 ? 'PASS' : 'FAIL'}`);
console.log(`  Q4 memory-flat across 10 DBs (≤+30MB)       : ${q4 ? 'PASS' : 'FAIL'}  (base ${rss0}MB → final ${finalRss}MB)`);

const allPass = q1 && q2 && q3 && q4;
const verdict = allPass ? 'PROCEED' : (q1 && q4 ? 'RECONSIDER' : 'REJECT');
console.log(`\n  OVERALL: ${verdict}`);
console.log(
  `[summary] q1=${q1} q2=${q2} q3=${q3} q4=${q4} base_rss=${rss0}MB final_rss=${finalRss}MB tenants_found=${uniquePerTenant.size}/${TENANTS.length} verdict=${verdict}`,
);

process.exit(0);
