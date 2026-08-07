// verify-truth-ledger.mjs — the mechanical proof-gate for the multi-signature TruthBlock.
//
// Proves, with cold execution (not prose), that the ledger enforces "verify, don't trust":
//   1. HAPPY PATH   — full DISTINCT-key set (BALL·A·V·T·H), V confirm, T exit 0, H accept → PROVEN
//   2. COLLUSION    — A signs its own VALIDATION (shared key)                → INVALID (rejected)
//   3. COLLUSION    — A signs its own TEST (shared key)                      → INVALID (rejected)
//   4. NO HUMAN     — A+V+T all green but H has not accepted                 → PENDING_HUMAN (not done)
//   5. REFUTED      — T ran and exit ≠ 0                                     → REFUTED
//   6. CONTESTED    — V disputed the claim                                   → CONTESTED
//   7. IMPERSONATION— an LLM (executor role) signs the DECISION              → INVALID (P9 can't be minted)
//   8. TAMPER       — flip a byte in a sealed entry's payload                → verifyLedger catches sig+tamper
//   9. BROKEN CHAIN — corrupt a prevHash                                     → verifyLedger catches chain
//  10. RE-TEST      — verifyLedger re-runs a PROVEN block's verifyCommand    → exit 0 ok · exit 1 flagged
//
//   node scripts/verify-truth-ledger.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import {
  generateIdentity, signEntry, finalizeBlock, evaluateVerdict, verifyLedger, GENESIS,
} from '@number7even/continuum-core';

const pub = ({ keyId, role, publicKey }) => ({ keyId, role, publicKey });
const mk = (kind, taskRef, kp, payload) =>
  signEntry({ kind, taskRef, at: new Date().toISOString(), by: kp.keyId, role: kp.role, payload }, kp);

// The five distinct powers, each with its own Ed25519 key.
const BALL = generateIdentity('ball', 'ball');
const A = generateIdentity('executor', 'A');
const V = generateIdentity('validator', 'V');
const T = generateIdentity('tester', 'T');
const H = generateIdentity('human', 'H');
const IDS = [BALL, A, V, T, H].map(pub);
const idById = new Map(IDS.map(i => [i.keyId, i]));
const TASK = 'task:fix-auth';

const results = [];
const check = (name, got, want) => { const ok = got === want; results.push({ name, got, want, ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}: ${got}${ok ? '' : ` (wanted ${want})`}`); return ok; };

const spec  = () => mk('spec', TASK, BALL, { statement: 'Auth rejects forged tokens', definitionOfDone: 'test exits 0' });
const claim = (kp = A) => mk('claim', TASK, kp, { statement: 'auth hardened', verifyCommand: 'exit 0', diffHash: 'abc' });
const valOK = (kp = V) => mk('validation', TASK, kp, { verdict: 'confirm', reasoning: 'scope clean, no privacy leak' });
const testOK = (kp = T) => mk('test', TASK, kp, { verifyCommand: 'exit 0', exitCode: 0, outputHash: 'h', verifier: 'ci' });
const accept = (kp = H) => mk('decision', TASK, kp, { decision: 'accept' });

console.log('── 1–7 · the verdict gate ─────────────────────────────────────────────');
// 1 · HAPPY PATH → PROVEN
const proven = finalizeBlock({ index: 0, prevHash: GENESIS, taskRef: TASK, entries: [spec(), claim(), valOK(), testOK(), accept()] }, IDS);
check('happy path (5 distinct keys)', proven.verdict, 'PROVEN');

// 2 · A validates itself (shared key) → INVALID
check('collusion: A signs VALIDATION', evaluateVerdict([claim(), valOK(A), testOK(), accept()], idById), 'INVALID');
// 3 · A tests itself (shared key) → INVALID
check('collusion: A signs TEST', evaluateVerdict([claim(), valOK(), testOK(A), accept()], idById), 'INVALID');
// 4 · no human acceptance → PENDING_HUMAN
check('no human accept', evaluateVerdict([claim(), valOK(), testOK()], idById), 'PENDING_HUMAN');
// 5 · test failed → REFUTED
const testBad = mk('test', TASK, T, { verifyCommand: 'exit 1', exitCode: 1, outputHash: 'h', verifier: 'ci' });
check('T exit ≠ 0', evaluateVerdict([claim(), valOK(), testBad, accept()], idById), 'REFUTED');
// 6 · validator disputed → CONTESTED
const valDispute = mk('validation', TASK, V, { verdict: 'dispute', reasoning: 'out-of-bounds impact on billing' });
check('V disputes', evaluateVerdict([claim(), valDispute, testOK(), accept()], idById), 'CONTESTED');
// 7 · an LLM tries to mint the human leap → INVALID (role integrity)
const fakeAccept = signEntry({ kind: 'decision', taskRef: TASK, at: new Date().toISOString(), by: A.keyId, role: A.role, payload: { decision: 'accept' } }, A);
check('executor signs DECISION (P9 forgery)', evaluateVerdict([claim(), valOK(), testOK(), fakeAccept], idById), 'INVALID');

console.log('── 8–9 · chain & tamper detection ─────────────────────────────────────');
// A clean two-block chain to corrupt.
const b0 = proven;
// Second block for task:2 — entries re-signed for the fresh taskRef so their sigs are valid.
const b1clean = finalizeBlock({ index: 1, prevHash: b0.blockHash, taskRef: 'task:2', entries: [
  mk('claim', 'task:2', A, { statement: 'x', verifyCommand: 'exit 0' }), mk('validation', 'task:2', V, { verdict: 'confirm', reasoning: 'ok' }),
  mk('test', 'task:2', T, { verifyCommand: 'exit 0', exitCode: 0, outputHash: 'h', verifier: 'ci' }), mk('decision', 'task:2', H, { decision: 'accept' }),
] }, IDS);

const clean = await verifyLedger([b0, b1clean], IDS);
check('clean chain verifies', clean.ok ? 'ok' : 'issues', 'ok');

// 8 · TAMPER — mutate a sealed entry's payload without re-signing.
const tampered = structuredClone(b0);
tampered.entries.find(e => e.kind === 'claim').payload.statement = 'auth NOT hardened — silently changed';
const tamperRep = await verifyLedger([tampered, b1clean], IDS);
check('tampered payload caught', tamperRep.ok ? 'MISSED' : 'caught', 'caught');
console.log(`      → issues: ${tamperRep.issues.map(i => i.kind).join(', ')}`);

// 9 · BROKEN CHAIN — corrupt the link.
const brokenLink = structuredClone(b1clean); brokenLink.prevHash = 'deadbeef'.repeat(8);
const chainRep = await verifyLedger([b0, brokenLink], IDS);
check('broken prevHash caught', chainRep.ok ? 'MISSED' : 'caught', 'caught');

console.log('── 10 · mechanical re-test (verify-then-dissolve on history) ───────────');
const reOk = await verifyLedger([b0], IDS, { runVerify: async () => ({ exitCode: 0 }) });
check('PROVEN block re-tests green', reOk.ok ? 'ok' : 'issues', 'ok');
const reBad = await verifyLedger([b0], IDS, { runVerify: async () => ({ exitCode: 1 }) });
check('PROVEN block that no longer passes is flagged', reBad.ok ? 'MISSED' : 'caught', 'caught');

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('TRUTH_LEDGER_VERIFY: GREEN — collusion is structurally impossible; only distinct-key,');
  console.log('human-accepted, mechanically-tested claims finalize as PROVEN; tamper & chain breaks are caught.');
  process.exit(0);
} else {
  console.log('TRUTH_LEDGER_VERIFY: RED');
  process.exit(1);
}
