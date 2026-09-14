#!/usr/bin/env node
// verify-approve-decision.mjs — the gate for the on-engine P9 seal command.
// Proves: mints through the choke-point · wall-projection shape · contentHash
// is byte-identical to the worker's draftContentHash (no drift) · REFUSES a
// missing operator (P9: the human is named or nothing seals) · refuses an
// empty brief · tenant scoping holds (cross-tenant read comes back empty).
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CLI = join(REPO, 'packages', 'cli', 'dist', 'index.js');

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'appr-dec-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const run = (args) => spawnSync('node', [CLI, 'approve-decision', ...args], { encoding: 'utf8', env: process.env });

const brief = { headline: 'Voice AI for boutique hotels', points: ['24/7 answering', 'no missed bookings'], cta: 'Book a walkthrough' };
const draftPath = join(process.env.CONTINUUM_DATA_DIR, 'draft.json');
writeFileSync(draftPath, JSON.stringify({ id: 'gate-draft-1', slug: 'voicecosmos', brief }, null, 2));

// 1. refuses without --operator (P9)
const r1 = run(['gate-tenant', '--brief', draftPath]);
check('REFUSES without --operator (P9: the human is named or nothing seals)', r1.status === 1 && /operator/.test(r1.stderr));

// 2. refuses an empty brief
const emptyPath = join(process.env.CONTINUUM_DATA_DIR, 'empty.json');
writeFileSync(emptyPath, '{}');
const r2 = run(['gate-tenant', '--brief', emptyPath, '--operator', 'Gate Runner']);
check('refuses an empty brief', r2.status === 1 && /empty|nothing to seal|draft id/.test(r2.stderr));

// 3. mints through the choke-point, readable back from the tenant's storage
const r3 = run(['gate-tenant', '--brief', draftPath, '--operator', 'Gate Runner', '--rationale', 'gate run']);
const decisionId = r3.stdout.match(/P9 decision sealed — (\S+)/)?.[1];
check('mints and reports a decision id', r3.status === 0 && !!decisionId, decisionId ?? r3.stderr.slice(0, 120));

const { openStorage, consentHash } = await import(join(REPO, 'packages/core/dist/index.js'));
const storage = openStorage('gate-tenant');
const [obs] = await storage.getObservations([decisionId]);
check('stored as type=decision with verdict accept', obs?.type === 'decision' && obs?.metadata?.verdict === 'accept');
check('operator provenance preserved (scrub-exempt)', obs?.metadata?.operator === 'Gate Runner');

// 4. wall-projection shape: subject.contentHash present and binds the brief
const bound = obs?.metadata?.subject?.contentHash;
check('wall shape: metadata.subject.contentHash present', typeof bound === 'string' && bound.startsWith('sha256:'));

// 5. NO DRIFT: the CLI's hash === the worker's draftContentHash over the same record
const { draftContentHash } = await import(join(REPO, 'apps/amf/worker/review.mjs'));
const workerHash = draftContentHash({ brief });
check('contentHash byte-identical to worker draftContentHash (no drift)', bound === workerHash && bound === consentHash(brief), `${bound?.slice(0, 24)}…`);

// 6. tenant scoping: the seal does not exist in another tenant's storage
const other = openStorage('other-tenant');
const cross = await other.getObservations([decisionId]);
check('cross-tenant read comes back empty (isolation holds)', !cross || cross.length === 0);
other.close?.();
storage.close?.();

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const pass = results.every(Boolean);
console.log(`\nAPPROVE_DECISION_VERIFY: ${pass ? 'GREEN' : 'RED'} — ${results.filter(Boolean).length}/${results.length}`);
process.exit(pass ? 0 : 1);
