#!/usr/bin/env node
/**
 * Smoke test — Phase 1 remote-git adapter end-to-end.
 *
 * Proves: a REAL external GitHub repo is ingested via gitingest, lands as a
 * single Observation through the StorageBackend seam, and is retrievable through
 * the 3-layer Progressive Disclosure surface (Layer-1 search -> Layer-3 fetch).
 *
 * RUN:  node scripts/remote-git-smoke.mjs [github-url]
 *       default repo: https://github.com/octocat/Spoon-Knife
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ADAPTER = resolve(REPO_ROOT, 'packages/adapters/remote-git/dist/index.js');
const CORE = resolve(REPO_ROOT, 'packages/core/dist/index.js');

const REPO_URL = process.argv[2] ?? 'https://github.com/octocat/Spoon-Knife';

const { ingestRemoteRepo } = await import(ADAPTER);
const { SQLiteStorageBackend } = await import(CORE);

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
};

console.log('PHASE 1 — remote-git adapter smoke test');
console.log('='.repeat(64));
console.log(`Target repo: ${REPO_URL}\n`);

const TMP = mkdtempSync(join(tmpdir(), 'continuum-remotegit-'));
const storage = new SQLiteStorageBackend('remote-git-smoke-' + Date.now());
try {
  // ── Ingest ──────────────────────────────────────────────────────────────────
  console.log('Ingesting (gitingest clone + digest + synthesis + upsert)…');
  const t0 = Date.now();
  const r = ingestRemoteRepo({ repoUrl: REPO_URL, project: 'unused', storage });
  console.log(`  done in ${Date.now() - t0}ms\n`);

  ok('ingest returned an observation id', Boolean(r.observationId), r.observationId);
  ok('repo identified', Boolean(r.repo), r.repo);
  ok('commit captured', r.commit.length >= 7, r.commit.slice(0, 8));
  ok('not dropped by privacy filter', r.dropped === false);
  ok('payload is compact (< 20k chars)', r.payloadChars > 0 && r.payloadChars < 20000, `${r.payloadChars} chars`);

  // ── Layer-3: direct fetch by ID proves it persisted with full content ────────
  const fetched = storage.getObservations([r.observationId]);
  ok('Layer-3 get_observations returns the record', fetched.length === 1);
  const obs = fetched[0];
  ok('observation type is remote_repo_digest', obs?.type === 'remote_repo_digest');
  ok('payload contains the Objective State Payload header', obs?.content.includes('Objective State Payload'));
  ok('payload contains the directory tree', obs?.content.includes('Directory structure'));
  ok('metadata carries the repo URL', obs?.metadata?.repoUrl === REPO_URL);

  // ── Layer-1: search finds it by a term from the repo ─────────────────────────
  // Derive a query token from the repo name (e.g. "Spoon-Knife" -> "spoon").
  const nameTok = (r.repo.split('/').pop() ?? 'repo').split(/[-_.]/)[0];
  const hits = storage.searchObservations(nameTok, 20);
  const found = hits.find((h) => h.id === r.observationId);
  ok(`Layer-1 search ("${nameTok}") surfaces the ingested repo`, Boolean(found));
  ok('Layer-1 hit is compact (title only, no full body)', found ? !('content' in found) : false);

  // ── Idempotency: re-ingest must not duplicate (stable ID) ────────────────────
  const r2 = ingestRemoteRepo({ repoUrl: REPO_URL, project: 'unused', storage });
  ok('re-ingest is idempotent (same stable id)', r2.observationId === r.observationId);
  const afterCount = storage.searchObservations(nameTok, 20).filter((h) => h.id === r.observationId).length;
  ok('no duplicate observation after re-ingest', afterCount === 1);

  // ── Token economy: compact payload vs raw repo ───────────────────────────────
  console.log(`\n  Compactness: stored payload ${r.payloadChars} chars vs repo's ~${r.estimatedSourceTokens} source tokens.`);

  console.log('\n' + '-'.repeat(64));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail === 0) {
    console.log('✓ Phase 1 perimeter intelligence: remote repo ingested + retrieved via 3-layer.');
  }
} finally {
  storage.close?.();
  rmSync(TMP, { recursive: true, force: true });
}
process.exit(fail === 0 ? 0 : 1);
