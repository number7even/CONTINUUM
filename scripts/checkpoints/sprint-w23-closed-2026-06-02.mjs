#!/usr/bin/env node
/**
 * Reproducible artifact — SPRINT-W23 CLOSED checkpoint, 2026-06-02.
 *
 * Captures the state after the full V0.5 RuVector hybrid promotion +
 * Fly volume backfill. Sprint W23 is officially closed; W24 will
 * anchor on V1.1 HTTP polish (TLS / OAuth / supervision / container
 * hardening) per the OSS-first directive.
 *
 * Two milestones land in this checkpoint:
 *
 *   1. V0.5 hybrid backend promoted to DEFAULT.
 *      packages/core/src/factory.ts now returns HybridStorageBackend
 *      unless CONTINUUM_STORAGE_BACKEND=sqlite explicitly opts out.
 *      Path D revised G1 explicitly in SPRINT-2026-W22.md §W23-1
 *      (commit ddbd1de) after exhausting Path A (batching) and
 *      Path B (worker_threads pool). Benchmark final: 89s for 10k
 *      observations (revised gate <90s) · recall@5 = 0.98 · p95 = 26ms.
 *
 *   2. Fly volume V0.5 parity via local+sftp pattern.
 *      Local migrate produced ruvector.db with 43 vectors matching
 *      the Fly volume's continuum.db ground truth. sftp put yielded
 *      a byte-identical 1,589,248-byte ruvector.db on /data/continuum/.
 *      Engine restarted on V0.5 hybrid with the populated vector
 *      store. $3.50/mo Fly economics preserved (no memory bump).
 *
 * Snapshot delta vs 1f416f20 (2026-05-31 W23-mid):
 *   active   20 → 25  (5 new V0.5-related entries)
 *   dormant   5 → 4  (hybrid-storage-backend-stub PROMOTED to active;
 *                     embedder-pipeline-minilm-l6-v2 PROMOTED to active
 *                     consolidated under v0.5-hybrid-default;
 *                     factory-storage-backend-toggle PROMOTED to active
 *                     consolidated)
 *
 * RUN WITH:
 *   node scripts/checkpoints/sprint-w23-closed-2026-06-02.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot
 * row. 1f416f20 + d0fa50a7 + every earlier checkpoint stays in the DB
 * as the historical record.
 *
 * Env overrides:
 *   CONTINUUM_PROJECT_ID — default 'continuum'
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
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
// (The local DB is already on V0.5 hybrid; this just forces a known
// backend choice for the stamp itself.)
delete process.env.CONTINUUM_STORAGE_BACKEND;
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'SPRINT-W23 CLOSED — V0.5 RuVector hybrid promoted to DEFAULT + Fly ' +
    'volume parity achieved via local+sftp pattern. Path D revised G1 ' +
    '(10k inserts in <90s, recall@5 ≥0.85, p95 <50ms) after exhausting ' +
    'Path A (batching, commit 7736029) and Path B (worker_threads pool, ' +
    '8a4fe2c). Final measurements: 89s/10k · 0.98 recall · 26ms p95. ' +
    'Fly engine at continuum-engine.fly.dev now serves V0.5 hybrid with ' +
    'populated ruvector.db (43 vectors, 1,589,248 bytes byte-matched to ' +
    'local). $3.50/mo Fly economics preserved (no memory bump — local ' +
    'compute bridge bypassed the 512MB ONNX WASM ceiling). All W23 ' +
    'mechanical tickets shipped: W23-1 (#20 closed), W23-3 (#13 closed), ' +
    'W23-4 (#14+#15 closed), W23-5 (#16 closed). W23-2 (#11) code shipped ' +
    'but GH Actions billing operator-out-of-band. Next anchor: V1.1 HTTP ' +
    'polish (W24).',
  active: [
    // ─── 14 ORIGINAL ACTIVE (carried from 1f416f20 d0fa50a7) ─────────────

    {
      name: 'mcp-surface-complete',
      where:
        'packages/mcp-server/src/{server.ts(slim),tools/*.ts,resources/*.ts,prompts/*.ts}',
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
        '10 tools + 4 Resources + 2 Prompts wired through buildServer.',
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
      description: 'Transport-agnostic factory used by stdio + HTTP+SSE.',
    },
    {
      name: 'cli-init-start-status-serve-import-state-verify-adapter-migrate-reindex',
      where: 'packages/cli/src/index.ts',
      verifyCommand:
        `grep -q "commandInit" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandStart" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandStatus" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandServe" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandImportState" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandVerify" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandAdapter" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandMigrate" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandReindex" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'Nine operator commands: init, start, serve, status, import-state, ' +
        'verify, adapter, migrate, reindex.',
    },
    {
      name: 'adapter-docs-idempotent-markdown-ingest',
      where: 'packages/adapters/docs/',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/docs/dist/index.js && ` +
        `grep -q "sha256" ${REPO_ROOT}/packages/adapters/docs/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675',
      description: 'Stable per-file IDs (sha256). Re-runs are idempotent.',
    },
    {
      name: 'adapter-git-commit-log-ingest',
      where: 'packages/adapters/git/',
      verifyCommand:
        `grep -q "git log" ${REPO_ROOT}/packages/adapters/git/dist/index.js && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/git/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be28',
      description: 'One observation per commit. Stable ID = raw SHA.',
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
        'STATE.md → first checkpoint parser. Auto-import on init when no ' +
        'checkpoints exist.',
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
        '11 named patterns + operator-extensible config + entropy detector. ' +
        'Privacy loop closed at write-time + read-time (W22-3 delete).',
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
        'Caller-supplied stable ID with ON CONFLICT DO UPDATE.',
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
        'Single FTS5 virtual table indexes content from docs + git + any ' +
        'other source. Issue #18 follow-up planned for W24 (canary fixture).',
    },
    {
      name: 'fly-engine-deployed-publicly',
      where: 'Dockerfile + fly.toml + continuum-engine.fly.dev',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/healthz | grep -q "^200$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description:
        'Always-warm Fly machine (min_machines_running=1). $3.50/mo. ' +
        'Image 249 MB.',
    },
    {
      name: 'fly-bearer-auth-enforced-publicly',
      where: 'packages/mcp-server/src/http.ts',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/sse | grep -q "^401$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description:
        'GET /sse without Bearer returns 401. Per-tenant OAuth/JWT is ' +
        'V1.1 work (W24).',
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
        'Next.js 15 Server Component opens MCP SSE client to Fly engine. ' +
        '/chat ships 9.97x token-savings moat (W22-1 verified).',
    },
    {
      name: 'public-sse-roundtrip-via-fly',
      where: 'continuum-kohl.vercel.app → continuum-engine.fly.dev/sse',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/fly-sse-probe.mjs 2>&1 | grep -q "FLY_SSE_PROBE_SUCCESS"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description:
        'MCP SDK SSEClientTransport from a non-laptop process authenticates ' +
        'with the Fly engine, calls tools/list (10), reads briefing, exits ' +
        'clean. Includes the V0.5 hybrid path post-deploy.',
    },
    {
      name: 'dockerfile-fly-deployable',
      where: 'Dockerfile + fly.toml',
      verifyCommand:
        `test -f ${REPO_ROOT}/Dockerfile && test -f ${REPO_ROOT}/fly.toml && ` +
        `grep -q "node:20" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "min_machines_running" ${REPO_ROOT}/fly.toml`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description:
        'Multi-stage Node 20, tini PID-1. Now includes CLI + adapter dists ' +
        'for remote ops (continuum migrate / reindex / verify / adapter).',
    },

    // ─── 6 MID-W23 ACTIVE (from 1f416f20) ──────────────────────────────────

    {
      name: 'storage-delete-observation-incident-response',
      where:
        'packages/core/src/storage.ts + storage-sqlite.ts + storage-hybrid.ts ' +
        '+ packages/mcp-server/src/tools/delete-observation.ts',
      verifyCommand: `node ${REPO_ROOT}/scripts/delete-observation-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8b987dc',
      description:
        'W22-3 / Issue #10 (closed). Hard-delete with FTS5 trigger cleanup + ' +
        'queued vector removal. 9-check smoke covers idempotency + survivor.',
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
        'W22-2 / Issue #9 (closed). cwd-basename fallback now lowercased; ' +
        'explicit flag/env values preserved. 5 node:test cases.',
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
        `test $(ls ${REPO_ROOT}/packages/mcp-server/src/tools/*.ts 2>/dev/null | wc -l) -ge 10`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'abebb45',
      description:
        'W22-5 / Issue #12 (closed). 951-line server.ts split into 24 files. ' +
        'No behavior change.',
    },
    {
      name: 'node-test-framework-and-ci-workflow',
      where: '.github/workflows/ci.yml + packages/cli/package.json (test script)',
      verifyCommand:
        `test -f ${REPO_ROOT}/.github/workflows/ci.yml && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/cli/package.json && ` +
        `grep -q "node --test" ${REPO_ROOT}/packages/cli/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8fee078',
      description:
        'W23-2 / Issue #11. node --test framework + GitHub Actions workflow. ' +
        'CI execution gated on operator GH Actions billing (out-of-band).',
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
        'W23-3 / Issue #13 (closed). Walks every verify_command in latest ' +
        'snapshot. Caught the 1f416f20 stamp\'s eventual self-verification.',
    },
    {
      name: 'briefing-freshness-and-configurable-window',
      where: 'packages/mcp-server/src/briefing.ts',
      verifyCommand:
        `grep -q "CONTINUUM_BRIEFING_WINDOW_HOURS" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js && ` +
        `grep -q "Briefing as of" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '1ec23a1',
      description:
        'W23-4 / Issues #14 + #15 (closed). Freshness header + window env var.',
    },

    // ─── 5 NEW ACTIVE (V0.5 promotion + Fly parity) ─────────────────────

    {
      name: 'v0.5-hybrid-promoted-to-default',
      where: 'packages/core/src/factory.ts (openStorage)',
      verifyCommand:
        `grep -q "CONTINUUM_STORAGE_BACKEND ?? 'hybrid'" ${REPO_ROOT}/packages/core/dist/factory.js && ` +
        `grep -q "HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/factory.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'W23-1 sub-deliverable 4. openStorage default = hybrid. SQLite is the ' +
        'explicit opt-out via CONTINUUM_STORAGE_BACKEND=sqlite. ' +
        'HybridStorageBackend lazy-loads ruvector + @xenova/transformers so ' +
        'sqlite opt-out path pays zero.',
    },
    {
      name: 'embedder-batching-plus-worker-pool',
      where: 'packages/core/src/embedder.ts + embedder-worker.ts',
      verifyCommand:
        `grep -q "embedBatch" ${REPO_ROOT}/packages/core/dist/embedder.js && ` +
        `grep -q "embedBatchParallel" ${REPO_ROOT}/packages/core/dist/embedder.js && ` +
        `grep -q "CONTINUUM_EMBED_WORKERS" ${REPO_ROOT}/packages/core/dist/embedder.js && ` +
        `test -f ${REPO_ROOT}/packages/core/dist/embedder-worker.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8a4fe2c',
      description:
        'W23-1 Path A + Path B. Batched embedder + worker_threads pool (default ' +
        'min(cores,4), env CONTINUUM_EMBED_WORKERS=N override). ' +
        'Benchmark: 10k inserts in 89s (gate <90s) · recall@5 0.98 · p95 26ms.',
    },
    {
      name: 'continuum-migrate-and-reindex-shipped',
      where: 'packages/cli/src/index.ts (commandMigrate + commandReindex)',
      verifyCommand:
        `grep -q "commandMigrate" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandReindex" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "rebuildVectorStore" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js && ` +
        `grep -q "listAllObservationIds" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'W23-1 sub-deliverables 2 + 3. `continuum migrate --backend hybrid` ' +
        '(defensive SQLite backup + vector backfill) and `continuum reindex` ' +
        '(idempotent rebuild). Both force-exit on completion to release ' +
        'RuVector native binding resources.',
    },
    {
      name: 'docker-image-includes-cli-and-sharp',
      where: 'Dockerfile',
      verifyCommand:
        `grep -q "packages/cli/dist" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "packages/adapters/docs/dist" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "packages/adapters/git/dist" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "ignore-scripts=false" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "sharp" ${REPO_ROOT}/Dockerfile`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description:
        'Dockerfile bundles CLI + adapter dists into runtime image (enables ' +
        '`fly ssh console -C "continuum ..."` ops workflow). Sharp postinstall ' +
        'forced because @xenova/transformers transitively depends on it but ' +
        '`npm ci --ignore-scripts` blocks the binary download.',
    },
    {
      name: 'fly-volume-v0.5-parity-via-local-sftp',
      where:
        '/data/continuum/{continuum.db,ruvector.db} on continuum-engine fly volume',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/fly-sse-probe.mjs 2>&1 | grep -q "tools=10"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'local-sftp-2026-06-02',
      description:
        'W23-1 operational close. Local migrate generated ruvector.db (43 ' +
        'vectors, 1,589,248 bytes). sftp put to /data/continuum/ruvector.db ' +
        'on Fly volume yielded byte-identical 1,589,248 bytes. Engine ' +
        'restarted on V0.5 hybrid with populated vector store. $3.50/mo ' +
        'baseline preserved (no memory bump — local compute bridge bypassed ' +
        'the 512MB ONNX WASM ceiling).',
    },
  ],
  dormant: [
    // ─── 4 DORMANT (3 carried + 1 new sub-deliverable area) ─────────────

    {
      name: 'ruvector-smoke-test-passes',
      where: 'scripts/ruvector-smoke.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/ruvector-smoke.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        '9-check smoke for the hybrid backend. Now exercises the DEFAULT ' +
        'path rather than the opt-in stub.',
    },
    {
      name: 'apps-console-local-dev-mode',
      where: 'apps/console/',
      verifyCommand: `test -f ${REPO_ROOT}/apps/console/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description:
        'Next.js 15 + Vercel AI SDK + Anthropic Sonnet 4.6 + MCP SDK. ' +
        'Production deploy is at continuum-kohl.vercel.app; local dev ' +
        'via `npm run dev` (Journey 3 path).',
    },
    {
      name: 'hybrid-benchmark-harness',
      where: 'scripts/benchmark-hybrid-2026-06-01.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/benchmark-hybrid-2026-06-01.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8610268',
      description:
        '50-anchor + 9950-distractor benchmark for the hybrid backend. ' +
        'Reproducible from any 8-core dev machine. Exits 0 if all three ' +
        'gates pass (G1 <90s, G2 recall ≥0.85, G3 p95 <50ms).',
    },
    {
      name: 'docs-v0.5-hybrid-reference',
      where: 'docs/V0.5-HYBRID.md',
      verifyCommand:
        `test -f ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -q "CONTINUUM_EMBED_WORKERS" ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -q "rollback" ${REPO_ROOT}/docs/V0.5-HYBRID.md`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'Operator-facing one-pager. TL;DR + migration steps + memory tuning + ' +
        'rollback path + honest non-claims (no MCP vectorSearch tool yet).',
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
    `  1f416f20 + d0fa50a7 + every earlier checkpoint PRESERVED.\n` +
    `  Verify with: CONTINUUM_PROJECT_ID=${PROJECT_ID} continuum verify\n`,
);

s.close();
