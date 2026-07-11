// Authorship Phase 3 verify — the legal shield can be PRINTED (and it detects tamper).
//
// Seeds a sealed checkpoint (record_decision → acceptedBy → record_checkpoint), runs the
// REAL `continuum authorship export` CLI, and asserts the generated file contains the
// correct, UNBROKEN SHA-256 checkpoint hash + operator identity + the IP/liability
// attestation. Then proves the export FLAGS a tampered seal as BROKEN.
//
//   node scripts/verify-authorship-phase3.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStorage, buildAuthorshipExport } from '@number7even/continuum-core';
import { handleRecordDecision } from '@number7even/continuum-mcp-server/dist/tools/record-decision.js';

const DATA = mkdtempSync(join(tmpdir(), 'authorship3-'));
process.env.CONTINUUM_DATA_DIR = DATA;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const project = 'authorship-phase3';

// 1 — seed a sealed checkpoint: decision → acceptedBy → checkpoint.
const s = openStorage(project);
const decRes = await handleRecordDecision(
  { verdict: 'accept', subject: { kind: 'todo', id: 't1', title: 'the authorship seal' }, operator: 'riaan@mac.com', basis: { verifyCommand: 'true', exitCode: 0 }, rationale: 'matches the spec' },
  s,
);
const dec = JSON.parse(decRes.content[0].text); // { id, contentHash, operator, ... }
const at = new Date().toISOString();
const entry = {
  name: 'authorship-ledger', where: 'packages/core/src/authorship-export.ts',
  verifyCommand: 'node scripts/verify-authorship-phase3.mjs', verifiedAt: at, landedAt: 'abc1234',
  acceptedBy: { operator: dec.operator, decisionId: dec.id, decisionHash: dec.contentHash, at },
};
const snap = s.recordCheckpoint({ reason: 'phase-3 export', active: [entry] });
const H = snap.hash;
try { s.close(); } catch { /* noop */ }

// 2 — run the REAL cli export.
const cli = fileURLToPath(new URL('../packages/cli/dist/index.js', import.meta.url));
const code = await new Promise((resolve) => {
  spawn('node', [cli, 'authorship', 'export', '-p', project], {
    env: { ...process.env, CONTINUUM_PROJECT_ID: project, CONTINUUM_STORAGE_BACKEND: 'sqlite' }, stdio: 'inherit',
  }).on('exit', resolve);
});

// 3 — read the printed artifact.
const dir = join(DATA, project, 'authorship');
const jsonFile = readdirSync(dir).find((f) => f.endsWith('.json'));
const raw = readFileSync(join(dir, jsonFile), 'utf8');
const exp = JSON.parse(raw);
const a0 = exp.authorship[0] ?? {};

const hasHash = raw.includes(H) && a0.sealedInCheckpoint === H;
const hasOperator = raw.includes('riaan@mac.com') && a0.operator === 'riaan@mac.com';
const intact = exp.intact === true && a0.checkpointIntact === true && a0.decisionVerified === true;
const attests = raw.includes('vest in that operator') && raw.includes('asserts no authorship');
const commit = a0.landedAt === 'abc1234';
const cliOk = code === 0;

// 4 — tamper sub-check: mutate the sealed decision reference → export must flag BROKEN.
const tampered = [{ ...entry, acceptedBy: { ...entry.acceptedBy, decisionHash: 'sha256:deadbeef' } }];
const mock = {
  listSnapshots: () => [{ id: snap.id, timestamp: snap.timestamp, active: tampered, dormant: [], broken: [], hash: H, reason: snap.reason }],
  getObservations: () => [],
};
const tamperExp = buildAuthorshipExport(mock, { project, generatedAt: at });
const tamperDetected = tamperExp.intact === false && tamperExp.chain[0].intact === false;

console.log(`cli exit=${code} · hash-in-file=${raw.includes(H)} · operator-in-file=${raw.includes('riaan@mac.com')}`);
console.log(`checks: hash=${hasHash} operator=${hasOperator} intact=${intact} attests=${attests} commit=${commit} cli=${cliOk} tamperDetected=${tamperDetected}`);
const green = hasHash && hasOperator && intact && attests && commit && cliOk && tamperDetected;
console.log(green ? 'AUTHORSHIP_PHASE3_VERIFY: GREEN — the legal shield prints (unbroken) and detects tamper' : 'AUTHORSHIP_PHASE3_VERIFY: RED');
process.exit(green ? 0 : 1);
