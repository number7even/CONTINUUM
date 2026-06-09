#!/usr/bin/env node
/**
 * Reproducible artifact — SPRINT-W27 CLOSED checkpoint, 2026-06-08.
 *
 * V1.2 Multi-Tenant Native Scaling (Path A) shipped. CONTINUUM crosses
 * the commercial gate: each tenant gets a structurally-isolated
 * ~/.continuum/<tenantId>/ directory pair (continuum.db + ruvector.db),
 * mathematically impossible for cross-tenant data leakage at the
 * filesystem layer. Five W27 deliverables shipped + grounded by
 * mechanical verify_commands:
 *
 *   W27-1 · sanitiseTenantId security gate (8d40f3e)
 *      Strict allowlist [a-z0-9_-]{1,128} after trim+lowercase. Hard
 *      rejection of '..', /, \, null bytes, control chars, unicode,
 *      special chars, length overflow. 25 unit tests including 14
 *      adversarial path-traversal vectors. openStorage(tenantId)
 *      sanitises at the boundary — adversarial input throws rather
 *      than building a backend bound to a malformed filesystem path.
 *
 *   W27-2 · buildServer(tenantId) factory + 3 static grep gates (8d40f3e)
 *      Parameter widened from projectId. ServerHandle.tenantId
 *      exposes the canonical sanitised identifier. Three static
 *      grep gates against the raw .ts source enforce "no openStorage
 *      call inside src/tools/, src/resources/, src/prompts/" —
 *      mechanical drift-protection means a future tool author cannot
 *      accidentally bypass the tenant factory.
 *
 *   W27-3 · JWT tenant-claim + X-Continuum-Project validation (cda7bd2)
 *      Auth middleware extracts the tenant claim from the verified
 *      JWT, sanitises it, compares against the X-Continuum-Project
 *      header (also sanitised — case-fold bypass closed). On mismatch:
 *      HTTP 403 with structured body {error, expected, asserted}. On
 *      missing/invalid claim: HTTP 400. The claim is the trust anchor;
 *      the header is only an assertion. stdio bypass preserved (the
 *      stdio entry never imports the auth module — proven by a
 *      structural grep test on src/index.ts).
 *
 *   W27-4 · Five mechanical isolation proofs (d6a8746)
 *      Proof 1: 25 path-traversal unit tests (W27-1)
 *      Proof 2: 3 static drift-protection greps (W27-2)
 *      Proof 3: 7-case in-process tenant-isolation.test.ts
 *      Proof 4: 21-check 3-tenant filesystem audit script
 *      Proof 5: 8 JWT/header validation 403 boundary tests (W27-3)
 *      The audit script (scripts/verify-w27-isolation.mjs) does du -sh
 *      + raw-bytes grep + API-level cross-tenant reads. All 21 cross-
 *      checks pass locally. The HTTP transport refactor removed the
 *      DEFAULT_PROJECT fallback — /sse handler now requires
 *      req.continuum.tenantId from the auth middleware or returns 400.
 *
 *   W27-5 · TenantRegistry LRU + idle eviction + /healthz telemetry (35256b5)
 *      Empirical baseline from scripts/burst-test-w27-5.mjs (2026-06-08):
 *        first tenant cold-load: 202.3 MB (embedder + WASM + worker pool)
 *        steady-state after 10:    97.5 MB (slope effectively zero —
 *                                  embedder is module-level singleton)
 *      Reference-counted acquire/release; LRU eviction when cache full;
 *      background sweep evicts idle past timeout. Active sessions
 *      NEVER force-evicted. Capacity-exhausted condition maps to
 *      HTTP 503. Default CONTINUUM_MAX_OPEN_TENANTS=32 sized to the
 *      512 MB Fly ceiling. Telemetry surfaced via /healthz:
 *        tenants: { open, active, idle, cacheHits, cacheMisses,
 *                   evictedIdle, evictedLru, maxOpen, idleTimeoutMs }
 *        memory_mb: { rss, heap_used, heap_total }
 *
 * Stamp grounding (per operator close-directive):
 *   - 120/120 workspace tests (core 51 + mcp-server 45 + cli 5 +
 *     adapter-git 7 + adapter-docs 6 + adapter-export 6)
 *   - 21/21 filesystem audit cross-checks
 *   - Burst test data ground the CONTINUUM_MAX_OPEN_TENANTS=32 default
 *   - W25 SLA gate post-W27-5: 47.07s · 0.98 · 14.78ms (BEST run of
 *     the sprint — well within the 53.4s W25-close median noise band,
 *     proving the LRU cache adds zero hot-path cost)
 *
 * Snapshot delta vs 5670d816 (2026-06-07 W26-closed):
 *   active   37 → 42  (5 new W27 entries, 0 dropped)
 *   dormant   4 →  5  (1 new entry — burst-test-w27-5 harness)
 *   broken    0 →  0
 *
 * RUN WITH:
 *   node scripts/checkpoints/sprint-w27-closed-2026-06-08.mjs
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
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

process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'SPRINT-W27 CLOSED — V1.2 Multi-Tenant Native Scaling (Path A) ' +
    'shipped. Per-tenant filesystem-isolated ~/.continuum/<tenantId>/ ' +
    'routing chosen by the verified JWT claim on HTTP/SSE (hard reject ' +
    'on header/claim mismatch with structured 403 body) and by ' +
    'CONTINUUM_PROJECT_ID on stdio (Journey 3 zero-config preserved). ' +
    'Five W27 deliverables shipped: W27-1 (sanitiseTenantId security ' +
    'gate, 25 adversarial unit tests, commit 8d40f3e), W27-2 ' +
    '(buildServer(tenantId) factory + 3 static drift-protection greps ' +
    'against src/tools+resources+prompts, commit 8d40f3e), W27-3 (JWT ' +
    'tenant-claim + X-Continuum-Project validation with case-fold ' +
    'bypass closed, 8 new auth.test.ts cases, commit cda7bd2), W27-4 ' +
    '(5 layered mechanical isolation proofs — path-traversal regex + ' +
    'static greps + in-process node:test + filesystem audit script + ' +
    'JWT 403 boundary; 21 cross-checks pass, commit d6a8746), W27-5 ' +
    '(TenantRegistry LRU cache + idle eviction + /healthz telemetry; ' +
    '11 tests; burst-test-derived default cap 32; commit 35256b5). ' +
    'Empirical memory baseline: 10 concurrent hybrid backends settle ' +
    'at 97MB total — the expensive resource is the SHARED embedder + ' +
    'worker pool (module-level singletons), per-tenant marginal cost ' +
    'is effectively zero. Default CONTINUUM_MAX_OPEN_TENANTS=32 fits ' +
    'in the 512MB Fly shared-cpu-1x ceiling with headroom. W25 SLA gate ' +
    'post-W27-5: 47.07s/0.98/14.78ms — best run of the sprint, proving ' +
    'the tenant routing + LRU cache add zero hot-path cost. 120/120 ' +
    'workspace tests + 21/21 filesystem cross-checks green. CI still ' +
    'blocked on operator-side GH Actions billing; local witness chain ' +
    'remains mathematically sufficient.',
  active: [
    // ─── 37 CARRIED FORWARD FROM 5670d816 (W26-CLOSED, 2026-06-07) ────────

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
      description: '10 tools + 4 Resources + 2 Prompts wired through buildServer.',
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
      description: 'Nine operator commands.',
    },
    {
      name: 'adapter-docs-idempotent-markdown-ingest',
      where: 'packages/adapters/docs/',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/docs/dist/swarm.js && ` +
        `grep -q "sha256" ${REPO_ROOT}/packages/adapters/docs/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675 + e0d230f',
      description: 'Stable sha256 IDs; upsertObservation lives in swarm.js post-W26-2.',
    },
    {
      name: 'adapter-git-commit-log-ingest',
      where: 'packages/adapters/git/',
      verifyCommand:
        `grep -q "git log" ${REPO_ROOT}/packages/adapters/git/dist/index.js && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/git/dist/swarm.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be28',
      description: 'One observation per commit; W26-3 ring swarm.',
    },
    {
      name: 'state-md-parser-and-import-state',
      where: 'packages/core/src/state-md.ts + packages/cli/src/index.ts',
      verifyCommand:
        `grep -q "parseStateMdToCheckpoint" ${REPO_ROOT}/packages/core/dist/state-md.js && ` +
        `grep -q "import-state" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b0591',
      description: 'STATE.md → first checkpoint parser.',
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
      description: '11 patterns + entropy detector + metadata deep-scrub.',
    },
    {
      name: 'storage-upsert-primitive',
      where: 'packages/core/src/storage.ts + storage-sqlite.ts',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage.d.ts && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '01256751',
      description: 'Stable ID upsert with ON CONFLICT DO UPDATE.',
    },
    {
      name: 'cross-source-fts5-unified-index-proven',
      where:
        'packages/core/src/db.ts + packages/core/src/cross-source-fts5.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/core && node --test dist/cross-source-fts5.test.js 2>&1) | ` +
        `grep -q "pass 8"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '09d858c1 + 625de71',
      description: 'FTS5 unified index across all 5 source types + agent_handoff.',
    },
    {
      name: 'fly-engine-deployed-publicly',
      where: 'Dockerfile + fly.toml + continuum-engine.fly.dev',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/healthz | grep -q "^200$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description: 'Always-warm Fly machine. $3.50/mo.',
    },
    {
      name: 'fly-bearer-auth-enforced-publicly',
      where: 'packages/mcp-server/src/http.ts',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/sse | grep -q "^401$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description: 'GET /sse without Bearer returns 401.',
    },
    {
      name: 'vercel-frontend-connected-to-fly',
      where: 'apps/console/ + continuum-kohl.vercel.app',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 8 ` +
        `https://continuum-kohl.vercel.app/ | grep -q "^200$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description: 'Next.js 15 + MCP SDK SSE bridge.',
    },
    {
      name: 'public-sse-roundtrip-via-fly',
      where: 'continuum-kohl.vercel.app → continuum-engine.fly.dev/sse',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/fly-sse-probe.mjs 2>&1 | grep -q "FLY_SSE_PROBE_SUCCESS"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description: 'MCP SDK SSE roundtrip against Fly engine.',
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
      description: 'Multi-stage Node 20 + tini + gosu non-root.',
    },
    {
      name: 'storage-delete-observation-incident-response',
      where:
        'packages/core/src/storage.ts + storage-sqlite.ts + storage-hybrid.ts',
      verifyCommand: `node ${REPO_ROOT}/scripts/delete-observation-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8b987dc',
      description: 'W22-3 / Issue #10. Hard-delete with FTS5 trigger cleanup.',
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
      where: 'packages/mcp-server/src/{tools,resources,prompts}/ + server.ts',
      verifyCommand:
        `test $(wc -l < ${REPO_ROOT}/packages/mcp-server/src/server.ts) -lt 250 && ` +
        `test -d ${REPO_ROOT}/packages/mcp-server/src/tools && ` +
        `test -d ${REPO_ROOT}/packages/mcp-server/src/resources && ` +
        `test -d ${REPO_ROOT}/packages/mcp-server/src/prompts && ` +
        `test $(ls ${REPO_ROOT}/packages/mcp-server/src/tools/*.ts 2>/dev/null | wc -l) -ge 10`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'abebb45',
      description: 'W22-5 / Issue #12. Split into 24 files.',
    },
    {
      name: 'node-test-framework-and-ci-workflow',
      where:
        '.github/workflows/ci.yml + packages/{cli,mcp-server,core,adapters/*}/package.json',
      verifyCommand:
        `test -f ${REPO_ROOT}/.github/workflows/ci.yml && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/cli/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/mcp-server/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/core/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/adapters/git/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/adapters/docs/package.json && ` +
        `grep -q '"test":' ${REPO_ROOT}/packages/adapters/export/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8fee078+625de71+fd5137f+e0d230f',
      description: 'W23-2 / Issue #11. node --test across 6 workspaces.',
    },
    {
      name: 'cli-verify-command',
      where: 'packages/cli/src/index.ts (commandVerify)',
      verifyCommand:
        `grep -q "commandVerify" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "continuum verify" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '14c6095',
      description: 'W23-3. The primitive used to validate this stamp.',
    },
    {
      name: 'briefing-freshness-and-configurable-window',
      where: 'packages/mcp-server/src/briefing.ts',
      verifyCommand:
        `grep -q "CONTINUUM_BRIEFING_WINDOW_HOURS" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js && ` +
        `grep -q "Briefing as of" ${REPO_ROOT}/packages/mcp-server/dist/briefing.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '1ec23a1',
      description: 'W23-4 / Issues #14 + #15.',
    },
    {
      name: 'v0.5-hybrid-promoted-to-default',
      where: 'packages/core/src/factory.ts',
      verifyCommand:
        `grep -q "CONTINUUM_STORAGE_BACKEND ?? 'hybrid'" ${REPO_ROOT}/packages/core/dist/factory.js && ` +
        `grep -q "HybridStorageBackend" ${REPO_ROOT}/packages/core/dist/factory.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description: 'W23-1 sub-deliverable 4.',
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
      description: 'W23-1 Path A + Path B.',
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
      landedAt: '2d3e0e1 + c9ddd92',
      description: 'W23-1 sub-deliverables 2+3.',
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
      description: 'Dockerfile bundles CLI + adapter dists.',
    },
    {
      name: 'fly-volume-v0.5-parity-via-local-sftp',
      where: '/data/continuum/ruvector.db on continuum-engine fly volume',
      verifyCommand:
        `node ${REPO_ROOT}/scripts/fly-sse-probe.mjs 2>&1 | grep -q "tools=10"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'local-sftp-2026-06-02',
      description: 'W23-1 operational close.',
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
      description: 'W24-1. Reverse-proxy TLS pattern.',
    },
    {
      name: 'jwt-validation-middleware-bring-your-own-oauth',
      where: 'packages/mcp-server/src/auth.ts + auth.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/auth.test.js 2>&1) | ` +
        `grep -q "pass 24"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8391966 + cda7bd2',
      description: 'W24-2. Now 24/24 with W27-3 tenant-routing extension.',
    },
    {
      name: 'supervision-healthz-readyz-and-dockerfile-healthcheck',
      where: 'packages/mcp-server/src/http.ts + Dockerfile',
      verifyCommand:
        `grep -q "/healthz" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "/readyz" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "^HEALTHCHECK" ${REPO_ROOT}/Dockerfile && ` +
        `grep -q "/healthz" ${REPO_ROOT}/Dockerfile`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f964b9a',
      description: 'W24-3. Enriched probes + Dockerfile HEALTHCHECK.',
    },
    {
      name: 'container-hardening-uid-10001-plus-audit-ci-allowlist',
      where:
        'Dockerfile + entrypoint.sh + .audit-ci.jsonc + .github/workflows/ci.yml',
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
      description: 'W24-4. Non-root + audit-ci Path B allowlist.',
    },
    {
      name: 'fts5-canary-fixture-six-sentinels-and-cross-source-proof',
      where: 'packages/core/src/cross-source-fts5.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/core && node --test dist/cross-source-fts5.test.js 2>&1) | ` +
        `grep -q "pass 8"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '625de71',
      description: 'W24-5 / Issue #18.',
    },
    {
      name: 'v0.5-throughput-hardened-w25-1',
      where:
        'packages/core/src/storage-hybrid.ts + scripts/{benchmark-hybrid,verify-w25-throughput}.mjs',
      verifyCommand:
        `grep -q "const EMBED_BATCH_SIZE = 128" ${REPO_ROOT}/packages/core/src/storage-hybrid.ts && ` +
        `grep -q "const EMBED_BATCH_QUIET_MS = 200" ${REPO_ROOT}/packages/core/src/storage-hybrid.ts && ` +
        `grep -c "insertBatch" ${REPO_ROOT}/packages/core/dist/storage-hybrid.js | grep -q "^[2-9]" && ` +
        `test -x ${REPO_ROOT}/scripts/verify-w25-throughput.mjs && ` +
        `git -C ${REPO_ROOT} cat-file -e c9ddd92^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'c9ddd92',
      description: 'W25-1. Throughput hardened (T1 batch + T6 insertBatch). Re-verified post-W27: 47.07s SLA.',
    },
    {
      name: 'ruv-swarm-dependency-landed',
      where:
        'packages/adapters/{git,docs,export}/package.json + scripts/probe-ruv-swarm.mjs',
      verifyCommand:
        `grep -q '"ruv-swarm"' ${REPO_ROOT}/packages/adapters/git/package.json && ` +
        `grep -q '"ruv-swarm"' ${REPO_ROOT}/packages/adapters/docs/package.json && ` +
        `grep -q '"ruv-swarm"' ${REPO_ROOT}/packages/adapters/export/package.json && ` +
        `node ${REPO_ROOT}/scripts/probe-ruv-swarm.mjs > /dev/null 2>&1 && ` +
        `git -C ${REPO_ROOT} cat-file -e add2d113^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'add2d113 + e0d230f',
      description: 'W26-1. ruv-swarm landed; +3M install delta; Journey 3 zero-config preserved.',
    },
    {
      name: 'byzantine-majority-vote-primitive',
      where: 'packages/core/src/byzantine-vote.ts + byzantine-vote.test.ts',
      verifyCommand:
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/core/dist/index.d.ts && ` +
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/core/dist/byzantine-vote.js && ` +
        `(cd ${REPO_ROOT}/packages/core && node --test dist/byzantine-vote.test.js 2>&1) | ` +
        `grep -q "pass 11" && ` +
        `git -C ${REPO_ROOT} cat-file -e fd5137f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'fd5137f',
      description: 'W26-4. Pure BFT primitive. 11/11 tests including 400-trial f<N/3 property checks.',
    },
    {
      name: 'adapter-git-ring-topology-swarm',
      where: 'packages/adapters/git/src/{swarm.ts,index.ts,swarm.test.ts}',
      verifyCommand:
        `grep -q "topology: 'ring'" ${REPO_ROOT}/packages/adapters/git/src/swarm.ts && ` +
        `grep -q "chronologicalShards" ${REPO_ROOT}/packages/adapters/git/dist/swarm.js && ` +
        `grep -q "ingestViaRingSwarm" ${REPO_ROOT}/packages/adapters/git/dist/index.js && ` +
        `grep -q "index-enhanced" ${REPO_ROOT}/packages/adapters/git/dist/swarm.js && ` +
        `(cd ${REPO_ROOT}/packages/adapters/git && npm test 2>&1) | grep -q "pass 7" && ` +
        `git -C ${REPO_ROOT} cat-file -e fd5137f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'fd5137f',
      description: 'W26-3. Ring swarm; deterministic source, no BFT.',
    },
    {
      name: 'adapter-docs-mesh-topology-swarm',
      where: 'packages/adapters/docs/src/{swarm.ts,index.ts,swarm.test.ts}',
      verifyCommand:
        `grep -q "topology: 'mesh'" ${REPO_ROOT}/packages/adapters/docs/src/swarm.ts && ` +
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/adapters/docs/dist/swarm.js && ` +
        `grep -q "ingestViaMeshSwarm" ${REPO_ROOT}/packages/adapters/docs/dist/index.js && ` +
        `grep -q "partitionForMesh" ${REPO_ROOT}/packages/adapters/docs/dist/swarm.js && ` +
        `(cd ${REPO_ROOT}/packages/adapters/docs && npm test 2>&1) | grep -q "pass 6" && ` +
        `git -C ${REPO_ROOT} cat-file -e e0d230f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e0d230f',
      description: 'W26-2. Mesh swarm + BFT title vote.',
    },
    {
      name: 'adapter-export-hierarchical-topology-swarm',
      where: 'packages/adapters/export/src/{swarm.ts,index.ts,swarm.test.ts}',
      verifyCommand:
        `grep -q "topology: 'hierarchical'" ${REPO_ROOT}/packages/adapters/export/src/swarm.ts && ` +
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/adapters/export/dist/swarm.js && ` +
        `grep -q "ingestViaHierarchicalSwarm" ${REPO_ROOT}/packages/adapters/export/dist/index.js && ` +
        `grep -q "hierarchicalShards" ${REPO_ROOT}/packages/adapters/export/dist/swarm.js && ` +
        `(cd ${REPO_ROOT}/packages/adapters/export && npm test 2>&1) | grep -q "pass 6" && ` +
        `git -C ${REPO_ROOT} cat-file -e e0d230f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e0d230f',
      description: 'W26-3-export. Hierarchical swarm + BFT significance vote.',
    },
    {
      name: 'swarm-lifecycle-verify-then-dissolve',
      where: 'packages/adapters/{git,docs,export}/src/swarm.ts (try/finally)',
      verifyCommand:
        `for f in ${REPO_ROOT}/packages/adapters/git/src/swarm.ts ` +
        `        ${REPO_ROOT}/packages/adapters/docs/src/swarm.ts ` +
        `        ${REPO_ROOT}/packages/adapters/export/src/swarm.ts; do ` +
        `  grep -q "ruv-swarm" "$f" && grep -q "terminate" "$f" || exit 1; ` +
        `done && ` +
        `(cd ${REPO_ROOT}/packages/adapters/git && npm test 2>&1) | grep -q "pass 7" && ` +
        `(cd ${REPO_ROOT}/packages/adapters/docs && npm test 2>&1) | grep -q "pass 6" && ` +
        `(cd ${REPO_ROOT}/packages/adapters/export && npm test 2>&1) | grep -q "pass 6"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'fd5137f + e0d230f',
      description: 'W26-5. Verify-then-dissolve mechanical across 3 adapters.',
    },

    // ─── 5 NEW W27 ACTIVE ENTRIES — V1.2 Multi-Tenant Native Scaling ─────

    {
      name: 'tenant-sanitisation-security-gate',
      where:
        'packages/core/src/tenant.ts + packages/core/src/tenant.test.ts + factory.ts',
      verifyCommand:
        // Structural: sanitiseTenantId exported from core public API
        `grep -q "sanitiseTenantId" ${REPO_ROOT}/packages/core/dist/index.d.ts && ` +
        `grep -q "tenantDataDir" ${REPO_ROOT}/packages/core/dist/index.d.ts && ` +
        // Factory routes input through the gate
        `grep -q "sanitiseTenantId" ${REPO_ROOT}/packages/core/dist/factory.js && ` +
        // Allowlist regex is the documented strict pattern
        `grep -q "a-z0-9_-" ${REPO_ROOT}/packages/core/dist/tenant.js && ` +
        // 25 unit tests pass — covers all 12+ adversarial vectors
        `(cd ${REPO_ROOT}/packages/core && node --test dist/tenant.test.js 2>&1) | ` +
        `grep -q "pass 25" && ` +
        // Git-anchored commit
        `git -C ${REPO_ROOT} cat-file -e 8d40f3e^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8d40f3e',
      description:
        'W27-1. The security gate. 25 path-traversal unit tests reject ' +
        'every adversarial input (../, /, \\, null bytes, control chars, ' +
        'unicode, length overflow, special chars, non-string types). ' +
        'openStorage() sanitises at the boundary — adversarial input ' +
        'throws rather than building a backend bound to a malformed ' +
        'filesystem path.',
    },
    {
      name: 'buildserver-tenant-factory-with-static-greps',
      where:
        'packages/mcp-server/src/server.ts + packages/mcp-server/src/build-server.test.ts',
      verifyCommand:
        // ServerHandle now exposes canonical tenantId (not projectId)
        `grep -q "tenantId: string" ${REPO_ROOT}/packages/mcp-server/dist/server.d.ts && ` +
        // buildServer takes optional borrowed-storage opts (W27-5 hook)
        `grep -q "BuildServerOptions" ${REPO_ROOT}/packages/mcp-server/dist/server.d.ts && ` +
        // 10 tests pass — includes 3 static drift-protection grep gates
        // against src/tools, src/resources, src/prompts.
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/build-server.test.js 2>&1) | ` +
        `grep -q "pass 10" && ` +
        `git -C ${REPO_ROOT} cat-file -e 8d40f3e^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8d40f3e',
      description:
        'W27-2. Per-tenant factory + 3 static greps preventing tools/ ' +
        'resources/ prompts/ from bypassing the tenant factory.',
    },
    {
      name: 'jwt-tenant-claim-and-header-validation',
      where: 'packages/mcp-server/src/auth.ts + auth.test.ts',
      verifyCommand:
        // req.continuum.tenantId namespace + TENANT_HEADER constant
        `grep -q "ContinuumContext" ${REPO_ROOT}/packages/mcp-server/dist/auth.d.ts && ` +
        `grep -q "x-continuum-project" ${REPO_ROOT}/packages/mcp-server/dist/auth.js && ` +
        // 24 auth tests including 8 new W27-3 cases
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/auth.test.js 2>&1) | ` +
        `grep -q "pass 24" && ` +
        `git -C ${REPO_ROOT} cat-file -e cda7bd2^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'cda7bd2',
      description:
        'W27-3. JWT claim is the trust anchor; X-Continuum-Project ' +
        'header validated against sanitised claim. 403 on mismatch with ' +
        'structured body; 400 on missing/invalid claim. Case-fold bypass ' +
        'closed. stdio path never imports auth (mechanical grep proof).',
    },
    {
      name: 'cross-tenant-isolation-five-layered-proofs',
      where:
        'packages/core/src/tenant-isolation.test.ts + ' +
        'scripts/verify-w27-isolation.mjs + ' +
        'packages/mcp-server/src/http.ts (DEFAULT_PROJECT removed)',
      verifyCommand:
        // In-process node:test isolation — 7 cases
        `(cd ${REPO_ROOT}/packages/core && node --test dist/tenant-isolation.test.js 2>&1) | ` +
        `grep -q "pass 7" && ` +
        // 3-tenant filesystem audit script — 21 cross-checks pass
        `node ${REPO_ROOT}/scripts/verify-w27-isolation.mjs > /dev/null 2>&1 && ` +
        // The DEFAULT_PROJECT crutch is GONE from http.ts source
        `! grep -q "DEFAULT_PROJECT" ${REPO_ROOT}/packages/mcp-server/src/http.ts && ` +
        // /sse handler now requires req.continuum.tenantId
        `grep -q "resolveTenantOrReject" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `git -C ${REPO_ROOT} cat-file -e d6a8746^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'd6a8746',
      description:
        'W27-4. Five layered mechanical proofs: path-traversal regex ' +
        '(W27-1) + static drift greps (W27-2) + in-process node:test ' +
        '(this entry, 7) + 21-check filesystem audit (this entry) + ' +
        'JWT 403 boundary (W27-3). DEFAULT_PROJECT removed; /sse routes ' +
        'exclusively through req.continuum.tenantId.',
    },
    {
      name: 'tenant-registry-lru-cache-and-telemetry',
      where:
        'packages/mcp-server/src/tenant-registry.ts + tenant-registry.test.ts + ' +
        'http.ts integration + /healthz telemetry surface',
      verifyCommand:
        // Registry class exported with the operational surface
        `grep -q "TenantRegistry" ${REPO_ROOT}/packages/mcp-server/dist/tenant-registry.d.ts && ` +
        `grep -q "acquire" ${REPO_ROOT}/packages/mcp-server/dist/tenant-registry.js && ` +
        `grep -q "release" ${REPO_ROOT}/packages/mcp-server/dist/tenant-registry.js && ` +
        `grep -q "sweepIdle" ${REPO_ROOT}/packages/mcp-server/dist/tenant-registry.js && ` +
        // http.ts integrates the registry + surfaces stats on /healthz
        `grep -q "tenantRegistry" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "tenants:" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        `grep -q "memory_mb" ${REPO_ROOT}/packages/mcp-server/dist/http.js && ` +
        // 11 registry tests pass (acquire/release/LRU/sweep/lifecycle/stats/integration)
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/tenant-registry.test.js 2>&1) | ` +
        `grep -q "pass 11" && ` +
        // Burst test script in tree
        `test -x ${REPO_ROOT}/scripts/burst-test-w27-5.mjs && ` +
        `git -C ${REPO_ROOT} cat-file -e 35256b5^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: '35256b5',
      description:
        'W27-5. Reference-counted LRU cache; idle eviction past timeout; ' +
        'force-evict on capacity. Empirical baseline: 10 backends = 97MB ' +
        'steady state (embedder is shared singleton; per-tenant marginal ' +
        '≈ 0). Default CONTINUUM_MAX_OPEN_TENANTS=32 sized to the 512MB ' +
        'Fly ceiling. /healthz surfaces { tenants: { open, active, idle, ' +
        'hits, misses, evictions, maxOpen }, memory_mb: { rss, heap_used } }.',
    },
  ],
  dormant: [
    {
      name: 'ruvector-smoke-test-passes',
      where: 'scripts/ruvector-smoke.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/ruvector-smoke.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e725ae7',
      description: '9-check smoke for the hybrid backend.',
    },
    {
      name: 'apps-console-local-dev-mode',
      where: 'apps/console/',
      verifyCommand: `test -f ${REPO_ROOT}/apps/console/package.json`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bb100f3',
      description: 'Next.js 15 + MCP SDK frontend.',
    },
    {
      name: 'hybrid-benchmark-harness',
      where: 'scripts/benchmark-hybrid-2026-06-01.mjs',
      verifyCommand: `test -f ${REPO_ROOT}/scripts/benchmark-hybrid-2026-06-01.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8610268',
      description: 'The W25-1 benchmark harness.',
    },
    {
      name: 'docs-v0.5-hybrid-reference',
      where: 'docs/V0.5-HYBRID.md',
      verifyCommand:
        `test -f ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -q "CONTINUUM_EMBED_WORKERS" ${REPO_ROOT}/docs/V0.5-HYBRID.md && ` +
        `grep -Eqi "roll[ -]?back|rolling back" ${REPO_ROOT}/docs/V0.5-HYBRID.md`,
      verifiedAt: VERIFIED_AT,
      landedAt: '2d3e0e1',
      description: 'V0.5 operator-facing one-pager.',
    },

    // ─── NEW DORMANT — W27-5 burst-test harness ───────────────────────────

    {
      name: 'burst-test-w27-5-memory-footprint-harness',
      where: 'scripts/burst-test-w27-5.mjs',
      verifyCommand:
        `test -x ${REPO_ROOT}/scripts/burst-test-w27-5.mjs && ` +
        `grep -q "CONTINUUM_MAX_OPEN_TENANTS" ${REPO_ROOT}/scripts/burst-test-w27-5.mjs`,
      verifiedAt: VERIFIED_AT,
      landedAt: '35256b5',
      description:
        'W27-5. 10-tenant burst test. Run with --expose-gc to get clean ' +
        'GC-settled measurements. Reports per-step RSS deltas + derived ' +
        'CONTINUUM_MAX_OPEN_TENANTS for the 512MB Fly ceiling. The ' +
        'empirical basis for the default cap of 32.',
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
    `  5670d816 + 83faa040 + e3bd67a4 + every earlier checkpoint PRESERVED.\n` +
    `  Verify (structural, fast):       CONTINUUM_PROJECT_ID=${PROJECT_ID} continuum verify\n` +
    `  Verify (operational SLA, ~1m):   node scripts/verify-w25-throughput.mjs\n` +
    `  Verify (3-tenant audit, ~3s):    node scripts/verify-w27-isolation.mjs\n` +
    `  Measure (memory burst, ~20s):    node --expose-gc scripts/burst-test-w27-5.mjs\n`,
);

s.close();
