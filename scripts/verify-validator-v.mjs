// verify-validator-v.mjs — proves the REAL independent Validator wiring (D2-V) without a
// live model: fetch is injected, so every path is deterministic. What it proves:
//
//   confirm → signed validation welded + T mechanically runs → PENDING_HUMAN
//   confirm + failing verifyCommand → REFUTED (T's veto)
//   dispute → CONTESTED
//   ABSTAIN discipline (P4): unparseable output / HTTP error / model down → NO entry signed,
//     the task stays UNVERIFIED — V never silently confirms, never fakes a dispute
//   collusion guard: V refuses to judge a claim signed by its own key
//   V's key persists across runs (stable identity)
//
//   node scripts/verify-validator-v.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-valv-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage, generateIdentity, signEntry, todoTaskRef } = await import('@number7even/continuum-core');
const { runValidator, validatorKey, parseVerdict, buildPrompt } = await import('./validator-v.mjs');

const storage = await openStorage('valv');
const A = generateIdentity('executor', 'A');
storage.registerIdentity({ keyId: A.keyId, role: A.role, publicKey: A.publicKey });

const mkTodo = (title, verifyCommand = 'exit 0') => {
  const t = storage.createTodo({ title, status: 'in_progress' });
  const ref = todoTaskRef(t.id);
  storage.submitLedgerEntry(ref, signEntry({
    kind: 'claim', taskRef: ref, at: new Date().toISOString(), by: A.keyId, role: 'executor',
    payload: { statement: `${title} done`, verifyCommand },
  }, A));
  return t;
};
const ollamaSays = (text) => async () => ({ ok: true, json: async () => ({ response: text }) });

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── pure helpers ───────────────────────────────────────────────────────');
check('parseVerdict extracts JSON from wrapper prose',
  parseVerdict('Sure! Here you go: {"verdict":"confirm","reasoning":"scope clean"} hope that helps')?.verdict === 'confirm');
check('parseVerdict rejects junk → null (abstain)', parseVerdict('DONE! ship it!') === null);
check('prompt carries the claim statement', buildPrompt({ statement: 'auth hardened' }).includes('auth hardened'));

console.log('── confirm path: V judgment + T referee ───────────────────────────────');
const t1 = mkTodo('passing task', 'exit 0');
const r1 = await runValidator({ storage, todoId: t1.id, fetchImpl: ollamaSays('{"verdict":"confirm","reasoning":"scope matches, no leaks"}') });
check('confirm welded, T ran exit 0 → PENDING_HUMAN', r1.ok && r1.verdict === 'PENDING_HUMAN', r1.verdict ?? r1.why);

const t2 = mkTodo('claims done but test fails', 'exit 1');
const r2 = await runValidator({ storage, todoId: t2.id, fetchImpl: ollamaSays('{"verdict":"confirm","reasoning":"looks fine"}') });
check('confirm + failing command → REFUTED (T veto)', r2.ok && r2.verdict === 'REFUTED', r2.verdict ?? r2.why);

console.log('── dispute path ───────────────────────────────────────────────────────');
const t3 = mkTodo('overclaimed task');
const r3 = await runValidator({ storage, todoId: t3.id, fetchImpl: ollamaSays('{"verdict":"dispute","reasoning":"claim exceeds the evidence"}') });
check('dispute → CONTESTED', r3.ok && r3.verdict === 'CONTESTED', r3.verdict ?? r3.why);

console.log('── abstain discipline (P4) ────────────────────────────────────────────');
const t4 = mkTodo('unparseable case');
const r4 = await runValidator({ storage, todoId: t4.id, fetchImpl: ollamaSays('LGTM!!') });
check('unparseable output → abstains (no entry)', !r4.ok && r4.abstained, r4.why);
check('…and the task stays UNVERIFIED', storage.verdictForTask(todoTaskRef(t4.id)) === 'UNVERIFIED');
const r5 = await runValidator({ storage, todoId: t4.id, fetchImpl: async () => ({ ok: false, status: 500 }) });
check('HTTP 500 → abstains', !r5.ok && r5.abstained, r5.why);
const r6 = await runValidator({ storage, todoId: t4.id, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
check('model down → abstains', !r6.ok && r6.abstained, r6.why);

console.log('── collusion guard + key persistence ──────────────────────────────────');
const vkp = validatorKey();
check('V key persists (same keyId on reload)', validatorKey().keyId === vkp.keyId, vkp.keyId);
const t5 = storage.createTodo({ title: 'V-authored claim', status: 'in_progress' });
const ref5 = todoTaskRef(t5.id);
storage.submitLedgerEntry(ref5, signEntry({
  kind: 'claim', taskRef: ref5, at: new Date().toISOString(), by: vkp.keyId, role: 'validator',
  payload: { statement: 'V made this itself' },
}, vkp));
const r7 = await runValidator({ storage, todoId: t5.id, fetchImpl: ollamaSays('{"verdict":"confirm","reasoning":"x"}') });
check('V refuses to judge its own claim (collusion)', !r7.ok && /collusion/.test(r7.why), r7.why);

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('VALIDATOR_V_VERIFY: GREEN — a real independent model is wired as V: judgments are signed');
  console.log('and welded, T referees on confirm, and any model failure ABSTAINS (never silent-confirms).');
  process.exit(0);
} else { console.log('VALIDATOR_V_VERIFY: RED'); process.exit(1); }
