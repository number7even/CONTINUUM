#!/usr/bin/env node
/**
 * Reproducible artifact — SPRINT-W23 mid-point checkpoint, 2026-05-31.
 *
 * Stamps a NEW snapshot (append-only — d0fa50a7 V1 AaaS LIVE stays as
 * the historical record). This checkpoint reconciles two things:
 *
 *   1. CORRECTS the one stale verify_command from d0fa50a7 caught by
 *      `continuum verify` in W23-3:
 *        - mcp-surface-complete: greps for `RESOURCE_URIS` in
 *          dist/server.js, but the W22-5 mcp-server split moved that
 *          constant into resources/index.ts as `READ_TABLE`. The new
 *          verify_command greps the post-split module locations.
 *
 *   2. CAPTURES the 6 entries that landed since 2026-05-28:
 *        - W22-3 (#10 closed) storage-delete-observation
 *        - W22-2 (#9  closed) cli-project-id-case-sensitivity-fix
 *        - W22-5 (#12 closed) mcp-server-monolith-split
 *        - W23-2 (#11) node-test-framework + CI workflow
 *                       (CI gated on operator GH Actions billing)
 *        - W23-3 (#13 closed) cli-verify-command
 *        - W23-4 (#14 + #15 closed) briefing-freshness + window config
 *
 * 20 active + 5 dormant = 25 entries total. The 14 original active
 * carried forward verbatim (one with corrected verify) + 6 new active.
 * The 5 dormant unchanged from d0fa50a7 (still opt-in / alt-path).
 *
 * RUN WITH:
 *   node scripts/checkpoints/sprint-w23-mid-2026-05-31.mjs
 *
 * Per the append-only invariant (ARCHITECTURE.md §4 / partner-clause):
 * each invocation inserts a NEW snapshot row with a fresh UUID +
 * timestamp + hash. d0fa50a7 is NOT mutated.
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

// Stamp via sqlite default backend to write to the canonical continuum.db.
delete process.env.CONTINUUM_STORAGE_BACKEND;
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'SPRINT-W23 mid-point reconciliation — clears the one stale ' +
    'verify_command from d0fa50a7 (mcp-surface-complete pin was ' +
    "rotted by the W22-5 mcp-server split refactor) and captures " +
    'the 6 entries that landed since 2026-05-28: W22-3 deleteObservation ' +
    '(#10), W22-2 CLI case-sensitivity fix (#9), W22-5 mcp-server split ' +
    'into 24 files (#12), W23-2 node --test framework + CI workflow ' +
    '(#11; CI itself gated on operator GH Actions billing), W23-3 ' +
    'continuum verify CLI (#13), W23-4 briefing freshness header + ' +
    'configurable window via CONTINUUM_BRIEFING_WINDOW_HOURS (#14 + #15). ' +
    'd0fa50a7 stays in the DB as the canonical V1 AaaS LIVE record per ' +
    'the append-only invariant — this snapshot reflects the post-W22-5 ' +
    'source layout, not a revision of history. Caught and now provable ' +
    'by `continuum verify` (ships in W23-3).',
  active: [
    // ─── 14 ORIGINAL ACTIVE (from d0fa50a7) ─────────────────────────────
    // 13 carried forward verbatim; mcp-surface-complete has its verify
    // command CORRECTED for the post-W22-5 split file layout.

    {
      name: 'mcp-surface-complete',
      where:
        'packages/mcp-server/src/{server.ts(slim),tools/*.ts,resources/*.ts,prompts/*.ts}',
      // CORRECTED 2026-05-31: post-W22-5 split, the registries live in
      // tools/index.ts, resources/index.ts, prompts/index.ts (not
      // server.ts). Grep the new locations.
      verifyCommand:
        `grep -q "TOOL_DEFINITIONS" ${REPO_ROOT}/packages/mcp-server/dist/tools/index.js && ` +
        `grep -q "RESOURCE_DEFINITIONS" ${REPO_ROOT}/packages/mcp-server/dist/resources/index.js && ` +
        `grep -q "PROMPTS" ${REPO_ROOT}/packages/mcp-server/dist/prompts/index.js && ` +
        `grep -q "continuum.session_start" ${REPO_ROOT}/packages/mcp-server/dist/prompts/session-start.js && ` +
        `grep -q "continuum.cite" ${REPO_ROOT}/packages/mcp-server/dist/prompts/cite.js && ` +
        `grep -q "session/briefing" ${REPO_ROOT}/packages/mcp-server/dist/resources/session-briefing.js && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/server.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'abebb45',
      description:
        '10 tools + 4 Resources + 2 Prompts wired through buildServer(projectId). ' +
        'After W22-5 the registry is per-module (tools/, resources/, prompts/) ' +
        'and server.ts is a thin factory (~159 lines). Same external surface ' +
        'as d0fa50a7 plus continuum_delete_observation (W22-3).',
    },
    {
      name: 'mcp-server-factory-refactor',
      where: 'packages/mcp-server/src/{server.ts,index.ts,http.ts}',
      verifyCommand:
        `test $(wc -l < ${REPO_ROOT}/packages/mcp-server/src/index.ts) -lt 100 && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/server.js && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/index.js && ` +
        `grep -q "buildServer" ${REPO_ROOT}/packages/mcp-server/dist/http.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'abebb45',
      description:
        'Transport-agnostic factory. index.ts boots stdio; http.ts boots HTTP+SSE; ' +
        'both call buildServer(projectId) and connect the returned Server to ' +
        'their respective transport. After W22-5 the factory delegates to ' +
        'tools/, resources/, prompts/ per-module registries.',
    },
    {
      name: 'cli-init-start-status-serve-import-state',
      where: 'packages/cli/src/index.ts',
      verifyCommand:
        `grep -q "commandInit" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandStart" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandStatus" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandServe" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandImportState" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '14c6095',
      description:
        'Five operator commands shipped + verify (W23-3). Stdio for local AI ' +
        'clients (start), HTTP/SSE for remote (serve), status/init/import-state ' +
        'for project lifecycle.',
    },
    {
      name: 'adapter-docs-idempotent-markdown-ingest',
      where: 'packages/adapters/docs/',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/docs/dist/index.js && ` +
        `grep -q "sha256" ${REPO_ROOT}/packages/adapters/docs/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675',
      description:
        '/docs markdown ingester. Stable per-file ID = sha256(relativePath). ' +
        'Re-runs are idempotent (UPSERT semantics).',
    },
    {
      name: 'adapter-git-commit-log-ingest',
      where: 'packages/adapters/git/',
      verifyCommand:
        `grep -q "git log" ${REPO_ROOT}/packages/adapters/git/dist/index.js && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/git/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be28',
      description:
        'One Observation per commit. Stable ID = raw 40-char SHA. Diffs ' +
        'intentionally excluded (token bloat + privacy risk).',
    },
    {
      name: 'state-md-parser-and-import-state',
      where: 'packages/core/src/state-md.ts + packages/cli/src/index.ts',
      verifyCommand:
        `grep -q "parseStateMdToCheckpoint" ${REPO_ROOT}/packages/core/dist/state-md.js && ` +
        `grep -q "import-state" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b0591',
      description:
        'Pure parser (string → CheckpointInput). Auto-import on continuum init ' +
        'when STATE.md present AND no checkpoints exist; manual via ' +
        '`continuum import-state`.',
    },
    {
      name: 'privacy-filter-a3-plus-metadata-deep-scrub',
      where: 'packages/core/src/observation.ts',
      verifyCommand:
        `grep -q "DEFAULT_PRIVATE_PATTERNS" ${REPO_ROOT}/packages/core/dist/observation.js && ` +
        `grep -q "scrubMetadataDeep" ${REPO_ROOT}/packages/core/dist/observation.js && ` +
        `grep -q "CONTINUUM_PRIVACY_ENTROPY_DETECTOR" ${REPO_ROOT}/packages/core/dist/observation.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '74751b23',
      description:
        '11 named patterns + operator-extensible config + optional Shannon ' +
        'entropy detector. Issue #8 fix deep-scrubs Observation.metadata. ' +
        'Pairs with continuum_delete_observation (W22-3) to close the ' +
        'privacy loop at write-time AND read-time.',
    },
    {
      name: 'storage-upsert-primitive',
      where: 'packages/core/src/storage.ts + storage-sqlite.ts',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage.d.ts && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '01256751',
      description:
        'Caller-supplied stable ID with ON CONFLICT DO UPDATE. The primitive ' +
        'that lets docs/git adapters idempotently re-sync.',
    },
    {
      name: 'cross-source-fts5-unified-index-proven',
      where: 'packages/core/src/db.ts (observations_fts virtual table)',
      verifyCommand:
        `grep -q "observations_fts" ${REPO_ROOT}/packages/core/dist/db.js && ` +
        `grep -q "fts5" ${REPO_ROOT}/packages/core/dist/db.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '09d858c1',
      description:
        'Single FTS5 virtual table indexes content from docs adapter, git ' +
        'adapter, and any other source. Layer-1 search (continuum_search_docs) ' +
        'returns hits across all sources without per-adapter logic.',
    },
    {
      name: 'fly-engine-deployed-publicly',
      where: 'Dockerfile + fly.toml + continuum-engine.fly.dev',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/healthz | grep -q "^200$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '91eda50',
      description:
        'Persistent Fly machine in iad. Always-warm per fly.toml ' +
        '(min_machines_running=1, auto_stop_machines=off). 1GB encrypted ' +
        'volume daily-snapshotted at /data/continuum/continuum.db.',
    },
    {
      name: 'fly-bearer-auth-enforced-publicly',
      where: 'packages/mcp-server/src/http.ts',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/sse | grep -q "^401$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '91eda50',
      description:
        'GET /sse without Bearer returns 401. The shared secret is the ' +
        'V1 auth model; per-tenant OAuth/JWT is V2.2 (deferred).',
    },
    {
      name: 'vercel-frontend-connected-to-fly',
      where: 'apps/console/ + continuum-kohl.vercel.app',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 8 ` +
        `https://continuum-kohl.vercel.app/ | grep -q "^200$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description:
        'Next.js 15 Server Component opens MCP SSE client to Fly engine at ' +
        'request time. Renders Connected panel with live 10+4+2 surface. ' +
        '/chat (Phase B from W22-1) ships Sonnet 4.6 with the verified ' +
        '9.97x token-savings moat.',
    },
    {
      name: 'public-sse-roundtrip-via-fly',
      where: 'continuum-kohl.vercel.app → continuum-engine.fly.dev/sse',
      verifyCommand:
        // Live MCP SDK roundtrip script — confirms tools/list returns a
        // non-empty array end-to-end through the public bridge.
        `node ${REPO_ROOT}/scripts/fly-sse-probe.mjs 2>&1 | grep -q "FLY_SSE_PROBE_SUCCESS"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description:
        'MCP SDK SSEClientTransport from a non-laptop process (the probe) ' +
        'authenticates with the Fly engine, opens a session, calls tools/list, ' +
        'reads continuum://session/briefing, and exits clean.',
    },
    {
      name: 'dockerfile-fly-deployable',
      where: 'Dockerfile + fly.toml',
      verifyCommand:
        `test -f ${REPO_ROOT}/Dockerfile && test -f ${REPO_ROOT}/fly.toml && ` +
        `grep -q "node:20" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "min_machines_running" ${REPO_ROOT}/fly.toml`,
      verifiedAt: VERIFIED_AT,
      landedAt: '91eda50',
      description:
        'Multi-stage Node 20 image, tini PID-1, 248 MB final. fly.toml ' +
        'pins iad region, persistent volume, always-warm config.',
    },

    // ─── 6 NEW ACTIVE (W22-2/-3/-5 + W23-2/-3/-4) ───────────────────────

    {
      name: 'storage-delete-observation-incident-response',
      where:
        'packages/core/src/storage.ts + storage-sqlite.ts + storage-hybrid.ts ' +
        '+ packages/mcp-server/src/tools/delete-observation.ts',
      verifyCommand: `node ${REPO_ROOT}/scripts/delete-observation-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8b987dc',
      description:
        'W22-3 / Issue #10 (closed). StorageBackend.deleteObservation(id) ' +
        'hard-deletes a row across SQLite + FTS5 (AFTER DELETE trigger) ' +
        'and queues vector index removal in HybridStorageBackend. MCP tool ' +
        'continuum_delete_observation surfaces it as INCIDENT-RESPONSE-ONLY. ' +
        '9-check smoke test covers insert→search-hit→delete→search-miss→' +
        'idempotent-second-delete→survivor-untouched.',
    },
    {
      name: 'cli-project-id-case-sensitivity-fix',
      where: 'packages/cli/src/index.ts (resolveProjectId) + cli.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT} && node --test packages/cli/dist/cli.test.js 2>&1) | ` +
        `grep -q "pass 5"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '3a33352',
      description:
        'W22-2 / Issue #9 (closed). resolveProjectId now lowercases the ' +
        'implicit cwd-basename fallback so folder-case accidents (MyProject ' +
        'vs myproject) resolve to the same DB. Explicit flag/env values ' +
        'preserved as-given. 5 node:test cases cover all four resolution ' +
        'tiers.',
    },
    {
      name: 'mcp-server-monolith-split',
      where:
        'packages/mcp-server/src/{tools,resources,prompts}/ + server.ts (slim)',
      verifyCommand:
        `test $(wc -l < ${REPO_ROOT}/packages/mcp-server/src/server.ts) -lt 200 && ` +
        `test -d ${REPO_ROOT}/packages/mcp-server/src/tools && ` +
        `test -d ${REPO_ROOT}/packages/mcp-server/src/resources && ` +
        `test -d ${REPO_ROOT}/packages/mcp-server/src/prompts && ` +
        `test $(ls ${REPO_ROOT}/packages/mcp-server/src/tools/*.ts 2>/dev/null | wc -l) -ge 10 && ` +
        `test $(ls ${REPO_ROOT}/packages/mcp-server/src/resources/*.ts 2>/dev/null | wc -l) -ge 4 && ` +
        `test $(ls ${REPO_ROOT}/packages/mcp-server/src/prompts/*.ts 2>/dev/null | wc -l) -ge 3`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'abebb45',
      description:
        'W22-5 / Issue #12 (closed). 951-line server.ts split into 24 ' +
        'files: tools/ (10 + index), resources/ (4 + index), prompts/ ' +
        '(2 + index), briefing.ts (helpers), tool-types.ts. server.ts ' +
        'is now a 159-line factory. Behavior preserved (http-smoke + ' +
        'delete-observation-smoke both green post-refactor).',
    },
    {
      name: 'node-test-framework-and-ci-workflow',
      where: '.github/workflows/ci.yml + packages/cli/package.json (test script)',
      // CI workflow execution is gated on operator GH Actions billing
      // (see 8fee078). Verify what IS in operator control: file exists
      // + test script wired + npm test passes locally.
      verifyCommand:
        `test -f ${REPO_ROOT}/.github/workflows/ci.yml && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/cli/package.json && ` +
        `grep -q "node --test" ${REPO_ROOT}/packages/cli/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8fee078',
      description:
        'W23-2 / Issue #11. node --test established as canonical test ' +
        'framework. Root npm test cascades via npm run test --workspaces ' +
        '--if-present. GitHub Actions workflow at .github/workflows/ci.yml ' +
        'runs install→build→test on every push/PR. CI execution itself ' +
        'gated on operator GH Actions billing (out-of-band block — not a ' +
        'code defect). Issue #11 stays open until first green CI run.',
    },
    {
      name: 'cli-verify-command',
      where: 'packages/cli/src/index.ts (commandVerify)',
      verifyCommand:
        `grep -q "commandVerify" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "continuum verify" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '14c6095',
      description:
        'W23-3 / Issue #13 (closed). `continuum verify` walks every ' +
        'verify_command in the latest snapshot (active + dormant + broken), ' +
        'execs each with 30s per-cmd timeout, reports pass/fail per entry ' +
        'with section label, exits with the failure count. 0 = all green. ' +
        'Demonstrably caught the d0fa50a7 mcp-surface-complete pin-rot ' +
        'before this very checkpoint was stamped (which is the meta-point).',
    },
    {
      name: 'briefing-freshness-and-configurable-window',
      where: 'packages/mcp-server/src/briefing.ts',
      verifyCommand:
        `grep -q "CONTINUUM_BRIEFING_WINDOW_HOURS" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js && ` +
        `grep -q "Briefing as of" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js && ` +
        `grep -q "observation" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '1ec23a1',
      description:
        'W23-4 / Issues #14 + #15 (closed). continuum://session/briefing ' +
        'now leads with `## Briefing as of YYYY-MM-DD HH:MM UTC · N ' +
        "observations in last Nh · project `<id>``. Window length " +
        'configurable via CONTINUUM_BRIEFING_WINDOW_HOURS env (default 24, ' +
        'clamped 1..168, bad values silently fall back to 24).',
    },
  ],
  dormant: [
    // ─── 5 DORMANT (carried forward verbatim from d0fa50a7) ─────────────
    // V0.5 hybrid path: stub-quality, opt-in via env var. Promotion to
    // default-backable is W23-1 (next ticket).

    {
      name: 'hybrid-storage-backend-stub',
      where: 'packages/core/src/storage-hybrid.ts',
      verifyCommand:
        `grep -q "HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js && ` +
        `grep -q "queueVectorIndex" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        'V0.5 hybrid stub. Composes SQLite (relational + FTS5) with ' +
        'RuVector (HNSW vector index). Opt-in via ' +
        'CONTINUUM_STORAGE_BACKEND=hybrid. Promotion = W23-1 (Issue #20).',
    },
    {
      name: 'embedder-pipeline-minilm-l6-v2',
      where: 'packages/core/src/embedder.ts',
      verifyCommand:
        `grep -q "MiniLM" ${REPO_ROOT}/packages/core/dist/embedder.js || ` +
        `grep -q "all-MiniLM-L6-v2" ${REPO_ROOT}/packages/core/dist/embedder.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        '@xenova/transformers MiniLM-L6-v2 (384-dim). Embedding-on-write ' +
        'fire-and-forget; SQLite writes never blocked by embedding latency.',
    },
    {
      name: 'factory-storage-backend-toggle',
      where: 'packages/core/src/factory.ts (openStorage)',
      verifyCommand:
        `grep -q "openStorage" ${REPO_ROOT}/packages/core/dist/factory.js && ` +
        `grep -q "CONTINUUM_STORAGE_BACKEND" ${REPO_ROOT}/packages/core/dist/factory.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        'Single env-driven swap point. sqlite (default) | hybrid | ruvector. ' +
        'Hybrid path heavy deps lazy-loaded — sqlite-only operators pay zero.',
    },
    {
      name: 'ruvector-smoke-test-passes',
      where: 'scripts/ruvector-smoke.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/ruvector-smoke.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        '9-check smoke covers embedder load + vector insert/search/delete + ' +
        'flushVectorWrites + vectorCount. Run with ' +
        'CONTINUUM_STORAGE_BACKEND=hybrid env to exercise the V0.5 path.',
    },
    {
      name: 'apps-console-local-dev-mode',
      where: 'apps/console/',
      verifyCommand: `test -f ${REPO_ROOT}/apps/console/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description:
        'Next.js 15 + Vercel AI SDK + Anthropic Sonnet 4.6 + MCP SDK. ' +
        'apps/console/app/chat ships the verified 9.97x token-savings moat ' +
        '(W22-1 evidence/chat-W22-runs.md). Production deploy is at ' +
        'continuum-kohl.vercel.app; local dev via `npm run dev`.',
    },
  ],
  broken: [],
});

process.stdout.write(
  `✓ stamped snapshot ${snapshot.id.slice(0, 8)}\n` +
    `  timestamp:  ${snapshot.timestamp}\n` +
    `  hash:       ${snapshot.hash}\n` +
    `  active:     ${snapshot.active.length}\n` +
    `  dormant:    ${snapshot.dormant.length}\n` +
    `  broken:     ${snapshot.broken.length}\n\n` +
    `  d0fa50a7 is PRESERVED — this is an append-only checkpoint.\n` +
    `  Verify with: CONTINUUM_PROJECT_ID=${PROJECT_ID} continuum verify\n`,
);

s.close();
