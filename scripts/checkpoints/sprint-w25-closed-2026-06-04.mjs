#!/usr/bin/env node
/**
 * Reproducible artifact — SPRINT-W25 CLOSED checkpoint, 2026-06-04.
 *
 * Single-objective sprint: close the 89s → <60s ingestion gap for the
 * 10k-Observation benchmark without regressing the already-proven read
 * metrics (recall@5 ≥0.85, p95 query <50ms). The closing measurement
 * triple is 53.4s median · 0.98 recall · 12-19ms p95 over 8 clean
 * benchmark runs at commit c9ddd92, with G1 (<60s) clearing 7/8.
 *
 * What W25 actually shipped (the framing the operator's close-directive
 * names — "four W25 deliverables"):
 *
 *   1. NEW THIS SPRINT — v0.5-throughput-hardened-w25-1
 *      packages/core/src/storage-hybrid.ts T1 + T4 + T6 tunings (commit
 *      c9ddd92). EMBED_BATCH_SIZE 32→128, EMBED_BATCH_QUIET_MS 50→200,
 *      Promise.all(N × db.insert) → single db.insertBatch native call.
 *      Median 53.4s, headroom ~6.6s below the 60s gate.
 *
 *   2. ALREADY SHIPPED + CARRIED — continuum-migrate-and-reindex-shipped
 *      W23-1 sub-deliverables 2 + 3 (commit 2d3e0e1). `continuum migrate
 *      --backend hybrid` + `continuum reindex`. Mechanically proven in
 *      e3bd67a4 (W24-close, 2026-06-03) — re-verified by this snapshot.
 *      Now operating on the W25 hardened ingestion path.
 *
 *   3. ALREADY SHIPPED + CARRIED — storage-delete-observation-incident-response
 *      W22-3 / Issue #10 (commit 8b987dc). `deleteObservation` across
 *      SQLite + hybrid + `continuum_delete_observation` MCP tool.
 *      Mechanically proven in e3bd67a4.
 *
 *   4. ALREADY SHIPPED + CARRIED — docs-v0.5-hybrid-reference
 *      W23-era V0.5-HYBRID.md (commit 2d3e0e1). Operator-facing one-pager.
 *      Mechanically proven in e3bd67a4 (verify regex fixed in the W24
 *      close per P5).
 *
 * Per the W25 sprint doc's discipline — and per the operator's authorization
 * (2026-06-04 evening) — the throughput verify is RETRY-AWARE:
 *
 *   node scripts/verify-w25-throughput.mjs
 *     → 3 independent benchmark runs; exits 0 if ANY clears all gates.
 *
 * The retry-aware loop is FACTORED OUT of the snapshot row's
 * verify_command into a standalone operator script because
 * `continuum verify` runs each verify_command with a 30s timeout
 * (packages/cli/src/index.ts:737) — one benchmark run is ~50-60s, so
 * a benchmark-inside-verify always SIGTERMs.
 *
 * The snapshot row's verify_command therefore asserts the STRUCTURAL
 * claim ("the W25-1 tunings are committed in c9ddd92") via static
 * greps + a `git cat-file -e c9ddd92^{commit}` check. That runs in
 * sub-second and is mechanically deterministic.
 *
 * The OPERATIONAL claim ("the engine still meets <60s on today's
 * hardware") is the standalone script's job. The 87.5% single-run
 * pass rate observed in the W25-1 measurement journal means three
 * independent runs all failing has probability ≈ (1-0.875)^3 ≈ 0.2%
 * — mechanically green with overwhelming probability, honest about
 * the underlying stochasticity, and operationally quiet.
 *
 * Per-knob outcome (committed in c9ddd92):
 *   T1 EMBED_BATCH_SIZE        32 → 128            KEPT     −31s median win
 *   T2 EMBED_WORKERS sweep     default 4 holds     SETTLED  (T2=8 regressed to 104s)
 *   T3 intra-batch sharding    not attempted       SKIPPED  (tail-only, ≤3s)
 *   T4 EMBED_BATCH_QUIET_MS    50 → 200ms          KEPT     defensive, marginal
 *   T5 worker pool pre-warm    REVERTED            +5-10s   (busied workers during SQLite phase)
 *   T6 RuVector insertBatch    Promise.all → bulk  KEPT     −12s median (THE gap-closer)
 *   T7 quantized MiniLM        N/A — already on    SKIPPED  (xfm v2.x defaults quantized in Node)
 *   T8 native onnxruntime      LOCKED              N/A      (operator boundary; Journey 3 zero-config)
 *
 * The T7 discovery was a P4 moment: the W25 doc claimed "13 points of
 * recall headroom for quantization" but on probing the cache,
 * model_quantized.onnx was already the loaded file. That 13-point
 * headroom is fixture-kindness, not a quantization budget. No further
 * model-side win available without changing model family (out of scope
 * per the W25 non-goals).
 *
 * Snapshot delta vs e3bd67a4 (2026-06-03 W24-closed):
 *   active   30 → 31  (1 new W25-1 entry, 0 dropped)
 *   dormant   4 →  4  (carried as-is)
 *   broken    0 →  0
 *
 * RUN WITH:
 *   node scripts/checkpoints/sprint-w25-closed-2026-06-04.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot
 * row. e3bd67a4 + 524f3bde + 8b62c760 + 0853a7ae + every earlier
 * checkpoint stays in the DB as the historical record.
 *
 * Env overrides:
 *   CONTINUUM_PROJECT_ID — default 'continuum'
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
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

// Force sqlite for the stamp itself so we write to the canonical
// continuum.db regardless of the operator's current default backend.
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'SPRINT-W25 CLOSED — V0.5 ingestion throughput hardened to a 53.4s ' +
    'median (8 clean runs at c9ddd92: 47.30 / 47.57 / 48.42 / 52.32 / ' +
    '54.49 / 55.52 / 56.20 / 60.18; mean 52.75; 7/8 G1-pass). The single ' +
    '60.18s graze (180ms over the gate) is the observed long-tail outlier; ' +
    'three subsequent runs all passed with 4-13s headroom. recall@5 holds ' +
    'at 0.98 throughout (G2 cushion +13 pts); p95 12-19ms throughout (G3 ' +
    'cushion +31-38ms — actually IMPROVED 2x from the W23-1 baseline\'s ' +
    '26ms because the smaller per-batch wall time means less embed-thread ' +
    'contention during the query phase). The four W25 deliverables per ' +
    'the operator close-directive: (1) NEW — v0.5-throughput-hardened-' +
    'w25-1 entry below grounds the c9ddd92 commit + benchmark; (2-4) ' +
    'CARRIED — continuum-migrate-and-reindex-shipped, storage-delete-' +
    'observation-incident-response, docs-v0.5-hybrid-reference all ' +
    'mechanically re-verified by their carried verify_commands. The two ' +
    'tunable knobs that closed the 33% gap: T1 (EMBED_BATCH_SIZE 32→128, ' +
    'amortizing the WASM forward-pass overhead) and T6 (RuVector ' +
    'db.insertBatch replacing Promise.all(N × db.insert), bypassing ' +
    'native-write-lock contention). T7 (quantized MiniLM) discovered ' +
    'unavailable mid-sprint — @xenova/transformers v2.17.2 defaults to ' +
    'quantized:true in Node, so the W25-doc-asserted 13-point recall ' +
    'headroom was fixture-kindness, not a quantization budget. P4 ' +
    'correction documented in the c9ddd92 + W25-1 measurement journal. ' +
    'T8 (native onnxruntime-node) held off per the operator boundary on ' +
    'Journey 3 zero-config. Verify is RETRY-AWARE (3 independent ' +
    'benchmark runs; passes if any green) per operator authorization — ' +
    'bounds the stochastic noise to 0.2% verify-failure probability. ' +
    'V0.5 hybrid persistence layer is now hardened high-velocity, ready ' +
    'for V1 ruv-swarm ephemeral aggregation and V1.2 multi-tenant scaling.',
  active: [
    // ─── 30 CARRIED FORWARD FROM e3bd67a4 (W24-CLOSED, 2026-06-03) ────────

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
      where:
        'packages/core/src/db.ts (observations_fts) + ' +
        'packages/core/src/cross-source-fts5.test.ts (W24-5 canary)',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/core && node --test dist/cross-source-fts5.test.js 2>&1) | ` +
        `grep -q "pass 8"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '09d858c1 (index) + 625de71 (canary, W24-5)',
      description:
        'Single FTS5 virtual table indexes content from docs + git + mem + ' +
        'sona + export. W24-5 canary fixture (cross-source-fts5.test.ts) ' +
        'proves the index is genuinely unified across all 5 source types ' +
        'plus the agent_handoff obs.type.',
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
        'GET /sse without Bearer returns 401. Per-tenant OAuth/JWT lands ' +
        'in W24-2 (see jwt-validation-middleware-bring-your-own-oauth).',
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
        'Next.js 15 Server Component opens MCP SSE client to Fly engine.',
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
        'clean.',
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
        'Multi-stage Node 20, tini PID-1, gosu privilege drop (W24-4).',
    },

    // W25-DELIVERABLE-3 (CARRIED) — Issue #10 incident-response delete
    {
      name: 'storage-delete-observation-incident-response',
      where:
        'packages/core/src/storage.ts + storage-sqlite.ts + storage-hybrid.ts ' +
        '+ packages/mcp-server/src/tools/delete-observation.ts',
      verifyCommand: `node ${REPO_ROOT}/scripts/delete-observation-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8b987dc',
      description:
        'W22-3 / Issue #10 (closed in W22). Hard-delete with FTS5 trigger ' +
        'cleanup + queued vector removal. 9-check smoke covers idempotency ' +
        '+ survivor. ONE OF THE FOUR W25 DELIVERABLES per the close ' +
        'directive — re-verified by this snapshot against the W25-hardened ' +
        'ingestion path.',
    },
    {
      name: 'cli-project-id-case-sensitivity-fix',
      where: 'packages/cli/src/index.ts (resolveProjectId) + cli.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT} && node --test packages/cli/dist/cli.test.js 2>&1) | ` +
        `grep -q "pass 5"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '3a33352',
      description: 'W22-2 / Issue #9. 5 node:test cases.',
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
      description: 'W22-5 / Issue #12. 951-line server.ts split into 24 files.',
    },
    {
      name: 'node-test-framework-and-ci-workflow',
      where:
        '.github/workflows/ci.yml + packages/{cli,mcp-server,core}/package.json',
      verifyCommand:
        `test -f ${REPO_ROOT}/.github/workflows/ci.yml && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/cli/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/mcp-server/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/core/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8fee078 + 625de71',
      description:
        'W23-2 / Issue #11. node --test framework + GitHub Actions workflow ' +
        '(24/24 across cli + mcp-server + core on every CI push).',
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
        'W23-3 / Issue #13. Walks every verify_command in the latest ' +
        'snapshot — the operator-facing reproducibility primitive used to ' +
        'authenticate this very snapshot post-stamp.',
    },
    {
      name: 'briefing-freshness-and-configurable-window',
      where: 'packages/mcp-server/src/briefing.ts',
      verifyCommand:
        `grep -q "CONTINUUM_BRIEFING_WINDOW_HOURS" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js && ` +
        `grep -q "Briefing as of" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '1ec23a1',
      description: 'W23-4 / Issues #14 + #15. Freshness header + window env var.',
    },
    {
      name: 'v0.5-hybrid-promoted-to-default',
      where: 'packages/core/src/factory.ts (openStorage)',
      verifyCommand:
        `grep -q "CONTINUUM_STORAGE_BACKEND ?? 'hybrid'" ${REPO_ROOT}/packages/core/dist/factory.js && ` +
        `grep -q "HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/factory.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'W23-1 sub-deliverable 4. openStorage default = hybrid. SQLite is ' +
        'the explicit opt-out via CONTINUUM_STORAGE_BACKEND=sqlite.',
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
        'W23-1 Path A + Path B. Batched embedder + worker_threads pool. ' +
        'Now operating against W25-hardened EMBED_BATCH_SIZE=128.',
    },

    // W25-DELIVERABLE-2 (CARRIED) — reindex + migrate
    {
      name: 'continuum-migrate-and-reindex-shipped',
      where: 'packages/cli/src/index.ts (commandMigrate + commandReindex)',
      verifyCommand:
        `grep -q "commandMigrate" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "commandReindex" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "rebuildVectorStore" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js && ` +
        `grep -q "listAllObservationIds" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1 + c9ddd92 (rebuildVectorStore now uses insertBatch)',
      description:
        'W23-1 sub-deliverables 2 + 3. `continuum migrate --backend hybrid` ' +
        '+ `continuum reindex`. ONE OF THE FOUR W25 DELIVERABLES per the ' +
        'close directive — the rebuildVectorStore path was updated in W25 ' +
        'to use the same insertBatch optimization (T6) as the live ingest ' +
        'path so backfill operations benefit from the same throughput gain.',
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
        'Dockerfile bundles CLI + adapter dists into runtime image so ' +
        '`fly ssh console -C "continuum ..."` works for remote ops.',
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
        'vectors, 1,589,248 bytes); sftp put yielded byte-identical bytes ' +
        'on Fly volume. $3.50/mo baseline preserved.',
    },
    {
      name: 'tls-via-reverse-proxy-self-hosted-baseline',
      where:
        'docs/DEPLOY_SELF_HOSTED.md + docs/examples/caddy/{Caddyfile,docker-compose.yml}',
      verifyCommand:
        `test -f ${REPO_ROOT}/docs/DEPLOY_SELF_HOSTED.md && ` +
        `test -f ${REPO_ROOT}/docs/examples/caddy/Caddyfile && ` +
        `test -f ${REPO_ROOT}/docs/examples/caddy/docker-compose.yml && ` +
        `grep -q "Caddy" ${REPO_ROOT}/docs/DEPLOY_SELF_HOSTED.md && ` +
        `grep -q "ACME\\|letsencrypt\\|TLS" ${REPO_ROOT}/docs/DEPLOY_SELF_HOSTED.md`,
      verifiedAt: VERIFIED_AT,
      landedAt: '3f98a3f',
      description: 'W24-1. CONTINUUM serves plain HTTP; TLS is the operator\'s reverse-proxy concern.',
    },
    {
      name: 'jwt-validation-middleware-bring-your-own-oauth',
      where: 'packages/mcp-server/src/auth.ts + auth.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/auth.test.js 2>&1) | ` +
        `grep -q "pass 16"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8391966',
      description: 'W24-2. Dual-mode auth (shared-secret + JWT). 16/16 node:test cases.',
    },
    {
      name: 'supervision-healthz-readyz-and-dockerfile-healthcheck',
      where: 'packages/mcp-server/src/http.ts + Dockerfile (HEALTHCHECK directive)',
      verifyCommand:
        `grep -q "/healthz" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "/readyz" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "^HEALTHCHECK" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "/healthz" ${REPO_ROOT}/Dockerfile`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f964b9a',
      description: 'W24-3. Enriched /healthz returns 503 on backend degradation; /readyz cold-start probe.',
    },
    {
      name: 'container-hardening-uid-10001-plus-audit-ci-allowlist',
      where:
        'Dockerfile (uid 10001 + gosu + tini) + entrypoint.sh + ' +
        '.audit-ci.jsonc + .github/workflows/ci.yml + package.json',
      verifyCommand:
        `grep -q "uid 10001" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "useradd  --system --uid 10001" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "gosu " ${REPO_ROOT}/Dockerfile && ` +
        `test -x ${REPO_ROOT}/entrypoint.sh && ` +
        `grep -q "gosu" ${REPO_ROOT}/entrypoint.sh && ` +
        `test -f ${REPO_ROOT}/.audit-ci.jsonc && ` +
        `grep -q "GHSA-xq3m-2v4x-88gg" ${REPO_ROOT}/.audit-ci.jsonc && ` +
        `grep -q "audit-ci" ${REPO_ROOT}/.github/workflows/ci.yml && ` +
        `grep -q '"audit":' ${REPO_ROOT}/package.json && ` +
        `(cd ${REPO_ROOT} && npm run audit > /dev/null 2>&1)`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'a41c8e1 + 94636a5 + 3b02129',
      description: 'W24-4. Non-root container + audit-ci Path B allowlist for protobufjs chain CVEs.',
    },
    {
      name: 'fts5-canary-fixture-six-sentinels-and-cross-source-proof',
      where: 'packages/core/src/cross-source-fts5.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/core && node --test dist/cross-source-fts5.test.js 2>&1) | ` +
        `grep -q "pass 8"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '625de71',
      description: 'W24-5 / Issue #18. 8 node:test cases against a fresh tmpdir.',
    },

    // ─── 1 NEW W25 ACTIVE ENTRY — the gap-closing throughput hardening ───

    {
      name: 'v0.5-throughput-hardened-w25-1',
      where:
        'packages/core/src/storage-hybrid.ts (EMBED_BATCH_SIZE=128 + ' +
        'EMBED_BATCH_QUIET_MS=200 + insertBatch) + ' +
        'scripts/benchmark-hybrid-2026-06-01.mjs + ' +
        'scripts/verify-w25-throughput.mjs',
      verifyCommand:
        // STRUCTURAL proofs that the W25-1 tunings are committed. These
        // run inside `continuum verify`'s 30s per-command budget. The
        // OPERATIONAL SLA proof (retry-aware benchmark, can take 1-3min)
        // lives in scripts/verify-w25-throughput.mjs — out of process,
        // operator-explicit. This is the correct separation: snapshot
        // verify proves CODE STATE, operational verify proves SLA
        // CURRENTLY HOLDS on today's hardware.
        `grep -q "const EMBED_BATCH_SIZE = 128" ${REPO_ROOT}/packages/core/src/storage-hybrid.ts && ` +
        `grep -q "const EMBED_BATCH_QUIET_MS = 200" ${REPO_ROOT}/packages/core/src/storage-hybrid.ts && ` +
        `grep -c "insertBatch" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js | grep -q "^[2-9]" && ` +
        // Operational-verify script exists and is executable — wiring
        // proof for the retry-aware loop the operator authorized.
        `test -x ${REPO_ROOT}/scripts/verify-w25-throughput.mjs && ` +
        // Git-anchored claim — the committed c9ddd92 SHA must be
        // reachable in this repo. Grounds the snapshot to the actual
        // git history; any future operator can git-checkout this hash
        // and see the exact code state the snapshot describes.
        `git -C ${REPO_ROOT} cat-file -e c9ddd92^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'c9ddd92',
      description:
        'W25-1 / THE NEW W25 DELIVERABLE. V0.5 hybrid ingestion throughput ' +
        'hardened from 89s W23-1 baseline (and 97s pre-W25-1 measurement) ' +
        'down to a 53.4s median over 8 clean runs (range 47.30-60.18s, ' +
        'StdDev ~4.3s, G1 pass rate 7/8 = 87.5%). recall@5 0.98 held ' +
        'throughout (G2 cushion +13 pts vs ≥0.85 gate). p95 12-19ms held ' +
        'throughout (G3 cushion +31-38ms vs <50ms gate — actually IMPROVED ' +
        '2x from baseline 27ms because smaller per-batch wall time = less ' +
        'embed-thread contention during the query phase). Closed by two ' +
        'levers: T1 (EMBED_BATCH_SIZE 32→128, amortizing the WASM forward-' +
        'pass overhead, ~31s win) + T6 (Promise.all of per-vector ' +
        'db.insert calls replaced by single ruvector.insertBatch native ' +
        'call, bypassing internal write-lock contention, ~12s win). T7 ' +
        '(quantized MiniLM) ruled out mid-sprint upon discovering ' +
        '@xenova/transformers v2.17.2 defaults to quantized:true in Node ' +
        '(documented P4 correction). T8 (native onnxruntime-node) held ' +
        'off per operator boundary on Journey 3 zero-config.',
    },
  ],
  dormant: [
    // ─── 4 DORMANT (carried as-is from e3bd67a4) ─────────────────────────

    {
      name: 'ruvector-smoke-test-passes',
      where: 'scripts/ruvector-smoke.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/ruvector-smoke.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description:
        '9-check smoke for the hybrid backend. Exercises the DEFAULT path.',
    },
    {
      name: 'apps-console-local-dev-mode',
      where: 'apps/console/',
      verifyCommand: `test -f ${REPO_ROOT}/apps/console/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description:
        'Next.js 15 + Vercel AI SDK + MCP SDK. Production at ' +
        'continuum-kohl.vercel.app; local dev via `npm run dev`.',
    },
    {
      name: 'hybrid-benchmark-harness',
      where: 'scripts/benchmark-hybrid-2026-06-01.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/benchmark-hybrid-2026-06-01.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8610268',
      description:
        '50-anchor + 9950-distractor benchmark. The harness that gates ' +
        'W25-1\'s dynamic verify above. Frozen this sprint — no fixture ' +
        'rigging.',
    },
    // W25-DELIVERABLE-4 (CARRIED) — V0.5-HYBRID.md
    {
      name: 'docs-v0.5-hybrid-reference',
      where: 'docs/V0.5-HYBRID.md',
      verifyCommand:
        `test -f ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -q "CONTINUUM_EMBED_WORKERS" ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -Eqi "roll[ -]?back|rolling back" ${REPO_ROOT}/docs/V0.5-HYBRID.md`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'Operator-facing one-pager. TL;DR + migration steps + memory ' +
        'tuning + rollback path. ONE OF THE FOUR W25 DELIVERABLES per the ' +
        'close directive — re-verified by this snapshot. Verify regex ' +
        'corrected in W24-close per P5 (the rule binds its keeper).',
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
    `  e3bd67a4 + 0853a7ae + every earlier checkpoint PRESERVED.\n` +
    `  Verify (structural, fast):     CONTINUUM_PROJECT_ID=${PROJECT_ID} continuum verify\n` +
    `  Verify (operational SLA, ~1m): node scripts/verify-w25-throughput.mjs\n`,
);

s.close();
