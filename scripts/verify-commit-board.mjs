// verify-commit-board.mjs — proves the commit-linked sprint board: tasks carry their commit
// evidence, and the board aligns commits ↔ tasks ↔ sprints (linking claimed commits, flagging
// unclaimed ones). Hermetic — pure model + a real SQLite ledger, no server spawn.
//
//   node scripts/verify-commit-board.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-commitboard-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage, generateIdentity, signEntry, todoTaskRef } = await import('@number7even/continuum-core');
const { assembleBoard, tagFrom } = await import('../apps/console/lib/board-model.mjs');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── sprint detection (shared with the Timeline) ────────────────────────');
check('W-tag parsed from a commit subject', tagFrom('feat(amf): W27-3 ship board') === 'W27');
check('untagged subject → null (ISO-week fallback)', tagFrom('fix: a typo') === null);

console.log('── ledger evidence: a claim carries its commit hashes ─────────────────');
const storage = await openStorage('commitboard');
const A = generateIdentity('executor', 'A'), V = generateIdentity('validator', 'V'), H = generateIdentity('human', 'H');
for (const k of [A, V, H]) storage.registerIdentity({ keyId: k.keyId, role: k.role, publicKey: k.publicKey });
const todo = storage.createTodo({ title: 'W27 harden auth', status: 'in_progress' });
const ref = todoTaskRef(todo.id);
const SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const mk = (kind, kp, p) => signEntry({ kind, taskRef: ref, at: new Date().toISOString(), by: kp.keyId, role: kp.role, payload: p }, kp);
storage.submitLedgerEntry(ref, mk('claim', A, { statement: 'done', verifyCommand: 'npm test', commitShas: [SHA] }));
storage.submitLedgerEntry(ref, mk('validation', V, { verdict: 'confirm', reasoning: 'ok' }));
storage.submitTest(ref, { verifyCommand: 'npm test', exitCode: 0, outputHash: 'h' });
const latest = storage.getTruthThread(ref).at(-1);
const claim = latest.entries.find(e => e.kind === 'claim').payload;
check('claim carries commitShas (get_todos surfaces this on the card)', claim.commitShas?.[0] === SHA);
check('claim carries the verifyCommand T ran', claim.verifyCommand === 'npm test');
check('verdict is PENDING_HUMAN (A+V+T green, awaiting H)', latest.verdict === 'PENDING_HUMAN');

console.log('── assembleBoard: align commits ↔ tasks ↔ sprints ─────────────────────');
const card = { id: todo.id, title: todo.title, column: 'REVIEW', ledgerVerdict: 'PENDING_HUMAN', createdAt: '2026-07-02T10:00:00Z', commitShas: [SHA] };
const commits = [
  { id: SHA, title: 'feat: W27 harden auth', ts: '2026-07-02T09:00:00Z' },                              // claimed by the task
  { id: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', title: 'chore: W27 tidy imports', ts: '2026-07-03T09:00:00Z' }, // orphan
];
const { sprints } = assembleBoard({ todos: [card], commits });
const w27 = sprints.find(s => s.label === 'W27');
check('sprint W27 lane assembled from commits', !!w27, w27 && `${w27.cards.length} task · ${w27.commitCount} commits`);
check('task grouped into its sprint by createdAt', !!w27 && w27.cards.some(c => c.id === todo.id));
check('the claimed commit is LINKED (not orphan)', !!w27 && w27.linkedCount === 1);
check('the unclaimed commit is flagged ORPHAN', !!w27 && w27.orphanCount === 1 && w27.orphans[0].sha === 'deadbeef');

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('COMMIT_BOARD_VERIFY: GREEN — tasks carry their commit evidence; the board groups');
  console.log('commits ↔ tasks by sprint, links claimed commits, and flags unclaimed work.');
  process.exit(0);
} else { console.log('COMMIT_BOARD_VERIFY: RED'); process.exit(1); }
