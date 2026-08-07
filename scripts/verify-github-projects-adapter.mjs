// verify-github-projects-adapter.mjs — proves the proof-overlay thesis on a foreign tracker:
// GitHub Projects items become CONTINUUM tasks, and a foreign "Done" is DOWNGRADED to a claim
// (UNVERIFIED, never our DONE) until A·V·T·H prove it. Idempotent on re-run. Hermetic (real
// SQLite ledger, synthetic items — no live GitHub needed).
//
//   node scripts/verify-github-projects-adapter.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-ghproj-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage, todoTaskRef } = await import('@number7even/continuum-core');
const { ingestProjectItems, mapProjectItem, isDoneStatus, adapterKey } = await import('@number7even/continuum-adapter-github-projects');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── pure mapping: a foreign "Done" is not trusted ──────────────────────');
check('isDoneStatus recognizes Done/Closed/Merged, not In Progress', isDoneStatus('Done') && isDoneStatus('closed') && isDoneStatus('Merged') && !isDoneStatus('In Progress'));
check('foreign "Done" maps to in_progress — NOT our done', mapProjectItem({ id: 'x', title: 't', status: 'Done' }).status === 'in_progress');
check('foreign "Done" flags claimsDone', mapProjectItem({ id: 'x', title: 't', status: 'Done' }).claimsDone === true);

console.log('── ingest: their tracker + our proof layer ────────────────────────────');
const storage = await openStorage('ghproj');
const key = adapterKey();
const items = [
  { id: 'N1', number: 1, title: 'Backlog item', status: 'Todo' },
  { id: 'N2', number: 2, title: 'Active item', status: 'In Progress' },
  { id: 'N3', number: 3, title: 'GitHub says this shipped', status: 'Done' },
];
const r1 = ingestProjectItems(storage, items, key);
check('3 items ingested (3 new tasks)', r1.upserted === 3 && r1.created === 3, `upserted=${r1.upserted} created=${r1.created}`);
check('exactly 1 foreign "Done" downgraded to a claim', r1.claimsDowngraded === 1, `downgraded=${r1.claimsDowngraded}`);

const doneItem = storage.listTodos().find(t => t.title === 'GitHub says this shipped');
check('the "Done" item is a task, status in_progress (not done)', doneItem?.status === 'in_progress', doneItem?.status);
const verdict = storage.verdictForTask(todoTaskRef(doneItem.id));
check('foreign Done sits at UNVERIFIED (claim only) — never PROVEN/DONE', verdict === 'UNVERIFIED', `verdict=${verdict}`);
const backlog = storage.listTodos().find(t => t.title === 'Backlog item');
check('a non-done item has no claim (null verdict)', storage.verdictForTask(todoTaskRef(backlog.id)) === null);

console.log('── idempotency: re-run maps, never duplicates ─────────────────────────');
const r2 = ingestProjectItems(storage, items, key);
check('re-ingest creates 0 new tasks', r2.created === 0, `created=${r2.created}`);
check('re-ingest adds 0 new claims', r2.claimsDowngraded === 0, `downgraded=${r2.claimsDowngraded}`);
check('still 3 tasks total (no duplicates)', storage.listTodos().length === 3, `count=${storage.listTodos().length}`);

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('GITHUB_PROJECTS_ADAPTER_VERIFY: GREEN — a foreign tracker\'s items become tasks, and its');
  console.log('"Done" is a CLAIM until A·V·T·H prove it. CONTINUUM is the proof overlay, not a replacement.');
  process.exit(0);
} else { console.log('GITHUB_PROJECTS_ADAPTER_VERIFY: RED'); process.exit(1); }
