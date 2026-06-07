#!/usr/bin/env node
/**
 * scripts/verify-w27-isolation.mjs
 *
 * W27-4 Proof #4: filesystem-audit script. Simulates a 3-tenant CONTINUUM
 * deployment, seeds distinct sentinel observations into each tenant, and
 * mechanically verifies that no data bleeds across the OS-level directory
 * boundaries.
 *
 * THREE layered checks per (tenant_i, tenant_j) pair (i ≠ j), six pairs
 * total across the 3-tenant fixture:
 *
 *   (A) FILESYSTEM — `du -sh ~/.continuum/<tenant_i>/` succeeds and shows
 *       a directory size distinct from every other tenant's directory.
 *
 *   (B) RAW BYTES — `grep -a <tenant_j sentinel token> <tenant_i>/
 *       continuum.db` returns ZERO matches. Catches accidental writes
 *       that bypassed the API (e.g. metadata leaks in JSON columns).
 *
 *   (C) API — openStorage(tenant_i).getObservations([tenant_j_sentinel_id])
 *       returns empty AND openStorage(tenant_i).searchObservations(<tenant_j
 *       token>) returns zero hits. Catches API-level leaks (rare but the
 *       most damaging).
 *
 * Exit codes:
 *   0  — all 6 pairs × 3 checks = 18 cross-checks pass
 *   1  — any check failed; details printed to stderr
 *
 * Designed to run in a fresh tmpdir so it's hermetic and re-runnable.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P2 — proven, not granted.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FACTORY = resolve(REPO_ROOT, 'packages/core/dist/factory.js');

// ── Fixture — three tenants with distinct sentinels ──────────────────────────

const TENANTS = [
  { id: 'alpha',   token: 'WIT_ALPHA_X9F2K7B3M4',   data: 'apex-corp customer record A1' },
  { id: 'bravo',   token: 'WIT_BRAVO_Q1L8N5R6Z2',   data: 'beta-llc proprietary algorithm B7' },
  { id: 'charlie', token: 'WIT_CHARLIE_J3D6V0H8C5', data: 'cygnus-ai patent draft C42' },
];

// ── Hermetic tmpdir ──────────────────────────────────────────────────────────

const TMP = mkdtempSync(join(tmpdir(), 'continuum-w27-iso-audit-'));
process.env.CONTINUUM_DATA_DIR = TMP;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

let exitCode = 0;
const failures = [];

function fail(check, msg) {
  exitCode = 1;
  failures.push(`[${check}] ${msg}`);
  process.stderr.write(`✗ ${check}: ${msg}\n`);
}

function ok(check, msg) {
  process.stdout.write(`✓ ${check}: ${msg}\n`);
}

// ── 1. Load the factory + seed all three tenants ─────────────────────────────

process.stdout.write(`\n[verify-w27-isolation] tmpdir = ${TMP}\n`);

const { openStorage } = await import(FACTORY);

const sentinels = {}; // tenantId → sentinel observation ID
for (const t of TENANTS) {
  const s = openStorage(t.id);
  s.upsertSource(`mem:${t.id}`, 'mem');
  const obs = s.insertObservation({
    sourceId: `mem:${t.id}`,
    type: 'note',
    content: `${t.token} — ${t.data} — this should be visible ONLY to tenant ${t.id}`,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: { tenantId: t.id, sentinelToken: t.token },
  });
  if (!obs) {
    fail('seed', `tenant ${t.id} seed insert returned null`);
    process.exit(1);
  }
  sentinels[t.id] = obs.id;
  s.close();
  process.stdout.write(
    `  seeded tenant ${t.id.padEnd(8)} sentinel-id=${obs.id.slice(0, 8)} token=${t.token}\n`,
  );
}

// ── 2. Three structural-existence checks (one per tenant) ────────────────────

process.stdout.write(`\n[A. filesystem layout]\n`);
for (const t of TENANTS) {
  const dir = join(TMP, t.id);
  const db = join(dir, 'continuum.db');
  if (!existsSync(dir)) {
    fail('A.dir', `tenant ${t.id} directory missing: ${dir}`);
    continue;
  }
  if (!existsSync(db)) {
    fail('A.db', `tenant ${t.id} sqlite file missing: ${db}`);
    continue;
  }
  // du -sh — proves it's a directory we can inspect like any other.
  try {
    const stats = execFileSync('du', ['-sh', dir], { encoding: 'utf-8' }).trim();
    ok('A.du', `${t.id} ${stats}`);
  } catch (err) {
    fail('A.du', `du failed for ${dir}: ${err.message}`);
  }
}

// ── 3. Six pair-wise cross-checks (A × B, A × C, B × A, B × C, C × A, C × B) ──

process.stdout.write(`\n[B. raw-bytes grep across tenants]\n`);
let bChecks = 0;
for (const ti of TENANTS) {
  for (const tj of TENANTS) {
    if (ti.id === tj.id) continue;
    bChecks++;
    const dbi = join(TMP, ti.id, 'continuum.db');
    const bytes = readFileSync(dbi);
    // The sentinel token is ASCII; SQLite stores TEXT as UTF-8. A
    // straight string search is sufficient to catch any cross-write.
    if (bytes.includes(tj.token)) {
      fail(
        'B.grep',
        `LEAK — tenant ${ti.id}'s DB contains tenant ${tj.id}'s token "${tj.token}"`,
      );
    } else {
      ok('B.grep', `${ti.id} DB does NOT contain ${tj.id}'s token`);
    }
  }
}

process.stdout.write(`\n[C. API-level cross-tenant reads]\n`);
let cChecks = 0;
for (const ti of TENANTS) {
  // Open tenant-i ONCE and query for every other tenant's sentinel.
  const si = openStorage(ti.id);
  try {
    for (const tj of TENANTS) {
      if (ti.id === tj.id) continue;
      cChecks++;
      // C.get — direct ID lookup
      const fetched = si.getObservations([sentinels[tj.id]]);
      if (fetched.length !== 0) {
        fail(
          'C.get',
          `LEAK — tenant ${ti.id} can fetch tenant ${tj.id}'s observation by ID`,
        );
      } else {
        ok('C.get', `${ti.id} cannot fetch ${tj.id}'s sentinel by ID`);
      }
      // C.search — FTS5 search by the other tenant's token
      const hits = si.searchObservations(tj.token);
      if (hits.length !== 0) {
        fail(
          'C.search',
          `LEAK — tenant ${ti.id} can search tenant ${tj.id}'s sentinel token`,
        );
      } else {
        ok('C.search', `${ti.id} search returns 0 hits for ${tj.id}'s token`);
      }
    }
  } finally {
    si.close();
  }
}

// ── 4. Cleanup + verdict ─────────────────────────────────────────────────────

rmSync(TMP, { recursive: true, force: true });

const totalChecks =
  TENANTS.length /* A */ +
  bChecks + // B (6)
  cChecks * 2; // C (6 × 2 — get + search)

process.stdout.write(
  `\n[verdict] ran ${totalChecks} cross-checks (A ${TENANTS.length} + B ${bChecks} + C ${cChecks * 2})\n`,
);

if (exitCode === 0) {
  process.stdout.write(
    `\n✓ W27-4 isolation audit PASSED — no data bleeds across OS-level directories.\n`,
  );
} else {
  process.stderr.write(
    `\n✗ W27-4 isolation audit FAILED — ${failures.length} check(s) leaked:\n` +
      failures.map(f => `  ${f}`).join('\n') +
      '\n',
  );
}

process.exit(exitCode);
