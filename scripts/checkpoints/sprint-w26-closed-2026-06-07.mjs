#!/usr/bin/env node
/**
 * Reproducible artifact — SPRINT-W26 CLOSED checkpoint, 2026-06-07.
 *
 * V1 Swarm Aggregation officially closed. CONTINUUM evolves from passive
 * linear data pipelines into an active, autonomous aggregation engine
 * with cognitive topologies matched to each source's data shape:
 *
 *   Ring          → adapter-git (chronological commit history)
 *   Mesh          → adapter-docs (peer-cross-referenceable doc tree)
 *   Hierarchical  → adapter-export (nested session → turn structure)
 *
 * Four W26 deliverables shipped + grounded by mechanical verify_commands:
 *
 *   1. ruv-swarm dependency landing (W26-1)
 *      add2d113 — package added to adapters/git first, then adapters/
 *      docs + adapters/export in e0d230f. Journey 3 zero-config promise
 *      held: +3M install delta, no native compile chain, pure JS + bundled
 *      WASM (~512KB core module). The main entry's createSwarm() has an
 *      upstream symbol-mismatch bug in v1.0.20; routed around via
 *      ruv-swarm/src/index-enhanced.js (the W26-1-documented bypass).
 *
 *   2. byzantineVote() primitive (W26-4)
 *      fd5137f — packages/core/src/byzantine-vote.ts. Pure function
 *      with strict-majority gate + deterministic tiebreaker + dissent
 *      capture + custom-canonicalize support. 11/11 tests pass including
 *      400 random-trial property checks for the f<N/3 BFT bound.
 *      Decoupled from adapter-git per Path C (git is deterministic;
 *      voting on identical inputs is theatre) — used by adapter-docs
 *      (title strategies) and adapter-export (significance verdicts)
 *      where the field is genuinely subjective.
 *
 *   3. Topology wirings (W26-2 + W26-3 + W26-3-export)
 *      - W26-3   (fd5137f): adapter-git ring swarm. 7/7 tests pass.
 *                Live smoke: swarm=swarm-1780738148632 spawned 3
 *                ring-topology agents, sharded 10 commits across them,
 *                upserted 10, dissolved cleanly with zero orphan
 *                processes. Does NOT call byzantineVote() — git is
 *                deterministic.
 *      - W26-2   (e0d230f): adapter-docs mesh swarm. 6/6 tests pass.
 *                Live smoke: swarm=swarm-1780743510442 spawned 3 mesh
 *                peer agents, votes on title-extraction strategies
 *                (first-h1 / first-line / basename) per file. 21/21 docs
 *                files in this repo produced 2-of-3 majority votes on
 *                title — BFT is genuinely doing subjective work.
 *      - W26-3-export (e0d230f): adapter-export hierarchical swarm.
 *                6/6 tests pass. Live smoke: swarm=swarm-1780811897245
 *                spawned 1 root + 3 child agents, votes on
 *                include/filter significance per turn. 617/617 turns on
 *                a real session were unanimous-include — real data is
 *                substantive enough that strategies agree (synthetic
 *                tests cover the 2-of-3 voted edge cases). Watch mode
 *                explicitly stays linear (no per-turn swarm overhead).
 *
 *   4. Lifecycle enforcement — Verify-Then-Dissolve (W26-5)
 *      Mechanical try/finally guarantees swarm.terminate() runs even
 *      on throw. Proven across all three adapters by:
 *        - 19 live-swarm lifecycle tests (7 git + 6 docs + 6 export)
 *        - 3 real-world smoke traces, each followed by
 *          `ps aux | grep ruv-swarm` returning zero matches
 *
 * W25 SLA gate post-W26 close (verify-w25-throughput.mjs):
 *   PASS on attempt 2/3 — 49.16s · 0.98 · 11.10ms. Well within the
 *   53.4s W25-close median's noise band. No throughput regression
 *   introduced by the entire W26 sprint.
 *
 * Honest follow-up notes carried forward into the W27+ horizon:
 *   - Deep-internal-path import (ruv-swarm/src/index-enhanced.js) is
 *     fragile to upstream refactors. Investigate filing the createSwarm
 *     symbol-mismatch + getVersion() ESM bugs upstream so the package
 *     can self-heal without our intervention.
 *   - mem and sona adapters do not exist (schema accepts them, no
 *     ingest code). Out of W26 scope; topology mappings reserved.
 *   - byzantineVote() ready for any future adapter where divergence is
 *     real (e.g. a TaskmasterAI PRD parser per Issue #7).
 *
 * Snapshot delta vs 83faa040 (2026-06-05 W25-closed):
 *   active   31 → 37  (6 new W26 entries, 0 dropped)
 *   dormant   4 →  4  (carried as-is)
 *   broken    0 →  0
 *
 * RUN WITH:
 *   node scripts/checkpoints/sprint-w26-closed-2026-06-07.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot
 * row. 83faa040 + e3bd67a4 + 0853a7ae + every earlier checkpoint stays
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

// Force sqlite for the stamp itself.
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'SPRINT-W26 CLOSED — V1 Swarm Aggregation shipped. CONTINUUM now ' +
    'wraps each adapter\'s ingestion in an ephemeral ruv-swarm with a ' +
    'cognitive topology matched to the source: adapter-git (ring, ' +
    'chronological), adapter-docs (mesh, peer-cross-referenced), adapter-' +
    'export (hierarchical, nested turn structure). The byzantineVote() ' +
    'primitive (packages/core/src/byzantine-vote.ts) handles subjective ' +
    'majority across docs title-strategies + export significance-' +
    'heuristics; adapter-git skips it (Path C decoupling — git is ' +
    'deterministic, voting on identical inputs is theatre). All swarms ' +
    'verify-then-dissolve in try/finally — zero orphan processes proven ' +
    'across 19 lifecycle tests + 3 real-world smoke traces. W25 SLA gate ' +
    'PASS on attempt 2/3 (49.16s · 0.98 · 11.10ms) — no throughput ' +
    'regression. Three commits land the work: add2d113 (W26-1 dep ' +
    'landing), fd5137f (W26-3 git ring + W26-4 BFT primitive + W26-5 ' +
    'lifecycle test), e0d230f (W26-2 docs mesh + W26-3-export ' +
    'hierarchical, both calling byzantineVote()). Foundational gate ' +
    'cleared for V1.2 multi-tenant native scaling — adapters can now ' +
    'ingest enterprise workloads concurrently across tenant_id ' +
    'collections without serialising at the source-read level.',
  active: [
    // ─── 31 CARRIED FORWARD FROM 83faa040 (W25-CLOSED, 2026-06-05) ────────

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
      // W26-2 refactor moved upsertObservation calls into swarm.js
      // (the linear path was replaced by the mesh swarm). sha256 stays in
      // index.js's pathToObservationId. P5 fix — verify_command tracks
      // the territory; never the inverse.
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/docs/dist/swarm.js && ` +
        `grep -q "sha256" ${REPO_ROOT}/packages/adapters/docs/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '0125675 (initial) + e0d230f (W26-2 mesh-swarm refactor)',
      description:
        'Stable per-file IDs (sha256). Re-runs are idempotent. ' +
        'upsertObservation now lives in swarm.js (W26-2 refactor); ' +
        'contract preserved.',
    },
    {
      name: 'adapter-git-commit-log-ingest',
      where: 'packages/adapters/git/',
      verifyCommand:
        `grep -q "git log" ${REPO_ROOT}/packages/adapters/git/dist/index.js && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/adapters/git/dist/swarm.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'bc74be28',
      description:
        'One observation per commit. Stable ID = raw SHA. ' +
        'upsertObservation now lives in swarm.js (W26-3 refactor); ' +
        'the linear path is gone but the contract is preserved.',
    },
    {
      name: 'state-md-parser-and-import-state',
      where: 'packages/core/src/state-md.ts + packages/cli/src/index.ts',
      verifyCommand:
        `grep -q "parseStateMdToCheckpoint" ${REPO_ROOT}/packages/core/dist/state-md.js && ` +
        `grep -q "import-state" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'f21b0591',
      description: 'STATE.md → first-checkpoint parser. Auto-import on init.',
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
        '11 patterns + operator config + entropy detector + metadata scrub.',
    },
    {
      name: 'storage-upsert-primitive',
      where: 'packages/core/src/storage.ts + storage-sqlite.ts',
      verifyCommand:
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage.d.ts && ` +
        `grep -q "upsertObservation" ${REPO_ROOT}/packages/core/dist/storage-sqlite.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '01256751',
      description: 'Caller-supplied stable ID with ON CONFLICT DO UPDATE.',
    },
    {
      name: 'cross-source-fts5-unified-index-proven',
      where:
        'packages/core/src/db.ts + packages/core/src/cross-source-fts5.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/core && node --test dist/cross-source-fts5.test.js 2>&1) | ` +
        `grep -q "pass 8"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '09d858c1 + 625de71 (canary, W24-5)',
      description: 'Unified FTS5 index, 5 source types + agent_handoff obs.type.',
    },
    {
      name: 'fly-engine-deployed-publicly',
      where: 'Dockerfile + fly.toml + continuum-engine.fly.dev',
      verifyCommand:
        `curl -sf -o /dev/null -w "%{http_code}" --max-time 5 ` +
        `https://continuum-engine.fly.dev/healthz | grep -q "^200$"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '747ace6',
      description: 'Always-warm Fly machine. $3.50/mo. 248MB image.',
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
      description: 'Next.js 15 Server Component → Fly engine via MCP SSE.',
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
      description: 'Multi-stage Node 20, tini PID-1, gosu privilege drop.',
    },
    {
      name: 'storage-delete-observation-incident-response',
      where:
        'packages/core/src/storage.ts + storage-sqlite.ts + storage-hybrid.ts',
      verifyCommand: `node ${REPO_ROOT}/scripts/delete-observation-smoke.mjs > /dev/null 2>&1`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8b987dc',
      description: 'W22-3 / Issue #10. Hard-delete + FTS5 trigger cleanup.',
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
      landedAt: '8fee078 + 625de71 + fd5137f + e0d230f',
      description:
        'W23-2 / Issue #11. node --test framework, now 59/59 across 6 workspaces.',
    },
    {
      name: 'cli-verify-command',
      where: 'packages/cli/src/index.ts (commandVerify)',
      verifyCommand:
        `grep -q "commandVerify" ${REPO_ROOT}/packages/cli/dist/index.js && ` +
        `grep -q "continuum verify" ${REPO_ROOT}/packages/cli/dist/index.js`,
      verifiedAt: VERIFIED_AT,
      landedAt: '14c6095',
      description: 'W23-3 / Issue #13. The primitive used to validate this stamp.',
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
      description: 'W23-1 sub-deliverable 4. Hybrid is default.',
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
      description: 'W23-1 Path A + Path B. Batched embedder + worker pool.',
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
      description: 'W23-1 sub-deliverables 2+3. Now using insertBatch (W25 T6).',
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
      description: 'W23-1 operational close. $3.50/mo baseline preserved.',
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
      description: 'W24-1. Reverse-proxy TLS termination pattern.',
    },
    {
      name: 'jwt-validation-middleware-bring-your-own-oauth',
      where: 'packages/mcp-server/src/auth.ts + auth.test.ts',
      verifyCommand:
        `(cd ${REPO_ROOT}/packages/mcp-server && node --test dist/auth.test.js 2>&1) | ` +
        `grep -q "pass 16"`,
      verifiedAt: VERIFIED_AT,
      landedAt: '8391966',
      description: 'W24-2. Dual-mode auth. 16/16 node:test cases.',
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
      description: 'W24-3. Enriched health probes + Dockerfile HEALTHCHECK.',
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
      description: 'W24-5 / Issue #18. 8 cross-source FTS5 assertions.',
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
      description:
        'W25-1. Throughput hardened to 53.4s median (T1 batch size + T6 ' +
        'RuVector insertBatch). The operational SLA stays operator-explicit ' +
        'via verify-w25-throughput.mjs; structural verify is the git-anchored ' +
        'code-state proof above. Re-verified post-W26: 49.16s on attempt 2/3.',
    },

    // ─── 6 NEW W26 ACTIVE ENTRIES — V1 Swarm Aggregation ──────────────────

    {
      name: 'ruv-swarm-dependency-landed',
      where:
        'packages/adapters/{git,docs,export}/package.json + ' +
        'scripts/probe-ruv-swarm.mjs',
      verifyCommand:
        // All three adapters declare ruv-swarm as a direct dep.
        `grep -q '"ruv-swarm"' ${REPO_ROOT}/packages/adapters/git/package.json && ` +
        `grep -q '"ruv-swarm"' ${REPO_ROOT}/packages/adapters/docs/package.json && ` +
        `grep -q '"ruv-swarm"' ${REPO_ROOT}/packages/adapters/export/package.json && ` +
        // The Journey 3 probe passes — package resolves, initialises,
        // exposes lifecycle surface, and the enhanced-module workaround
        // creates+terminates all three required topologies.
        `node ${REPO_ROOT}/scripts/probe-ruv-swarm.mjs > /dev/null 2>&1 && ` +
        // Git-anchored proof of the dep-landing commit.
        `git -C ${REPO_ROOT} cat-file -e add2d113^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'add2d113 + e0d230f',
      description:
        'W26-1. ruv-swarm@^1.0.20 declared in all 3 adapter packages. ' +
        'Journey 3 zero-config promise held: +3M install delta, no native ' +
        'compile chain. Main entry has upstream createSwarm symbol-mismatch ' +
        'bug in v1.0.20 — routed via ruv-swarm/src/index-enhanced.js. ' +
        'Tracked as a follow-up for upstream issue filing.',
    },
    {
      name: 'byzantine-majority-vote-primitive',
      where:
        'packages/core/src/byzantine-vote.ts + byzantine-vote.test.ts',
      verifyCommand:
        // Structural: the primitive is exported from core's public API.
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/core/dist/index.d.ts && ` +
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/core/dist/byzantine-vote.js && ` +
        // BFT semantics: 11 tests including 400 random-trial property checks
        // for the f<N/3 bound. Pure function, runs in ~60ms.
        `(cd ${REPO_ROOT}/packages/core && node --test dist/byzantine-vote.test.js 2>&1) | ` +
        `grep -q "pass 11" && ` +
        `git -C ${REPO_ROOT} cat-file -e fd5137f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'fd5137f',
      description:
        'W26-4. Pure Byzantine-majority voting primitive. Strict-majority ' +
        'gate (⌊N/2⌋+1) + deterministic tiebreaker (lowest agentId) + ' +
        'dissent capture for audit + custom canonicalize. 11/11 tests pass ' +
        'including 400 random-trial f<N/3 property checks. Path C decoupling: ' +
        'used by adapter-docs + adapter-export (subjective fields); skipped ' +
        'by adapter-git (deterministic SHA → identical outputs).',
    },
    {
      name: 'adapter-git-ring-topology-swarm',
      where:
        'packages/adapters/git/src/{swarm.ts,index.ts,swarm.test.ts}',
      verifyCommand:
        // Structural: ring topology is in the code; chronologicalShards
        // is exported; the index.ts swaps in ingestViaRingSwarm.
        `grep -q "topology: 'ring'" ${REPO_ROOT}/packages/adapters/git/src/swarm.ts && ` +
        `grep -q "chronologicalShards" ${REPO_ROOT}/packages/adapters/git/dist/swarm.js && ` +
        `grep -q "ingestViaRingSwarm" ${REPO_ROOT}/packages/adapters/git/dist/index.js && ` +
        // The enhanced-module workaround is in use.
        `grep -q "index-enhanced" ${REPO_ROOT}/packages/adapters/git/dist/swarm.js && ` +
        // Lifecycle tests pass (W26-3 + W26-5 together).
        `(cd ${REPO_ROOT}/packages/adapters/git && npm test 2>&1) | ` +
        `grep -q "pass 7" && ` +
        `git -C ${REPO_ROOT} cat-file -e fd5137f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'fd5137f',
      description:
        'W26-3. Ring-topology ephemeral swarm replaces the linear for-loop. ' +
        '3 analyst agents materialise the topology; commit shards process in ' +
        'parallel via Promise.all; swarm.terminate() in try/finally. Does ' +
        'NOT call byzantineVote() — git is deterministic. Smoke trace: ' +
        'swarm-1780738148632, 10 commits sharded 4/4/2, 10 upserted, 0 ' +
        'orphans. 7/7 lifecycle tests pass.',
    },
    {
      name: 'adapter-docs-mesh-topology-swarm',
      where:
        'packages/adapters/docs/src/{swarm.ts,index.ts,swarm.test.ts}',
      verifyCommand:
        // Structural: mesh topology + BFT actually called.
        `grep -q "topology: 'mesh'" ${REPO_ROOT}/packages/adapters/docs/src/swarm.ts && ` +
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/adapters/docs/dist/swarm.js && ` +
        `grep -q "ingestViaMeshSwarm" ${REPO_ROOT}/packages/adapters/docs/dist/index.js && ` +
        `grep -q "partitionForMesh" ${REPO_ROOT}/packages/adapters/docs/dist/swarm.js && ` +
        // Lifecycle tests pass.
        `(cd ${REPO_ROOT}/packages/adapters/docs && npm test 2>&1) | ` +
        `grep -q "pass 6" && ` +
        `git -C ${REPO_ROOT} cat-file -e e0d230f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e0d230f',
      description:
        'W26-2. Mesh-topology ephemeral swarm. 3 peer agents apply ' +
        'different title-extraction strategies (first-h1 / first-line / ' +
        'basename); byzantineVote() picks the majority per file. ' +
        'Deterministic core (id/content/timestamp) NOT voted on. Smoke ' +
        'trace: swarm-1780743510442 against this repo\'s 21 docs files, ' +
        'BFT(unanimous=0, voted=21, noQuorum=0) — every file had a ' +
        'genuine 2-of-3 majority. 6/6 lifecycle tests pass.',
    },
    {
      name: 'adapter-export-hierarchical-topology-swarm',
      where:
        'packages/adapters/export/src/{swarm.ts,index.ts,swarm.test.ts}',
      verifyCommand:
        // Structural: hierarchical topology + BFT + backfill-only swarm path.
        `grep -q "topology: 'hierarchical'" ${REPO_ROOT}/packages/adapters/export/src/swarm.ts && ` +
        `grep -q "byzantineVote" ${REPO_ROOT}/packages/adapters/export/dist/swarm.js && ` +
        `grep -q "ingestViaHierarchicalSwarm" ${REPO_ROOT}/packages/adapters/export/dist/index.js && ` +
        `grep -q "hierarchicalShards" ${REPO_ROOT}/packages/adapters/export/dist/swarm.js && ` +
        // Lifecycle tests pass.
        `(cd ${REPO_ROOT}/packages/adapters/export && npm test 2>&1) | ` +
        `grep -q "pass 6" && ` +
        `git -C ${REPO_ROOT} cat-file -e e0d230f^{commit}`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'e0d230f',
      description:
        'W26-3-export. Hierarchical-topology ephemeral swarm. 1 root ' +
        'coordinator + 3 child analysts apply different significance ' +
        'heuristics (length-floor / meta-filter / permissive); ' +
        'byzantineVote() picks include/filter verdict per turn. Watch mode ' +
        'stays linear (per-turn swarm is absurd overhead). Smoke trace: ' +
        'swarm-1780811897245 on a 617-turn Claude session, ' +
        'BFT(unanimous=617, voted=0, noQuorum=0) — real data is substantive ' +
        'enough that all strategies agree (synthetic tests cover 2-of-3 ' +
        'voted edge cases). 6/6 lifecycle tests pass.',
    },
    {
      name: 'swarm-lifecycle-verify-then-dissolve',
      where:
        'packages/adapters/{git,docs,export}/src/swarm.ts (try/finally ' +
        'around swarm.terminate())',
      verifyCommand:
        // Mechanical check: every adapter\'s swarm.ts that imports ruv-swarm
        // MUST also reference terminate(). Catches future drift if anyone
        // edits a swarm and accidentally removes the dissolve hook.
        `for f in ${REPO_ROOT}/packages/adapters/git/src/swarm.ts ` +
        `        ${REPO_ROOT}/packages/adapters/docs/src/swarm.ts ` +
        `        ${REPO_ROOT}/packages/adapters/export/src/swarm.ts; do ` +
        `  grep -q "ruv-swarm" "$f" && grep -q "terminate" "$f" || exit 1; ` +
        `done && ` +
        // All three adapters' lifecycle tests pass — 19 total live-swarm
        // cases that each prove the spawn → work → terminate cycle exits
        // clean without orphan agents.
        `(cd ${REPO_ROOT}/packages/adapters/git && npm test 2>&1) | grep -q "pass 7" && ` +
        `(cd ${REPO_ROOT}/packages/adapters/docs && npm test 2>&1) | grep -q "pass 6" && ` +
        `(cd ${REPO_ROOT}/packages/adapters/export && npm test 2>&1) | grep -q "pass 6"`,
      verifiedAt: VERIFIED_AT,
      landedAt: 'fd5137f + e0d230f',
      description:
        'W26-5. The "Verify-Then-Dissolve" invariant the operator named ' +
        'foundational. 19 live-swarm tests across 3 adapters prove the ' +
        'spawn → work → terminate cycle exits clean. Static grep ensures ' +
        'any future adapter that imports ruv-swarm must also reference ' +
        'terminate (drift-protection). Real-world smoke traces in the ' +
        'reason narrative above show zero orphan processes after each ' +
        'live ingestion.',
    },
  ],
  dormant: [
    // ─── 4 DORMANT (carried as-is from 83faa040) ─────────────────────────

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
      description: 'Operator-facing V0.5 one-pager.',
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
    `  83faa040 + e3bd67a4 + 0853a7ae + every earlier checkpoint PRESERVED.\n` +
    `  Verify (structural, fast):     CONTINUUM_PROJECT_ID=${PROJECT_ID} continuum verify\n` +
    `  Verify (operational SLA, ~1m): node scripts/verify-w25-throughput.mjs\n`,
);

s.close();
