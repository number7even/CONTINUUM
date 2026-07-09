// Authorship Ledger — Phase 1 verify (spec §9.1).
//
// Proves the consent primitive works end-to-end: a scripted accept, through the
// REAL continuum_record_decision handler + storage, writes an Observation with
// type='decision' carrying a self-integrity contentHash, under the 'authorship'
// ledger source. Green = the P9 boundary is captured as immutable provenance.
//
//   CONTINUUM_DATA_DIR=$(mktemp -d) node scripts/verify-authorship-phase1.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openStorage } from '@number7even/continuum-core';
import { handleRecordDecision } from '@number7even/continuum-mcp-server/dist/tools/record-decision.js';

// Self-contained: use an isolated temp data dir so the verify never touches real data.
if (!process.env.CONTINUUM_DATA_DIR) process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'authorship-'));

const projectId = 'authorship-phase1';
const storage = openStorage(projectId);

const res = await handleRecordDecision(
  {
    verdict: 'accept',
    subject: { kind: 'todo', id: 't-123', title: 'VAULT rights wall' },
    operator: 'riaan@mac.com',
    rationale: 'matches spec issue #12',
    basis: { verifyCommand: 'node vault-guard.test.mjs', exitCode: 0 },
    refs: ['obs:abc'],
  },
  storage,
);
const out = JSON.parse(res.content[0].text);
console.log('handler →', JSON.stringify(out, null, 2));

const db = new Database(`${process.env.CONTINUUM_DATA_DIR}/${projectId}/continuum.db`, { readonly: true });
const row = db
  .prepare(
    "SELECT type, source_id, json_extract(metadata,'$.contentHash') ch, json_extract(metadata,'$.verdict') v, json_extract(metadata,'$.operator') op FROM observations WHERE type='decision'",
  )
  .get();
console.log('DB row →', JSON.stringify(row));

const passType = out.type === 'decision' && row?.type === 'decision';
const passHash = typeof row?.ch === 'string' && row.ch.startsWith('sha256:') && out.contentHash === row.ch;
const passSource = row?.source_id === 'authorship';
const passVerdict = row?.v === 'accept' && row?.op === 'riaan@mac.com';
console.log(`checks: type=${passType} contentHash=${passHash} source=${passSource} consent=${passVerdict}`);

const green = passType && passHash && passSource && passVerdict;
console.log(green ? 'PHASE1_VERIFY: GREEN' : 'PHASE1_VERIFY: RED');
process.exit(green ? 0 : 1);
