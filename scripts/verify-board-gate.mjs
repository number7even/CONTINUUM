// verify-board-gate.mjs — proves the Truth Ledger is WELDED to the Board: a todo cannot
// enter the DONE column, nor be mechanically marked done (hard gate), without a PROVEN
// multi-signature TruthBlock. This is the "weaponization" of the ledger — the mechanical
// boundary, tested against a real on-disk SQLite DB (not mocks).
//
//   1. classifier: no block            → SKIPPED (unproven done never reaches DONE)
//   2. classifier: A+V+T, no H accept  → REVIEW  (awaiting the human leap, P9)
//   3. classifier: full distinct-key   → DONE
//   4. classifier: V disputes          → FAILED  (the caught lie)
//   5. persistence: append-only chain link enforced (fork/rewrite rejected)
//   6. hard gate: updateTodo → done with no PROVEN block  → THROWS (CONTINUUM_TRUTH_GATE=1)
//   7. hard gate: updateTodo → done WITH a PROVEN block    → succeeds
//   8. verifyLedger over the persisted chain               → ok
//
//   node scripts/verify-board-gate.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-boardgate-'));
process.env.CONTINUUM_TRUTH_GATE = '1';

const {
  openDb, createTodo, updateTodo,
  generateIdentity, signEntry, registerIdentity, sealAndAppend, verdictForTask,
  truthBoardColumn, todoTaskRef, verifyLedger, allTruthBlocks, listIdentities,
} = await import('@number7even/continuum-core');

const db = openDb('boardgate-test');

// Register the five powers' public keys.
const BALL = generateIdentity('ball', 'ball'), A = generateIdentity('executor', 'A');
const V = generateIdentity('validator', 'V'), T = generateIdentity('tester', 'T'), H = generateIdentity('human', 'H');
for (const kp of [BALL, A, V, T, H]) registerIdentity(db, kp);

const mk = (kind, taskRef, kp, payload) => signEntry({ kind, taskRef, at: new Date().toISOString(), by: kp.keyId, role: kp.role, payload }, kp);
const results = [];
const check = (name, got, want) => { const ok = got === want; results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}: ${got}${ok ? '' : ` (wanted ${want})`}`); };

console.log('── classifier: the DONE column is gated by verdict ────────────────────');
check('no block → SKIPPED', truthBoardColumn({ status: 'done', verdict: null }), 'SKIPPED');
check('A+V+T, no H → REVIEW', truthBoardColumn({ status: 'in_progress', verdict: 'PENDING_HUMAN' }), 'REVIEW');
check('full set → DONE', truthBoardColumn({ status: 'done', verdict: 'PROVEN' }), 'DONE');
check('V disputes → FAILED', truthBoardColumn({ status: 'done', verdict: 'CONTESTED' }), 'FAILED');

console.log('── persistence: real DB, append-only chain ────────────────────────────');
// A todo whose task is NOT yet proven.
const todo = createTodo(db, { title: 'harden auth', status: 'in_progress' });
const ref = todoTaskRef(todo.id);
// Round 1: A claims, V confirms, T tests exit 0 — but H has NOT accepted yet.
const pending = sealAndAppend(db, { taskRef: ref, entries: [
  mk('spec', ref, BALL, { statement: 'reject forged tokens', definitionOfDone: 'exit 0' }),
  mk('claim', ref, A, { statement: 'auth hardened', verifyCommand: 'exit 0' }),
  mk('validation', ref, V, { verdict: 'confirm', reasoning: 'scope clean' }),
  mk('test', ref, T, { verifyCommand: 'exit 0', exitCode: 0, outputHash: 'h', verifier: 'ci' }),
] });
check('round 1 verdict', pending.verdict, 'PENDING_HUMAN');
check('persisted verdict', verdictForTask(db, ref), 'PENDING_HUMAN');

console.log('── hard gate: updateTodo → done is blocked without PROVEN ──────────────');
let blocked = false;
try { updateTodo(db, { id: todo.id, status: 'done' }); } catch { blocked = true; }
check('updateTodo→done blocked (PENDING_HUMAN)', blocked ? 'blocked' : 'ALLOWED', 'blocked');

// Round 2: H makes the leap — a new block on the chain adds the accept signature.
const proven = sealAndAppend(db, { taskRef: ref, entries: [
  mk('claim', ref, A, { statement: 'auth hardened', verifyCommand: 'exit 0' }),
  mk('validation', ref, V, { verdict: 'confirm', reasoning: 'scope clean' }),
  mk('test', ref, T, { verifyCommand: 'exit 0', exitCode: 0, outputHash: 'h', verifier: 'ci' }),
  mk('decision', ref, H, { decision: 'accept' }),
] });
check('round 2 verdict', proven.verdict, 'PROVEN');

let allowed = false;
try { updateTodo(db, { id: todo.id, status: 'done' }); allowed = true; } catch (e) { console.log('   (unexpected: ' + e.message + ')'); }
check('updateTodo→done now succeeds (PROVEN)', allowed ? 'done' : 'STILL BLOCKED', 'done');

console.log('── append-only: a forked block is rejected ────────────────────────────');
let forkRejected = false;
try {
  // Re-seal against a stale head by hand-forging a bad prevHash is caught by appendTruthBlock;
  // simplest: attempt to append a duplicate index via a second engine seal on a rolled-back head.
  const { finalizeBlock, GENESIS } = await import('@number7even/continuum-core');
  const forged = finalizeBlock({ index: 0, prevHash: GENESIS, taskRef: ref, entries: [mk('claim', ref, A, { statement: 'x' })] }, listIdentities(db));
  const { appendTruthBlock } = await import('@number7even/continuum-core');
  appendTruthBlock(db, forged); // index 0 already taken → append-only violation
} catch { forkRejected = true; }
check('fork/rewrite rejected', forkRejected ? 'rejected' : 'ACCEPTED', 'rejected');

console.log('── verifyLedger over the persisted chain ──────────────────────────────');
const rep = await verifyLedger(allTruthBlocks(db), listIdentities(db));
check('persisted chain verifies', rep.ok ? 'ok' : `issues:${rep.issues.map(i => i.kind)}`, 'ok');

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('BOARD_GATE_VERIFY: GREEN — no task enters DONE without a PROVEN multi-signature TruthBlock;');
  console.log('the hard data-layer gate blocks it, the chain is append-only, and the ledger re-verifies.');
  process.exit(0);
} else { console.log('BOARD_GATE_VERIFY: RED'); process.exit(1); }
