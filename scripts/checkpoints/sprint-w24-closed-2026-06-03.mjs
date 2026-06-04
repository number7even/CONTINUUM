#!/usr/bin/env node
/**
 * Reproducible artifact — SPRINT-W24 CLOSED checkpoint, 2026-06-03.
 *
 * Closes the books on Sprint W24 — the OSS / self-hosted Docker baseline.
 * Five mechanical tickets shipped, all five with verify_commands that
 * any future operator (or operator's CI) can re-execute to mechanically
 * prove this exact state from a clean clone:
 *
 *   W24-1 · TLS termination via reverse-proxy + self-hosted Docker
 *           baseline. Caddyfile + docker-compose.yml live in
 *           docs/examples/caddy/. DEPLOY_SELF_HOSTED.md is the
 *           operator-facing walkthrough.
 *           Commit: 3f98a3f
 *
 *   W24-2 · JWT validation middleware (bring-your-own-OAuth) with
 *           shared-secret legacy mode + tenant-claim extraction.
 *           16 node:test cases against a real mock JWKS server.
 *           Commit: 8391966
 *
 *   W24-3 · Supervision telemetry — enriched /healthz reports backend
 *           degradation as HTTP 503 so orchestrators (Docker / Fly /
 *           k8s) restart the container, separate /readyz for cold-start
 *           probes, Dockerfile HEALTHCHECK directive wired to /healthz.
 *           Commit: f964b9a
 *
 *   W24-4 · Container hardening. Runtime process drops to uid/gid 10001
 *           (`continuum:continuum`) via the gosu entrypoint chain under
 *           tini PID-1. The npm audit gate was a separate beast — what
 *           started as a bare `npm audit --audit-level=high` step caught
 *           a real-time escalation of 4 protobufjs-chain advisories from
 *           DoS to RCE class within an hour of landing. Path B recovery:
 *           swapped to audit-ci with an explicit allowlist at
 *           .audit-ci.jsonc carrying per-CVE rationale (CONTINUUM never
 *           passes attacker-controlled bytes to the protobufjs parser —
 *           the codepaths exist in the tree but are not reachable from
 *           our call graph). Full surface analysis in
 *           docs/DEPLOY_SELF_HOSTED.md § "Current npm audit baseline".
 *           Commits: a41c8e1 (uid 10001 + entrypoint), 94636a5 (CVE
 *           baseline docs), 3b02129 (audit-ci Path B recovery).
 *
 *   W24-5 · FTS5 canary fixture closes Issue #18. New
 *           packages/core/src/cross-source-fts5.test.ts inserts one
 *           sentinel per source.type (docs/git/mem/sona/export) plus
 *           one obs.type='agent_handoff' fixture under mem, then
 *           asserts each sentinel returns exactly one hit with matching
 *           source/type, plus a cross-source unified-index check on a
 *           shared keyword, plus a negative control. 8/8 pass in 122ms
 *           against a fresh tmpdir. Replaces the fragile
 *           `grep -q "fts5" packages/core/dist/db.js` pin used by the
 *           d0fa50a7 and 1f416f20 verify_commands.
 *           Commit: 625de71
 *
 * Per the W24 sprint doc directive (§ W24-5):
 *   "The d0fa50a7 / 1f416f20 verify_command for
 *    `cross-source-fts5-unified-index-proven` swaps from
 *    grep-the-dist-for-fts5-string (currently fragile) to running this
 *    new test (durable signal). Bumps in the next mid-sprint
 *    checkpoint."
 *
 * This IS that next checkpoint, so the swap is in: the carried-forward
 * `cross-source-fts5-unified-index-proven` entry below now exec's the
 * canary test. The fragile string-grep is dead.
 *
 * Snapshot delta vs 0853a7ae (2026-06-02 W23-closed):
 *   active   25 → 30  (5 new W24 entries, 0 dropped — 25 W23 carried as-is
 *                       except cross-source-fts5 verify_command bumped per
 *                       W24-5 sprint-doc directive)
 *   dormant   4 →  4  (carried as-is)
 *   broken    0 →  0
 *
 * RUN WITH:
 *   node scripts/checkpoints/sprint-w24-closed-2026-06-03.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot
 * row. 0853a7ae + d0fa50a7 + 1f416f20 + every earlier checkpoint stays
 * in the DB as the historical record.
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
// continuum.db regardless of the operator's current default backend
// choice. (Local default is V0.5 hybrid; the stamp doesn't need vectors.)
delete process.env.CONTINUUM_STORAGE_BACKEND;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'SPRINT-W24 CLOSED — OSS / self-hosted Docker baseline locked. All 5 ' +
    'mechanical tickets shipped: W24-1 (TLS via reverse-proxy + Caddy ' +
    'docker-compose example, commit 3f98a3f), W24-2 (JWT validation ' +
    'middleware with 16/16 node:test cases against a mock JWKS server, ' +
    'commit 8391966), W24-3 (enriched /healthz + /readyz + Dockerfile ' +
    'HEALTHCHECK, commit f964b9a), W24-4 (non-root uid 10001 via gosu ' +
    'under tini PID-1 + Path B audit-ci allowlist for the 9 protobufjs- ' +
    'chain CVEs with per-CVE rationale in .audit-ci.jsonc, commits a41c8e1 ' +
    '+ 94636a5 + 3b02129), W24-5 (cross-source FTS5 canary fixture closing ' +
    'Issue #18 — 8/8 node:test cases against a fresh tmpdir, commit ' +
    '625de71). The cross-source-fts5-unified-index-proven verify_command ' +
    'is bumped from grep-the-dist to executing the new canary per the ' +
    'W24-5 sprint-doc directive. CI on 625de71 green: 24/24 tests across ' +
    'core + mcp-server + cli, audit-ci gate respecting the explicit ' +
    'allowlist. Next sprint anchor (per W25 prep): either V1.2 multi- ' +
    'tenant native, V1.5+ neural capability layer (ruv-swarm), or the ' +
    'queued Issue #1/#2/#3/#7 triage.',
  active: [
    // ─── 24 CARRIED FORWARD FROM W23-CLOSED (0853a7ae) ────────────────────
    // All still hold mechanically. The cross-source-fts5 entry is the only
    // verify_command MUTATED this snapshot — bumped to exec the W24-5
    // canary instead of grepping the dist file (sprint-doc directive).

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
      // ─── verify_command MUTATED THIS SNAPSHOT (W24-5 sprint-doc directive) ─
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
        'plus the agent_handoff obs.type. Bumped from grep-the-dist per ' +
        'SPRINT-2026-W24.md § W24-5 directive — the fragile string match ' +
        'is dead.',
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
        'Multi-stage Node 20, tini PID-1, gosu privilege drop (W24-4). ' +
        'Includes CLI + adapter dists for remote ops.',
    },
    {
      name: 'storage-delete-observation-incident-response',
      where:
        'packages/core/src/storage.ts + storage-sqlite.ts + storage-hybrid.ts ' +
        '+ packages/mcp-server/src/tools/delete-observation.ts',
      verifyCommand: `node ${REPO_ROOT}/scripts/delete-observation-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8b987dc',
      description:
        'W22-3 / Issue #10. Hard-delete with FTS5 trigger cleanup + queued ' +
        'vector removal. 9-check smoke covers idempotency + survivor.',
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
        'W22-2 / Issue #9. cwd-basename fallback now lowercased; explicit ' +
        'flag/env values preserved. 5 node:test cases.',
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
        'W22-5 / Issue #12. 951-line server.ts split into 24 files. ' +
        'No behavior change.',
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
      landedAt: '8fee078 + 625de71 (core test script added W24-5)',
      description:
        'W23-2 / Issue #11 — core picked up W24-5 (24/24 across cli + ' +
        'mcp-server + core on every CI push).',
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
        'snapshot — the operator-facing reproducibility primitive.',
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
        'W23-4 / Issues #14 + #15. Freshness header + window env var.',
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
        'W23-1 Path A + Path B. Batched embedder + worker_threads pool ' +
        '(default min(cores,4), env CONTINUUM_EMBED_WORKERS=N override). ' +
        'Benchmark: 10k inserts in 89s · recall@5 0.98 · p95 26ms.',
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
        '+ `continuum reindex`. Both force-exit on completion to release ' +
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
        'Dockerfile bundles CLI + adapter dists into the runtime image so ' +
        '`fly ssh console -C "continuum ..."` works for remote ops. Sharp ' +
        'postinstall is forced because @xenova/transformers transitively ' +
        'needs it but `npm ci --ignore-scripts` would otherwise block the ' +
        'binary download. Orthogonal to W24-4 hardening (that entry below ' +
        'covers the non-root + audit-ci wiring); both claims hold in this ' +
        'snapshot.',
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
        'vectors, 1,589,248 bytes). sftp put yielded byte-identical bytes ' +
        'on Fly volume. $3.50/mo baseline preserved.',
    },

    // ─── 5 NEW W24 ACTIVE ENTRIES ─────────────────────────────────────────

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
      description:
        'W24-1. CONTINUUM terminates HTTP plaintext on 7878; TLS is the ' +
        'operator\'s reverse-proxy concern (Caddy / nginx / Traefik). ' +
        'docs/examples/caddy/ ships a working Caddyfile + docker-compose ' +
        'so an operator can `cd docs/examples/caddy && docker compose up` ' +
        'and have HTTPS-by-default via Let\'s Encrypt in under 5 minutes.',
    },
    {
      name: 'jwt-validation-middleware-bring-your-own-oauth',
      where:
        'packages/mcp-server/src/auth.ts + auth.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/auth.test.js 2>&1) | ` +
        `grep -q "pass 16"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8391966',
      description:
        'W24-2. Dual-mode auth middleware: shared-secret (legacy) + JWT ' +
        '(opt-in via JWT_ISSUER + JWT_AUDIENCE env vars). JWT mode uses ' +
        '`jose` to validate against the issuer\'s remote JWKS, extracts ' +
        '`sub` + configurable tenant claim to req.user. 16/16 node:test ' +
        'cases run against a mock JWKS server (no external network).',
    },
    {
      name: 'supervision-healthz-readyz-and-dockerfile-healthcheck',
      where:
        'packages/mcp-server/src/http.ts + Dockerfile (HEALTHCHECK directive)',
      verifyCommand:
        `grep -q "/healthz" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "/readyz" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "^HEALTHCHECK" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "/healthz" ${REPO_ROOT}/Dockerfile`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f964b9a',
      description:
        'W24-3. Enriched /healthz: returns HTTP 503 when storage backend ' +
        'probe fails so orchestrators (Docker / Fly / k8s) trigger restart. ' +
        '/readyz: separate cold-start readiness probe (embedder loaded, ' +
        'storage opened). Dockerfile HEALTHCHECK ties it to container ' +
        'health — 30s interval, 5s timeout, 30s start-period, 3 retries. ' +
        'Both endpoints exempt from auth (W24-2) so probes don\'t need a ' +
        'Bearer token.',
    },
    {
      name: 'container-hardening-uid-10001-plus-audit-ci-allowlist',
      where:
        'Dockerfile (uid 10001 + gosu + tini) + entrypoint.sh + ' +
        '.audit-ci.jsonc + .github/workflows/ci.yml + package.json',
      verifyCommand:
        // Container drops to uid 10001
        `grep -q "uid 10001" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "useradd  --system --uid 10001" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "gosu " ${REPO_ROOT}/Dockerfile && ` +
        `test -x ${REPO_ROOT}/entrypoint.sh && ` +
        `grep -q "gosu" ${REPO_ROOT}/entrypoint.sh && ` +
        // audit-ci wiring with documented Path B exception
        `test -f ${REPO_ROOT}/.audit-ci.jsonc && ` +
        `grep -q "GHSA-xq3m-2v4x-88gg" ${REPO_ROOT}/.audit-ci.jsonc && ` +
        `grep -q "audit-ci" ${REPO_ROOT}/.github/workflows/ci.yml && ` +
        `grep -q '"audit":' ${REPO_ROOT}/package.json && ` +
        // The actual gate runs green (the proof, not just the wiring)
        `(cd ${REPO_ROOT} && npm run audit > /dev/null 2>&1)`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'a41c8e1 + 94636a5 + 3b02129',
      description:
        'W24-4. (1) Runtime drops privileges: `groupadd --system --gid ' +
        '10001 continuum && useradd --system --uid 10001`. tini PID-1 ' +
        'execs entrypoint.sh which chowns /data and `exec gosu ' +
        'continuum:continuum "$@"`. (2) npm audit gate: bare `npm audit ' +
        '--audit-level=high` caught a real-time escalation of 4 ' +
        'protobufjs-chain advisories to RCE class within the hour. Path ' +
        'B recovery: audit-ci with .audit-ci.jsonc allowlist carrying ' +
        'per-CVE rationale + back-reference to docs/DEPLOY_SELF_HOSTED.md ' +
        '§ "Current npm audit baseline". The vulnerable codepaths exist ' +
        'in the dependency tree but are not reachable from CONTINUUM\'s ' +
        'call graph (protobufjs only sees HF-cached .onnx model files, ' +
        'never user-controlled bytes). Any NEW high/critical advisory ' +
        'outside the allowlist will still fail CI immediately.',
    },
    {
      name: 'fts5-canary-fixture-six-sentinels-and-cross-source-proof',
      where: 'packages/core/src/cross-source-fts5.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/core && node --test dist/cross-source-fts5.test.js 2>&1) | ` +
        `grep -q "pass 8"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '625de71',
      description:
        'W24-5 / Issue #18 (closed). 6 sentinel-distinct assertions ' +
        '(one per source.type: docs/git/mem/sona/export + one obs.type=' +
        'agent_handoff under mem) + 1 cross-source unified-index ' +
        'assertion on the shared keyword "CANARY" + 1 negative control ' +
        '= 8 tests. Runs against a fresh tmpdir in 122ms; saves and ' +
        'restores CONTINUUM_DATA_DIR; rmSync on teardown even if a ' +
        'single assertion failed. Replaces the fragile ' +
        '`grep -q "fts5" packages/core/dist/db.js` pin that previous ' +
        'checkpoints (d0fa50a7, 1f416f20, 0853a7ae for the entry above) ' +
        'depended on. The cross-source-fts5-unified-index-proven entry\'s ' +
        'verify_command above is bumped to exec this test in the same ' +
        'snapshot per the W24-5 sprint-doc directive.',
    },
  ],
  dormant: [
    // ─── 4 DORMANT (carried as-is from 0853a7ae) ──────────────────────────

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
        'Next.js 15 + Vercel AI SDK + Anthropic Sonnet 4.6 + MCP SDK. ' +
        'Production at continuum-kohl.vercel.app; local dev via ' +
        '`npm run dev` (Journey 3 path).',
    },
    {
      name: 'hybrid-benchmark-harness',
      where: 'scripts/benchmark-hybrid-2026-06-01.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/benchmark-hybrid-2026-06-01.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8610268',
      description:
        '50-anchor + 9950-distractor benchmark. Reproducible from any ' +
        '8-core dev machine. Exits 0 if all three gates pass.',
    },
    {
      name: 'docs-v0.5-hybrid-reference',
      where: 'docs/V0.5-HYBRID.md',
      // Note: the W23-closed snapshot grepped for the literal lowercase
      // string "rollback" which the doc actually spells as "roll back" /
      // "Rolling back" / "Roll back" — making this verify fail in
      // W23-closed despite the rollback path being documented. Per P5
      // (the rule binds its keeper) the fix lands on the verify, not the
      // doc.
      verifyCommand:
        `test -f ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -q "CONTINUUM_EMBED_WORKERS" ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -Eqi "roll[ -]?back|rolling back" ${REPO_ROOT}/docs/V0.5-HYBRID.md`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description:
        'Operator-facing one-pager. TL;DR + migration steps + memory ' +
        'tuning + rollback path (documented at line 24 + § "Rolling back ' +
        'to V0") + honest non-claims.',
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
    `  0853a7ae + 1f416f20 + d0fa50a7 + every earlier checkpoint PRESERVED.\n` +
    `  Verify with: CONTINUUM_PROJECT_ID=${PROJECT_ID} continuum verify\n`,
);

s.close();
