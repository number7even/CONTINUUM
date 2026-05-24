#!/usr/bin/env node
/**
 * Reproducible artifact — V0 POLISH COMPLETE checkpoint, 2026-05-24.
 *
 * Stamps the post-V0-polish state of the engine itself into the
 * `continuum` project DB (this repo IS the dogfood; the `continuum`
 * project's docs+git observations live in the same DB this snapshot
 * lands in, so the briefing resource for this project is now fully
 * populated by one consistent source of truth).
 *
 * Companion to v0-polish-2026-05-15.mjs (VC-Hospitality's earlier
 * mid-cycle milestone). This one captures the close-out of the V0
 * polish backlog originally itemised in docs/CTO_ANALYSIS_2026-05-20.md:
 *
 *   ✅ 3 MCP Resources + 2 Prompts + agent_handoff schema  (commit 31fe885)
 *   ✅ CLI (continuum init / start / status)              (commit 89ce758)
 *   ✅ adapter-docs + StorageBackend.upsertObservation()  (commit 0125675)
 *   ✅ adapter-git                                        (commit bc74be2)
 *   ✅ STATE.md parser + continuum import-state           (commit f21b059)
 *   ✅ §A3 privacy filter scrubbing + operator config     (commit 74751b2)
 *
 * RUN WITH:
 *   node scripts/checkpoints/v0-polish-complete-2026-05-24.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot
 * row with a fresh UUID, timestamp, and hash — checkpoints are immutable
 * by design (V0 schema, ARCHITECTURE.md §4). Use this script for
 * archival / emergency recovery, not as an idempotency primitive.
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

const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'V0 polish COMPLETE: 6 commits closed the original CTO-doc backlog. ' +
    'MCP surface = 7 tools + 4 Resources + 2 Prompts. CLI shipped. ' +
    'Source-moat coverage 3-of-5 (export + docs + git). Cross-source ' +
    'FTS5 search proven to be one unified index, not parallel silos. ' +
    'Privacy filter now actually scrubs (not just detects) 11 patterns, ' +
    'with operator-extensible JSON config and opt-in Shannon-entropy. ' +
    'STATE.md parser auto-imports first checkpoint via continuum init. ' +
    'V0.5 (RuVector migration) is the next major phase.',
  active: [
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
        '7 tools (record_checkpoint / get_state / get_digest / search_docs / ' +
        'get_todos / create_todo / update_todo) + 4 Resources (todos/open / ' +
        'state/current / digest/latest / session/briefing) + 2 Prompts ' +
        '(session_start / cite). session/briefing is the Layer-0 markdown ' +
        'document that eliminates 3-5 warm-up tool calls per AI session.',
    },
    {
      name: 'cli-init-start-status-import-state',
      where: 'packages/cli/src/index.ts',
      verifyCommand:
        `node ${REPO_ROOT}/packages/cli/dist/index.js --help 2>&1 | ` +
        `grep -qE 'import-state'`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b059',
      description:
        'continuum init / start / status / import-state. Hand-rolled argv, ' +
        'no new runtime deps. init auto-imports STATE.md as first checkpoint ' +
        'when present + no existing snapshots. import-state forces a fresh ' +
        'checkpoint for re-syncs after STATE.md edits.',
    },
    {
      name: 'adapter-docs-idempotent-markdown-ingest',
      where: 'packages/adapters/docs/src/index.ts',
      verifyCommand:
        `test "$(sqlite3 ${DB_PATH.replace('~', process.env.HOME)} ` +
        `"SELECT COUNT(*) FROM observations WHERE type='doc'")" -ge 3`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675',
      description:
        'Recursive .md/.mdx walker with stable per-file IDs from ' +
        'sha256(relativePath) formatted as UUID-shape. Re-running --once ' +
        'upserts in place (no duplicates). Backed by new ' +
        'StorageBackend.upsertObservation() primitive — adapters never ' +
        'touch raw SQL.',
    },
    {
      name: 'adapter-git-commit-log-ingest',
      where: 'packages/adapters/git/src/index.ts',
      verifyCommand:
        `test "$(sqlite3 ${DB_PATH.replace('~', process.env.HOME)} ` +
        `"SELECT COUNT(*) FROM observations WHERE type='commit'")" -ge 15`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be2',
      description:
        'git log -z --pretty=format with \\x1f field separators for safe ' +
        'parsing of multi-line bodies. Raw 40-char SHA as the stable ID — ' +
        'slice(0,8) = canonical git short-hash. Diffs intentionally ' +
        'excluded (token + privacy cost; git show <sha> recovers them).',
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
        'Pure string -> CheckpointInput parser (no I/O — trivially testable, ' +
        'reusable from MCP tools). First-word category classification fixed ' +
        'the "DORMANT (built but not the active path)" misclassification ' +
        'bug. Wired into continuum init (auto-import) and exposed as ' +
        'continuum import-state (manual re-import).',
    },
    {
      name: 'privacy-filter-a3-extensions',
      where: 'packages/core/src/observation.ts',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/privacy-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '74751b2',
      description:
        '11 named patterns (4 baseline + 7 new: JWT / GCP / GitHub / Slack / ' +
        'Google API / Stripe live secret + publishable). Patterns now ACTUALLY ' +
        'scrub (replace with [REDACTED:<label>]), not just detect. ' +
        'Operator-extensible via $CONTINUUM_PRIVACY_CONFIG JSON file. ' +
        '13-check smoke test asserts every pattern + the commit-SHA ' +
        'false-positive guard + operator-config edge cases.',
    },
    {
      name: 'storage-upsert-primitive',
      where: 'packages/core/src/storage.ts (interface) + storage-sqlite.ts (impl)',
      verifyCommand:
        // The interface declaration is in storage.d.ts (storage.ts is pure
        // types — TS types compile to nothing in storage.js). Impl is in
        // storage-sqlite.js. Verify both: the contract + the implementation.
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage.d.ts && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675',
      description:
        'StorageBackend.upsertObservation() — caller-supplied stable ID, ' +
        'INSERT ... ON CONFLICT(id) DO UPDATE under the hood. Powers ' +
        'idempotent re-syncs for every adapter that derives a deterministic ' +
        'ID from source-artifact identity (path for docs, SHA for git, ' +
        'PRD-section hash for the future TaskmasterAI adapter — Issue #7).',
    },
    {
      name: 'cross-source-fts5-unified-index-proven',
      where: 'packages/core/src/storage-sqlite.ts (searchObservations)',
      verifyCommand:
        // Note: "StorageBackend" was the first verify candidate but only
        // appears in commit messages, not in the actual /docs content — the
        // verify FAILED on first stamp and exposed the assumption. Switched
        // to "RecursiveMAS" which genuinely appears in BOTH the CTO doc and
        // multiple commit-message bodies. Exactly the kind of drift the
        // verify-then-dissolve discipline is built to catch.
        `test "$(sqlite3 ${DB_PATH.replace('~', process.env.HOME)} ` +
        `"SELECT COUNT(DISTINCT o.type) FROM observations_fts ` +
        `JOIN observations o ON o.rowid = observations_fts.rowid ` +
        `WHERE observations_fts MATCH 'RecursiveMAS'")" -ge 2`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be2',
      description:
        'The capstone. Search for "RecursiveMAS" returns hits across BOTH ' +
        'type=doc (CTO doc §A1/§A2 + the parked-integrations cross-ref) ' +
        'AND type=commit (the v0-polish commit body) from a single FTS5 ' +
        'query — empirical proof the 5-source moat is a unified index, ' +
        'not parallel silos. The verify_command was self-corrected during ' +
        'first stamp: the original "StorageBackend" candidate failed ' +
        'because that string only lives in commits; that failure was the ' +
        'verify-then-dissolve discipline doing exactly its job.',
    },
  ],
  dormant: [
    {
      name: 'shannon-entropy-privacy-detector',
      where: 'packages/core/src/observation.ts (scrubHighEntropy)',
      verifyCommand:
        `CONTINUUM_PRIVACY_ENTROPY_DETECTOR=1 node ${REPO_ROOT}/scripts/privacy-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '74751b2',
      description:
        'Shipped but OFF by default. Threshold 4.5 bits/char (passes hex ' +
        'commit SHAs at ~4.0). Off because long minified JS / inline base64 ' +
        'images produce false positives on typical coding-project content. ' +
        'Operators with stricter requirements (legal, finance, healthcare) ' +
        'opt in via CONTINUUM_PRIVACY_ENTROPY_DETECTOR=1.',
    },
  ],
  broken: [],
});

console.log('V0-polish-complete checkpoint written.');
console.log('  project:   ', PROJECT_ID);
console.log('  id:        ', snapshot.id);
console.log('  timestamp: ', snapshot.timestamp);
console.log('  hash:      ', snapshot.hash);
console.log('  active:    ', snapshot.active.length, 'entries');
console.log('  dormant:   ', snapshot.dormant.length, 'entries');
console.log('  broken:    ', snapshot.broken.length, 'entries');
console.log('  reason:    ', snapshot.reason.slice(0, 80) + '…');

s.close();
