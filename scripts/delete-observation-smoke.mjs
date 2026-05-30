#!/usr/bin/env node
/**
 * scripts/delete-observation-smoke.mjs
 *
 * SPRINT-2026-W22 · W22-3 smoke test for StorageBackend.deleteObservation
 * (Issue #10 — incident-response primitive).
 *
 * Test path (sqlite backend; hybrid path covered by simple delegation):
 *   1. Open a fresh temp DB.
 *   2. upsertObservation with a known-ID payload containing a sentinel
 *      string only that test would write.
 *   3. searchObservations(sentinel) → expect ≥1 hit including the ID.
 *   4. assertFtsRowCountEquals(observationCount) before delete.
 *   5. deleteObservation(id) → expect true.
 *   6. searchObservations(sentinel) → expect 0 hits.
 *   7. assertFtsRowCountEquals(observationCount) after delete.
 *      (FTS5 trigger should have removed the matching row.)
 *   8. deleteObservation(id) again → expect false (idempotency check).
 *   9. Verify the OTHER observation (the one we did NOT delete) survives.
 *
 * Exit 0 = all 9 checks pass. Non-zero = first failure printed.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const TMP = mkdtempSync(join(tmpdir(), 'continuum-delete-smoke-'));
process.env.CONTINUUM_DATA_DIR = TMP;
process.env.CONTINUUM_PROJECT_ID = 'smoke';

const { SQLiteStorageBackend } = await import(
  new URL('../packages/core/dist/storage-sqlite.js', import.meta.url).href
);
const { dbPathForProject } = await import(
  new URL('../packages/core/dist/db.js', import.meta.url).href
);

let pass = 0;
let fail = 0;
function check(label, cond, detail = '') {
  if (cond) {
    process.stdout.write(`  ✓ ${label}\n`);
    pass++;
  } else {
    process.stdout.write(`  ✗ ${label}${detail ? ' — ' + detail : ''}\n`);
    fail++;
  }
}

const storage = new SQLiteStorageBackend('smoke');
const dbPath = dbPathForProject('smoke');

try {
  // Need a source row to satisfy FK on observations.
  storage.upsertSource('docs:smoke', 'docs');

  const sentinel = 'sentinel_w22_3_DELETE_ME_3f9e0b2a';
  const survivorMarker = 'survivor_keep_me_should_not_be_touched';

  const toDelete = storage.upsertObservation({
    id: '11111111-1111-1111-1111-111111111111',
    sourceId: 'docs:smoke',
    type: 'doc',
    content: `${sentinel} — this observation will be deleted by the smoke test.`,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: { source: 'smoke-test', purpose: 'to-be-deleted' },
  });
  check('step 2  · upsert returns observation with stable ID', toDelete?.id === '11111111-1111-1111-1111-111111111111');

  // Insert a second observation we will NOT delete, to verify scope.
  storage.upsertObservation({
    id: '22222222-2222-2222-2222-222222222222',
    sourceId: 'docs:smoke',
    type: 'doc',
    content: `${survivorMarker} — this row must survive the delete of the other one.`,
    timestamp: new Date().toISOString(),
    refs: [],
  });

  // Step 3 — pre-delete search finds the sentinel.
  const hitsBefore = storage.searchObservations(sentinel);
  check('step 3  · pre-delete search finds the sentinel row',
    hitsBefore.length >= 1 && hitsBefore.some(h => h.id === '11111111-1111-1111-1111-111111111111'),
    `got ${hitsBefore.length} hits`);

  // Step 4 — FTS5 row count parity before.
  const rawDb = new Database(dbPath, { readonly: true });
  const obsCountBefore = (rawDb.prepare('SELECT count(*) AS c FROM observations').get()).c;
  const ftsCountBefore = (rawDb.prepare('SELECT count(*) AS c FROM observations_fts').get()).c;
  check('step 4  · observations and observations_fts row counts match before delete',
    obsCountBefore === ftsCountBefore,
    `obs=${obsCountBefore} fts=${ftsCountBefore}`);

  // Step 5 — the delete itself returns true.
  const deletedOk = storage.deleteObservation('11111111-1111-1111-1111-111111111111');
  check('step 5  · deleteObservation returns true for an existing row', deletedOk === true);

  // Step 6 — sentinel no longer searchable.
  const hitsAfter = storage.searchObservations(sentinel);
  check('step 6  · post-delete search returns ZERO hits for the sentinel',
    hitsAfter.length === 0,
    `still got ${hitsAfter.length} hits`);

  // Step 7 — FTS5 row count parity after (trigger fired).
  const obsCountAfter = (rawDb.prepare('SELECT count(*) AS c FROM observations').get()).c;
  const ftsCountAfter = (rawDb.prepare('SELECT count(*) AS c FROM observations_fts').get()).c;
  check('step 7  · observations and observations_fts row counts STILL match after delete',
    obsCountAfter === ftsCountAfter,
    `obs=${obsCountAfter} fts=${ftsCountAfter}`);
  check('step 7b · observations row count dropped by exactly 1',
    obsCountAfter === obsCountBefore - 1,
    `before=${obsCountBefore} after=${obsCountAfter}`);
  rawDb.close();

  // Step 8 — second delete returns false (idempotent / nothing to delete).
  const deletedAgain = storage.deleteObservation('11111111-1111-1111-1111-111111111111');
  check('step 8  · deleteObservation returns false on second call (row already gone)', deletedAgain === false);

  // Step 9 — survivor still searchable.
  const survivorHits = storage.searchObservations(survivorMarker);
  check('step 9  · the OTHER observation survives untouched',
    survivorHits.length >= 1 && survivorHits.some(h => h.id === '22222222-2222-2222-2222-222222222222'));

  storage.close();
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

process.stdout.write(`\n${pass} pass · ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
