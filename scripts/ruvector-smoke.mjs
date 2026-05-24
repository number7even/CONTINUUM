#!/usr/bin/env node
/**
 * V0.5 Hybrid (RuVector + SQLite + MiniLM) smoke test.
 *
 * Proves:
 *   (a) openStorage() returns HybridStorageBackend when
 *       CONTINUUM_STORAGE_BACKEND=hybrid.
 *   (b) Sync StorageBackend interface still works (insertObservation,
 *       recordCheckpoint, listTodos) — V0 consumers see no breakage.
 *   (c) Background vector indexing fires after each insert, flushable
 *       via flushVectorWrites().
 *   (d) vectorSearch() returns the semantically-closest observation —
 *       NOT a keyword match (which would be a FTS5 false positive).
 *
 * RUN WITH:
 *   node scripts/ruvector-smoke.mjs
 *
 * On first run, @xenova/transformers downloads MiniLM-L6-v2 (~25 MB)
 * to ~/.cache/huggingface/. Subsequent runs are cache hits.
 *
 * The smoke uses a throwaway project ID and removes its DB on success.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CORE_DIST = resolve(REPO_ROOT, 'packages/core/dist/index.js');

const PROJECT_ID = 'ruvector-smoke-test';
const PROJECT_DIR = `${homedir()}/.continuum/${PROJECT_ID}`;

// Clean any prior smoke-test state for a deterministic run.
if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true });

process.env.CONTINUUM_STORAGE_BACKEND = 'hybrid';

const { openStorage, HybridStorageBackend } = await import(CORE_DIST);

console.log('V0.5 HYBRID STORAGE SMOKE TEST');
console.log('');

let failed = 0;
function check(label, cond, detail) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

// (a) factory returns the hybrid backend
const s = openStorage(PROJECT_ID);
check('factory returns HybridStorageBackend', s instanceof HybridStorageBackend,
  s.constructor.name);

// (b) sync interface — relational ops untouched
s.upsertSource('smoke:hybrid', 'export', { adapter: 'ruvector-smoke' });
const snap = s.recordCheckpoint({
  reason: 'V0.5 smoke checkpoint',
  active: [
    { name: 'hybrid-storage', where: 'packages/core/src/storage-hybrid.ts', verifyCommand: 'true', verifiedAt: new Date().toISOString() },
  ],
});
check('recordCheckpoint via sync path', snap && snap.id && snap.hash.length === 64,
  snap ? snap.id.slice(0, 8) : 'null');

const todo = s.createTodo({ title: 'V0.5 smoke todo' });
const todos = s.listTodos();
check('todo round-trip via sync path', todos.length === 1 && todos[0].id === todo.id);

// (c) insert observations — vector indexing fires in background
const obs1 = s.insertObservation({
  sourceId: 'smoke:hybrid',
  type: 'test',
  content: 'The quick brown fox jumps over the lazy dog. Pangrams contain every letter.',
  timestamp: new Date().toISOString(),
  refs: [],
});
const obs2 = s.insertObservation({
  sourceId: 'smoke:hybrid',
  type: 'test',
  content: 'Neural networks compute vector embeddings of natural language input.',
  timestamp: new Date().toISOString(),
  refs: [],
});
const obs3 = s.insertObservation({
  sourceId: 'smoke:hybrid',
  type: 'test',
  content: 'CONTINUUM uses an append-only event log for cryptographic provenance.',
  timestamp: new Date().toISOString(),
  refs: [],
});
check('3 observations land in SQLite synchronously',
  obs1?.id && obs2?.id && obs3?.id);

// FTS5 keyword search via the sync path — proves V0 behavior preserved
const fts = s.searchObservations('CONTINUUM');
check('FTS5 sync search still works', fts.length >= 1 && fts.some(h => h.id === obs3.id));

// Wait for the background embedding pipeline (first call triggers MiniLM download).
console.log('  … flushing vector writes (first run downloads MiniLM, ~25 MB) …');
const t0 = Date.now();
await s.flushVectorWrites();
const flushMs = Date.now() - t0;
console.log(`  ✓ flushVectorWrites settled in ${flushMs}ms`);

const vCount = await s.vectorCount();
check('vector count matches inserted observations', vCount === 3, `count=${vCount}`);

// (d) semantic search — the query is closer to obs2 than to obs1 or obs3
const hits = await s.vectorSearch('embedding models for text representations', 3);
console.log('  vectorSearch top results:');
for (const h of hits) {
  console.log(`    score=${h.score.toFixed(3)}  id=${h.id.slice(0, 8)}  ts=${h.timestamp.slice(0, 19)}`);
}
check('semantic top match is obs2 (embedding-related content)',
  hits.length >= 1 && hits[0].id === obs2.id,
  hits[0]?.id ? `got ${hits[0].id.slice(0, 8)}, expected ${obs2.id.slice(0, 8)}` : 'no hits');

s.close();

// Cleanup
rmSync(PROJECT_DIR, { recursive: true });

console.log('');
console.log(failed === 0
  ? '✓ ALL V0.5 HYBRID CHECKS PASSED'
  : `✗ ${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
