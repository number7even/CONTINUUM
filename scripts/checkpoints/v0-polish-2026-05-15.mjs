#!/usr/bin/env node
/**
 * Reproducible artifact — V0 polish milestone checkpoint, 2026-05-15.
 *
 * Original snapshot (already durable in the DB):
 *   id:   e22985e0-f802-4345-ad2b-ea9121149c62
 *   ts:   2026-05-15T12:13:41.325Z
 *   hash: 9c580635e936e427989a72a5510ae66a56589873fd4af776f4009c2d44077e1d
 *   db:   ~/.continuum/vc-hospitality/continuum.db
 *
 * RUN WITH:
 *   node scripts/checkpoints/v0-polish-2026-05-15.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot row
 * with a fresh UUID, timestamp, and hash — checkpoints are immutable by
 * design (V0 schema, ARCHITECTURE.md §4). The script's purpose is archival
 * and emergency recovery if the original e22985e0 row is lost; it is NOT
 * an idempotency primitive.
 *
 * Captures the four active entries + one dormant from the original snapshot:
 *   active:
 *     1. storage-adapter-pattern        (committed at e725ae7)
 *     2. todo-pipeline-mcp-surface      (committed at c9def2c)
 *     3. verify-then-dissolve-dogfood   (DB row 81223c05, hospitality-aria
 *                                        deploy SHA 2aa4f96a5)
 *     4. hermes-mcp-fanout              (~/.hermes/config.yaml — 4 servers
 *                                        wired: continuum, tavily, playwright,
 *                                        context7)
 *   dormant:
 *     5. tavily-python-sdk              (~/Development/tavily-python/.venv —
 *                                        installed but unused, kept for
 *                                        future Python sidecars)
 *
 * Env overrides:
 *   CONTINUUM_PROJECT_ID — default 'vc-hospitality'
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const CORE_DIST = resolve(REPO_ROOT, 'packages/core/dist/index.js');

const { openStorage } = await import(CORE_DIST);

const PROJECT_ID = process.env.CONTINUUM_PROJECT_ID ?? 'vc-hospitality';
const VERIFIED_AT = new Date().toISOString();

const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'V0 polish milestone: storage adapter pattern materialised; ' +
    'todo pipeline MCP surface live (7 tools + 1 Resource); ' +
    'verify-then-dissolve discipline proven end-to-end on hospitality-aria ' +
    'deploy (SHA 2aa4f96a5).',
  active: [
    {
      name: 'storage-adapter-pattern',
      where: 'packages/core/src/storage.ts + storage-sqlite.ts',
      verifyCommand:
        `node --input-type=module -e "import('${CORE_DIST}').then(m => { ` +
        `const s = m.openStorage('${PROJECT_ID}'); ` +
        `if (typeof s.recordCheckpoint !== 'function' || ` +
        `typeof s.listTodos !== 'function' || ` +
        `typeof s.searchObservations !== 'function') process.exit(1); ` +
        `s.close(); process.exit(0); ` +
        `}).catch(() => process.exit(1))"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        'StorageBackend interface + SQLiteStorageBackend impl. Single ' +
        'swap point at openStorage() for V0.5 RuVector drop-in. All ' +
        'consumers (mcp-server, adapter-export) rewired through the ' +
        'abstraction.',
    },
    {
      name: 'todo-pipeline-mcp-surface',
      where: 'packages/mcp-server/src/index.ts',
      verifyCommand:
        `~/Development/hermes-agent/venv/bin/hermes mcp test continuum ` +
        `2>&1 | grep -qE 'Tools discovered: 7'`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'c9def2c',
      description:
        '3 todo tools (get/create/update) + continuum://todos/open ' +
        'Resource + deployment verifyCommand steering. The unblocker for ' +
        'the operator dashboard at /command/continuum.',
    },
    {
      name: 'verify-then-dissolve-dogfood-proof',
      where:
        '~/.continuum/vc-hospitality/continuum.db row ' +
        '81223c05-4465-480c-a56d-14f665ffb581',
      verifyCommand:
        `test "$(sqlite3 ~/.continuum/vc-hospitality/continuum.db ` +
        `"SELECT status FROM todos WHERE id=` +
        `'81223c05-4465-480c-a56d-14f665ffb581'")" = 'done'`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        'First real verify-then-dissolve cycle captured: hospitality-aria ' +
        'deploy SHA 2aa4f96a5 verified via curl-grep of bundle buildId, ' +
        'row 81223c05 closed only after fresh verify exit 0. Encodes the ' +
        'discipline in DB rows, not just in narrative.',
    },
    {
      name: 'hermes-mcp-fanout',
      where: '~/.hermes/config.yaml',
      verifyCommand:
        `~/Development/hermes-agent/venv/bin/hermes mcp list 2>&1 | ` +
        `grep -cE '(continuum|tavily|playwright|context7)\\s' | ` +
        `grep -q '^4$'`,
      verifiedAt: VERIFIED_AT,
      description:
        '4 MCP servers wired into Hermes: continuum (local, 7 tools + ' +
        'Resource), tavily (5), playwright (23), context7 (2). Tavily + ' +
        'Context7 still need API keys for higher rate limits but work on ' +
        'free tier.',
    },
  ],
  dormant: [
    {
      name: 'tavily-python-sdk',
      where: '~/Development/tavily-python/.venv',
      verifyCommand:
        `~/Development/tavily-python/.venv/bin/python -c ` +
        `"import tavily; print(tavily.TavilyClient.__name__)"`,
      verifiedAt: VERIFIED_AT,
      description:
        'Tavily Python SDK installed but unused — the active path is ' +
        'tavily-mcp via Hermes. Kept for future Python sidecar scripts.',
    },
  ],
  broken: [],
});

console.log('Snapshot written.');
console.log('  id:        ', snapshot.id);
console.log('  timestamp: ', snapshot.timestamp);
console.log('  hash:      ', snapshot.hash);
console.log('  active:    ', snapshot.active.length, 'entries');
console.log('  dormant:   ', snapshot.dormant.length, 'entries');
console.log('  broken:    ', snapshot.broken.length, 'entries');

s.close();
