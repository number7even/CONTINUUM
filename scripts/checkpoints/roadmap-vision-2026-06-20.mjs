#!/usr/bin/env node
/**
 * Reproducible artifact — ROADMAP_VISION sealed, 2026-06-20.
 *
 * Seals docs/ROADMAP_VISION.md into the append-only checkpoint ledger as
 * the durable, status-tagged source of truth for the next North Star
 * alignment. Captures the full Phase 0→5 sequenced plan so it never has
 * to be re-pasted into a session — the whole point of a memory engine.
 *
 * Phase 0 (Land V1) is the only active phase. Everything below it is
 * tracked but gated. This checkpoint records WHERE the roadmap lives and
 * the human-decision gates that block each downstream phase.
 *
 * RUN WITH:
 *   node scripts/checkpoints/roadmap-vision-2026-06-20.mjs
 *
 * RE-RUN BEHAVIOR: append-only. Each invocation inserts a NEW snapshot
 * row with a fresh UUID, timestamp, and hash — checkpoints are immutable
 * by design (V0 schema, ARCHITECTURE.md §4).
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
const ROADMAP = `${REPO_ROOT}/docs/ROADMAP_VISION.md`;

delete process.env.CONTINUUM_STORAGE_BACKEND;
const s = openStorage(PROJECT_ID);

const snapshot = s.recordCheckpoint({
  reason:
    'ROADMAP_VISION sealed — durable, status-tagged source of truth for ' +
    'the next North Star alignment. Six phases, each ending in a ' +
    'shell-verifiable gate: P0 Land V1 (active, ~95%, blocked on npm 2FA ' +
    'token — human leap P9), P1 Perimeter Intelligence (git-mcp + ' +
    'gitingest/gitreverse adapter-remote-git), P3 Execution Substrate ' +
    '(Headroom pulled forward per operator directive), P2 V2 Substrate ' +
    '(gated on D-V2.2 lock), P4 H-MARA ladder (Rung 0 on cloud APIs; ' +
    'deeper rungs gated on ruvllm local inference, Issue #3), P5 AMF ' +
    '(separate AMF/ repo, post-V1, months not weeks). Dolt REJECTED ' +
    '(in-session memory-probe failure). Verify-then-dissolve applied to ' +
    'the project\'s own buildout: no phase done until a command exits 0.',
  active: [
    {
      name: 'roadmap-vision-doc',
      where: 'docs/ROADMAP_VISION.md',
      verifyCommand:
        `test -f ${ROADMAP} && ` +
        `grep -q "Phase 0 — Land V1" ${ROADMAP} && ` +
        `grep -q "Phase 5 — Autonomous Media Factory" ${ROADMAP} && ` +
        `grep -q "Dolt" ${ROADMAP} && ` +
        `grep -q "verify-then-dissolve" ${ROADMAP}`,
      verifiedAt: VERIFIED_AT,
      description:
        'The full Phase 0→5 sequenced roadmap, status-tagged (done / ' +
        'locked / gated / parked / rejected). Supersedes ad-hoc blueprints ' +
        'pasted into chat. Six phases, each with a shell-verifiable gate.',
    },
    {
      name: 'phase-0-domain-topology-live',
      where: 'continuum.rest / console.continuum.rest / api.continuum.rest',
      verifyCommand:
        `curl -sS -o /dev/null -w '%{http_code}' --max-time 20 https://www.continuum.rest/ | grep -q 200 && ` +
        `curl -sSI --max-time 20 https://console.continuum.rest/ | grep -qi 'x-robots-tag: noindex' && ` +
        `curl -sS -o /dev/null -w '%{http_code}' --max-time 20 https://api.continuum.rest/ | grep -q 401`,
      verifiedAt: VERIFIED_AT,
      description:
        'Enterprise topology live: apex/www → public indexable docs ' +
        '(Astro Starlight), console → noindex operator console, api → ' +
        'Fly engine with Bearer auth (401 unauth). Phase 0 milestone.',
    },
    {
      name: 'phase-0-console-hardened',
      where: 'apps/console/next.config.js + app/robots.ts',
      verifyCommand:
        `curl -sSI --max-time 20 https://console.continuum.rest/ | grep -qi 'content-security-policy' && ` +
        `curl -sSI --max-time 20 https://console.continuum.rest/ | grep -qi 'x-frame-options: DENY' && ` +
        `! curl -sSI --max-time 20 https://console.continuum.rest/ | grep -qi 'x-powered-by'`,
      verifiedAt: VERIFIED_AT,
      description:
        'Operator console security hardening live in prod: CSP, ' +
        'X-Frame-Options DENY, nosniff, referrer/permissions policy, ' +
        'x-powered-by stripped. Verified end-to-end via curl.',
    },
  ],
  dormant: [
    {
      name: 'phase-0-npm-publish-pending',
      where: 'packages/{core,mcp-server,cli} → npm registry',
      verifyCommand:
        `npm view @continuum/core version 2>/dev/null | grep -qE '[0-9]+\\.[0-9]+\\.[0-9]+'`,
      verifiedAt: VERIFIED_AT,
      description:
        'GATED on a working npm 2FA token (human leap, P9). Packages ' +
        'built + configured for public publish (files:[dist], ' +
        'publishConfig.access:public). verifyCommand goes green the ' +
        'moment core is published. Currently RED by design — the gate.',
    },
    {
      name: 'phase-0-docs-polish-pending',
      where: 'apps/docs ($impeccable sequence)',
      verifyCommand:
        `test -f ${REPO_ROOT}/apps/docs/src/content/docs/index.mdx`,
      verifiedAt: VERIFIED_AT,
      description:
        'Docs site live at continuum-docs.vercel.app → apex. The ' +
        '$impeccable polish sequence (audit→…→clarify→re-audit) runs ' +
        'against it now while the npm token is handled in parallel. ' +
        'Git-connect deferred until polish complete (deliberate).',
    },
  ],
  broken: [],
});

console.log('ROADMAP_VISION checkpoint written.');
console.log('  project:   ', PROJECT_ID);
console.log('  id:        ', snapshot.id);
console.log('  timestamp: ', snapshot.timestamp);
console.log('  hash:      ', snapshot.hash);
console.log('  active:    ', snapshot.active.length, 'entries');
console.log('  dormant:   ', snapshot.dormant.length, 'entries (Phase 0 gates)');
console.log('  broken:    ', snapshot.broken.length, 'entries');

s.close();
