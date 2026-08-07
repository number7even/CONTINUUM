// Authorship Ledger — Phase 2 verify (spec §9.2): THE SEAL + tamper detection.
//
// Proves the human's decision is welded into the checkpoint's SHA-256 hash and
// that altering the decision is DETECTABLE:
//   A. commitment — a checkpoint WITH the acceptedBy seal hashes differently than
//      the same entry WITHOUT it → the decision is inside the hash.
//   B. reproducible — re-deriving the hash of the untampered entries === the
//      stored checkpoint hash (an honest re-verify passes).
//   C. tamper detected — mutate the sealed decision reference, re-derive → the
//      hash DIFFERS from the stored one → tamper is evident. The legal shield.
//
//   CONTINUUM_DATA_DIR=$(mktemp -d) node scripts/verify-authorship-phase2.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage, computeCheckpointHash } from '@number7even/continuum-core';
import { handleRecordDecision } from '@number7even/continuum-mcp-server/dist/tools/record-decision.js';

if (!process.env.CONTINUUM_DATA_DIR) process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'authorship2-'));

const storage = openStorage('authorship-phase2');

// 1. Human accepts → the decision (Phase 1 primitive).
const decRes = await handleRecordDecision(
  {
    verdict: 'accept',
    subject: { kind: 'todo', id: 't-777', title: 'authorship seal' },
    operator: 'riaan@mac.com',
    basis: { verifyCommand: 'node scripts/verify-authorship-phase2.mjs', exitCode: 0 },
  },
  storage,
);
const decision = JSON.parse(decRes.content[0].text);

// 2. Stamp the seal onto the state entry, then record a checkpoint (the seal).
const at = new Date().toISOString();
const sealedEntry = {
  name: 'authorship-ledger',
  where: 'packages/core/src/types.ts:StateEntry.acceptedBy',
  verifyCommand: 'node scripts/verify-authorship-phase2.mjs',
  verifiedAt: at,
  acceptedBy: { operator: decision.operator, decisionId: decision.id, decisionHash: decision.contentHash, at },
};
const snap = storage.recordCheckpoint({ reason: 'phase-2 seal', active: [sealedEntry] });
const STORED = snap.hash; // the sealed, persisted checkpoint hash

// A — commitment: removing the seal changes the hash → acceptedBy IS in the hash.
const unsealed = { ...sealedEntry };
delete unsealed.acceptedBy;
const hashUnsealed = computeCheckpointHash([unsealed]);
const A = hashUnsealed !== STORED;

// B — reproducible: re-deriving the untampered entries === the stored hash.
const B = computeCheckpointHash([sealedEntry]) === STORED;

// C — tamper detected: mutate the sealed decision reference, re-derive → differs.
const tampered = { ...sealedEntry, acceptedBy: { ...sealedEntry.acceptedBy, decisionHash: 'sha256:deadbeef' } };
const hashTampered = computeCheckpointHash([tampered]);
const C = hashTampered !== STORED;

console.log('stored checkpoint hash :', STORED.slice(0, 24) + '…');
console.log('unsealed (no acceptedBy):', hashUnsealed.slice(0, 24) + '…', A ? '≠ stored ✓' : '= stored ✗');
console.log('re-derived (untampered) :', B ? '= stored ✓' : '≠ stored ✗');
console.log('tampered decisionHash   :', hashTampered.slice(0, 24) + '…', C ? '≠ stored → TAMPER DETECTED ✓' : '= stored ✗');
console.log(`checks: commitment=${A} reproducible=${B} tamperDetected=${C}`);

const green = A && B && C;
console.log(green ? 'PHASE2_VERIFY: GREEN' : 'PHASE2_VERIFY: RED');
process.exit(green ? 0 : 1);
