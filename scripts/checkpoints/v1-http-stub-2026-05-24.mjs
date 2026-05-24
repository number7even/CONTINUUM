#!/usr/bin/env node
/**
 * Reproducible artifact — V1 HTTP/SSE transport STUB checkpoint, 2026-05-24.
 *
 * Companion to v0-polish-complete- and v0.5-hybrid-stub-2026-05-24.mjs.
 * Stamps the post-V1-HTTP-stub state into the `continuum` project DB.
 *
 * What this milestone covers:
 *   - Issue #8 closed (metadata deep-scrub through privacyFilter).
 *   - mcp-server refactored: index.ts(42 lines, thin stdio entry) +
 *     server.ts(783 lines, buildServer factory) + http.ts(163 lines,
 *     Express + SSEServerTransport + Bearer auth + project routing).
 *     Partial address of Issue #12.
 *   - V1 HTTP/SSE transport — opt-in via `continuum serve` /
 *     $CONTINUUM_HTTP_TOKEN. Stdio remains the default.
 *   - 7-check end-to-end smoke (scripts/http-smoke.mjs) round-trips a
 *     real SDK SSEClientTransport: /healthz no-auth, /sse 401 without
 *     Bearer, /sse 200 with Bearer, tools/list/resources/list/
 *     prompts/list returning the full 7+4+2 surface, briefing rendered
 *     for the routed project.
 *
 * V1 entries land in DORMANT (built, opt-in, not default).
 *
 * RUN WITH:
 *   node scripts/checkpoints/v1-http-stub-2026-05-24.mjs
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

// Stamp from sqlite default backend to write to the canonical continuum.db.
delete process.env.CONTINUUM_STORAGE_BACKEND;
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'V1 HTTP/SSE stub COMPLETE: Issue #8 (metadata deep-scrub) closed. ' +
    'mcp-server refactored into index.ts(42 lines)/server.ts(783)/http.ts(163) ' +
    '— transport-agnostic buildServer() factory shared by stdio + HTTP. ' +
    'Express + SSEServerTransport + Bearer auth + project routing. ' +
    'scripts/http-smoke.mjs round-trips a real SDK SSEClientTransport against ' +
    'the live server; 7 tools + 4 Resources + 2 Prompts verified over SSE. ' +
    'continuum serve CLI command wired. V1 is OPT-IN — stdio remains default; ' +
    'HTTP requires $CONTINUUM_HTTP_TOKEN. Cleared the bridge for a remote ' +
    'Vercel frontend to talk to a hosted CONTINUUM engine.',
  active: [
    // ─── V0-polish-complete entries (carried forward, with two updated to ─
    // ─── reflect this turn's refactor + Issue #8 metadata fix) ──────────────
    {
      name: 'mcp-surface-complete',
      where: 'packages/mcp-server/src/server.ts (buildServer factory) + ./index.ts (stdio) + ./http.ts (HTTP/SSE)',
      verifyCommand:
        `grep -q "continuum.session_start" ${REPO_ROOT}/packages/mcp-server/dist/server.js && ` +
        `grep -q "continuum.cite" ${REPO_ROOT}/packages/mcp-server/dist/server.js && ` +
        `grep -q "session/briefing" ${REPO_ROOT}/packages/mcp-server/dist/server.js && ` +
        `grep -q "RESOURCE_URIS" ${REPO_ROOT}/packages/mcp-server/dist/server.js && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/server.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '31fe885',
      description:
        '7 tools + 4 Resources + 2 Prompts. Now factored out of the stdio ' +
        'entry — buildServer(projectId) in server.ts returns a configured ' +
        'Server + lifecycle handle. index.ts (42 lines) wires stdio; ' +
        'http.ts (163 lines) wires HTTP/SSE. Issue #12 partially addressed.',
    },
    {
      name: 'cli-init-start-status-serve-import-state',
      where: 'packages/cli/src/index.ts',
      verifyCommand:
        `node ${REPO_ROOT}/packages/cli/dist/index.js --help 2>&1 | grep -qE 'import-state' && ` +
        `node ${REPO_ROOT}/packages/cli/dist/index.js --help 2>&1 | grep -qE 'serve'`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b059',
      description:
        'continuum init / start / serve / status / import-state. The new ' +
        'serve command wraps the HTTP/SSE transport (requires ' +
        '$CONTINUUM_HTTP_TOKEN).',
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
      name: 'privacy-filter-a3-plus-metadata-deep-scrub',
      where: 'packages/core/src/observation.ts',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/privacy-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '74751b2',
      description:
        '11 named patterns + operator-extensible JSON config + opt-in ' +
        'Shannon-entropy detector. **Issue #8 closed today**: metadata strings ' +
        'now deep-scrubbed through the same patterns (scrubMetadataDeep). ' +
        'Smoke test extended to 17 checks (13 original + 4 metadata cases). ' +
        'Critical pre-V1 gate — HTTP exposure without this would have been ' +
        'an exfiltration channel for any operator-set metadata field.',
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
        'Search for "RecursiveMAS" hits both type=doc AND type=commit from a ' +
        'single FTS5 query — empirical proof the moat is one unified index.',
    },
  ],
  dormant: [
    // ─── V0.5 stub entries (carried forward — opt-in via env var) ────────
    {
      name: 'hybrid-storage-backend-stub',
      where: 'packages/core/src/storage-hybrid.ts',
      verifyCommand:
        `grep -q "class HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js && ` +
        `grep -q "vectorSearch" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js`,
      verifiedAt: VERIFIED_AT,
      description:
        'V0.5 Path A. Composes SQLite (relational) + RuVector (vector). ' +
        'Activation: CONTINUUM_STORAGE_BACKEND=hybrid.',
    },
    {
      name: 'embedder-pipeline-minilm-l6-v2',
      where: 'packages/core/src/embedder.ts',
      verifyCommand:
        `grep -q "embed" ${REPO_ROOT}/packages/core/dist/embedder.js`,
      verifiedAt: VERIFIED_AT,
      description:
        '@xenova/transformers MiniLM-L6-v2 (384-dim). Lazy-loaded.',
    },
    {
      name: 'factory-storage-backend-toggle',
      where: 'packages/core/src/factory.ts',
      verifyCommand:
        `grep -q "CONTINUUM_STORAGE_BACKEND" ${REPO_ROOT}/packages/core/dist/factory.js`,
      verifiedAt: VERIFIED_AT,
      description:
        'openStorage() routes on env var. sqlite default; hybrid opt-in.',
    },
    {
      name: 'ruvector-smoke-test-passes',
      where: 'scripts/ruvector-smoke.mjs',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/ruvector-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      description:
        '9-check end-to-end smoke for the V0.5 hybrid backend.',
    },
    // ─── V1 HTTP/SSE entries (NEW — opt-in via $CONTINUUM_HTTP_TOKEN) ────
    {
      name: 'mcp-http-sse-transport-stub',
      where: 'packages/mcp-server/src/http.ts',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/http-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      description:
        'Express + @modelcontextprotocol/sdk SSEServerTransport. Bearer ' +
        'auth via $CONTINUUM_HTTP_TOKEN; project routing via ' +
        'X-Continuum-Project header / ?project= query / env default. ' +
        '/healthz exempt for load-balancer probes. Per-session storage ' +
        'instances — buildServer(projectId) called per SSE connect, closed ' +
        'on client disconnect. Smoke test (scripts/http-smoke.mjs) round-' +
        'trips a real SDK SSEClientTransport against the live server with 7 ' +
        'checks (auth + 7 tools + 4 resources + 2 prompts + briefing rendered).',
    },
    {
      name: 'mcp-server-factory-refactor',
      where: 'packages/mcp-server/src/server.ts (783) + index.ts (42) + http.ts (163)',
      verifyCommand:
        `test $(wc -l < ${REPO_ROOT}/packages/mcp-server/src/index.ts) -lt 100 && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/server.js && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/index.js && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/http.js`,
      verifiedAt: VERIFIED_AT,
      description:
        'Transport-agnostic factory. index.ts shrunk from 762 lines to 42 ' +
        '(stdio entry only); server.ts holds the 7+4+2 registry; http.ts ' +
        'wires HTTP/SSE. Issue #12 partially addressed — the index-file-' +
        'too-large concern is resolved, full per-tool-file split deferred.',
    },
    {
      name: 'continuum-serve-cli-command',
      where: 'packages/cli/src/index.ts (commandServe)',
      verifyCommand:
        `node ${REPO_ROOT}/packages/cli/dist/index.js --help 2>&1 | grep -qE '^\\s+serve\\s+Run the MCP HTTP/SSE'`,
      verifiedAt: VERIFIED_AT,
      description:
        'CLI wrapper around the http.ts entry. Validates ' +
        '$CONTINUUM_HTTP_TOKEN is set with a clear error if missing.',
    },
  ],
  broken: [],
});

console.log('V1 HTTP/SSE stub checkpoint written.');
console.log('  project:   ', PROJECT_ID);
console.log('  id:        ', snapshot.id);
console.log('  timestamp: ', snapshot.timestamp);
console.log('  hash:      ', snapshot.hash);
console.log('  active:    ', snapshot.active.length, 'entries (V0-polish carried forward, two descriptions updated)');
console.log('  dormant:   ', snapshot.dormant.length, 'entries (4 V0.5 + 3 V1 — all opt-in)');
console.log('  broken:    ', snapshot.broken.length, 'entries');

s.close();
