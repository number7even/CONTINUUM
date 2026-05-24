#!/usr/bin/env node
/**
 * Reproducible artifact — V0.5 hybrid-storage STUB checkpoint, 2026-05-24.
 *
 * Companion to v0-polish-complete-2026-05-24.mjs. This one stamps the
 * post-V0.5-stub state into the `continuum` project DB. Path A from
 * Issue #20 is shipped: HybridStorageBackend composes SQLiteStorageBackend
 * (relational) + RuVector (HNSW vector index) + @xenova/transformers
 * MiniLM-L6-v2 (384-dim embeddings).
 *
 * The hybrid backend is OPT-IN — sqlite remains the default. Activation
 * via CONTINUUM_STORAGE_BACKEND=hybrid. That is why the 4 new V0.5
 * entries are recorded as DORMANT (built, but not the active path
 * unless explicitly enabled). The 8 V0-polish-complete entries stay
 * ACTIVE since they reflect the always-on engine surface.
 *
 * RUN WITH:
 *   node scripts/checkpoints/v0.5-hybrid-stub-2026-05-24.mjs
 *
 * RE-RUN BEHAVIOR: append-only. New UUID + timestamp + hash each call.
 *
 * Env overrides:
 *   CONTINUUM_PROJECT_ID — default 'continuum'
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CORE_DIST = resolve(REPO_ROOT, 'packages/core/dist/index.js');

const { openStorage } = await import(CORE_DIST);

const PROJECT_ID = process.env.CONTINUUM_PROJECT_ID ?? 'continuum';
const VERIFIED_AT = new Date().toISOString();
const DB_PATH = `~/.continuum/${PROJECT_ID}/continuum.db`;
const HOME = process.env.HOME ?? '';

// IMPORTANT: stamp from the sqlite default backend so we write to the
// canonical continuum.db, not a hybrid-mode side path.
delete process.env.CONTINUUM_STORAGE_BACKEND;
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'V0.5 stub COMPLETE: Path A from Issue #20 shipped. HybridStorageBackend ' +
    'composes SQLiteStorageBackend (relational) + RuVector @0.2.25 native ' +
    '(HNSW vector index) + @xenova/transformers MiniLM-L6-v2 (384-dim ' +
    'embeddings). Backend is OPT-IN via CONTINUUM_STORAGE_BACKEND=hybrid; ' +
    'sqlite remains the default. scripts/ruvector-smoke.mjs verifies the ' +
    'full path (factory routing, sync StorageBackend parity, background ' +
    'vector indexing, semantic search outranking keyword). V0-polish ' +
    'entries stay ACTIVE (always-on engine); V0.5 entries land in DORMANT ' +
    '(built, opt-in not default).',
  active: [
    // ─── V0-polish-complete entries (carried forward — still all true) ───
    {
      name: 'mcp-surface-complete',
      where: 'packages/mcp-server/src/index.ts',
      verifyCommand:
        `grep -q "continuum.session_start" ${REPO_ROOT}/packages/mcp-server/dist/index.js && ` +
        `grep -q "continuum.cite" ${REPO_ROOT}/packages/mcp-server/dist/index.js && ` +
        `grep -q "session/briefing" ${REPO_ROOT}/packages/mcp-server/dist/index.js && ` +
        `grep -q "RESOURCE_URIS" ${REPO_ROOT}/packages/mcp-server/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '31fe885',
      description:
        '7 tools + 4 Resources + 2 Prompts. session/briefing is the Layer-0 ' +
        'markdown document that eliminates 3-5 warm-up tool calls per AI session.',
    },
    {
      name: 'cli-init-start-status-import-state',
      where: 'packages/cli/src/index.ts',
      verifyCommand:
        `node ${REPO_ROOT}/packages/cli/dist/index.js --help 2>&1 | grep -qE 'import-state'`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b059',
      description:
        'continuum init / start / status / import-state. init auto-imports STATE.md ' +
        'on first run; import-state forces a fresh checkpoint for re-syncs.',
    },
    {
      name: 'adapter-docs-idempotent-markdown-ingest',
      where: 'packages/adapters/docs/src/index.ts',
      verifyCommand:
        `test "$(sqlite3 ${DB_PATH.replace('~', HOME)} ` +
        `"SELECT COUNT(*) FROM observations WHERE type='doc'")" -ge 3`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675',
      description:
        'Recursive .md/.mdx walker with stable per-file IDs from ' +
        'sha256(relativePath) formatted as UUID-shape. Idempotent re-runs.',
    },
    {
      name: 'adapter-git-commit-log-ingest',
      where: 'packages/adapters/git/src/index.ts',
      verifyCommand:
        `test "$(sqlite3 ${DB_PATH.replace('~', HOME)} ` +
        `"SELECT COUNT(*) FROM observations WHERE type='commit'")" -ge 15`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be2',
      description:
        'git log -z --pretty=format with \\x1f field separators. Raw 40-char ' +
        'SHA as the stable ID (slice(0,8) = canonical git short-hash).',
    },
    {
      name: 'state-md-parser-and-import-state',
      where: 'packages/core/src/state-md.ts',
      verifyCommand:
        `grep -q "parseStateMd" ${REPO_ROOT}/packages/core/dist/state-md.js && ` +
        `grep -q "parseStateMdToCheckpoint" ${REPO_ROOT}/packages/core/dist/state-md.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b059',
      description:
        'Pure string -> CheckpointInput parser. First-word category ' +
        'classification fixed the "DORMANT (built but not the active path)" ' +
        'misclassification bug.',
    },
    {
      name: 'privacy-filter-a3-extensions',
      where: 'packages/core/src/observation.ts',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/privacy-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '74751b2',
      description:
        '11 named patterns (4 baseline + 7 §A3 additions). Now actually ' +
        'scrubs, not just detects. Operator-extensible via ' +
        '$CONTINUUM_PRIVACY_CONFIG JSON file.',
    },
    {
      name: 'storage-upsert-primitive',
      where: 'packages/core/src/storage.ts (interface) + storage-sqlite.ts (impl)',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage.d.ts && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675',
      description:
        'StorageBackend.upsertObservation() — caller-supplied stable ID, ' +
        'INSERT ... ON CONFLICT(id) DO UPDATE. Powers idempotent re-syncs.',
    },
    {
      name: 'cross-source-fts5-unified-index-proven',
      where: 'packages/core/src/storage-sqlite.ts (searchObservations)',
      verifyCommand:
        `test "$(sqlite3 ${DB_PATH.replace('~', HOME)} ` +
        `"SELECT COUNT(DISTINCT o.type) FROM observations_fts ` +
        `JOIN observations o ON o.rowid = observations_fts.rowid ` +
        `WHERE observations_fts MATCH 'RecursiveMAS'")" -ge 2`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be2',
      description:
        'Search for "RecursiveMAS" returns hits across BOTH type=doc AND ' +
        'type=commit from a single FTS5 query — empirical proof the moat ' +
        'is a unified index, not parallel silos.',
    },
  ],
  dormant: [
    // ─── V0.5 stub entries (NEW — built, opt-in via env var) ─────────────
    {
      name: 'hybrid-storage-backend-stub',
      where: 'packages/core/src/storage-hybrid.ts',
      verifyCommand:
        `grep -q "class HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js && ` +
        `grep -q "vectorSearch" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js && ` +
        `grep -q "flushVectorWrites" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js`,
      verifiedAt: VERIFIED_AT,
      description:
        'V0.5 Path A from Issue #20. Composes SQLiteStorageBackend ' +
        '(relational) + RuVector (vector). Sync StorageBackend interface ' +
        'untouched — vector ops exposed as new async methods (vectorSearch, ' +
        'flushVectorWrites, vectorCount). Vector indexing fires in the ' +
        'background on every insertObservation/upsertObservation.',
    },
    {
      name: 'embedder-pipeline-minilm-l6-v2',
      where: 'packages/core/src/embedder.ts',
      verifyCommand:
        `grep -q "embed" ${REPO_ROOT}/packages/core/dist/embedder.js && ` +
        `grep -q "embeddingDimensions" ${REPO_ROOT}/packages/core/dist/embedder.js`,
      verifiedAt: VERIFIED_AT,
      description:
        '@xenova/transformers feature-extraction pipeline wrapping ' +
        'Xenova/all-MiniLM-L6-v2 (384-dim, MIT, ~25 MB on disk after ' +
        'first use). Lazy-loaded — sqlite-only operators never pay the ' +
        'ONNX runtime cost. Model overridable via ' +
        '$CONTINUUM_EMBEDDING_MODEL.',
    },
    {
      name: 'factory-storage-backend-toggle',
      where: 'packages/core/src/factory.ts',
      verifyCommand:
        `grep -q "CONTINUUM_STORAGE_BACKEND" ${REPO_ROOT}/packages/core/dist/factory.js && ` +
        `grep -q "HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/factory.js`,
      verifiedAt: VERIFIED_AT,
      description:
        'openStorage() routes on CONTINUUM_STORAGE_BACKEND env var: ' +
        '"sqlite" (default) → SQLiteStorageBackend; "hybrid" / "ruvector" ' +
        '→ HybridStorageBackend. Same-day backend swap requires no code ' +
        'change in consumers.',
    },
    {
      name: 'ruvector-smoke-test-passes',
      where: 'scripts/ruvector-smoke.mjs',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/ruvector-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      description:
        '9-check end-to-end smoke: factory routing + sync StorageBackend ' +
        'parity (recordCheckpoint, todo round-trip, FTS5) + background ' +
        'vector indexing + flush + vectorCount + semantic search top-match ' +
        'assertion. Proves the V0.5 stub does what it claims, on a fresh ' +
        'throwaway DB.',
    },
  ],
  broken: [],
});

console.log('V0.5 hybrid-stub checkpoint written.');
console.log('  project:   ', PROJECT_ID);
console.log('  id:        ', snapshot.id);
console.log('  timestamp: ', snapshot.timestamp);
console.log('  hash:      ', snapshot.hash);
console.log('  active:    ', snapshot.active.length, 'entries (V0-polish carried forward)');
console.log('  dormant:   ', snapshot.dormant.length, 'entries (V0.5 stub — opt-in via env var)');
console.log('  broken:    ', snapshot.broken.length, 'entries');

s.close();
