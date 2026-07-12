// BALL_VERIFY — the De-Duplication Stress Test + full auto-intake lifecycle.
//
// The BALL cannot cross to DONE on prose. This forces the failure and mechanically proves
// the loop self-corrects:
//   1. FORCE FAILURE — the SAME failing command 5×, plus one partner-blocker event.
//   2. DEDUP        — 5 recurrences → exactly ONE engineering ticket (×5), not 5. (the spam cure)
//   3. ROUTE        — the partner event → a separate 'blocked', ungated ticket.
//   4. IDEMPOTENT   — re-running intake creates nothing new.
//   5. GATE HOLDS   — while the command still fails, auto-dissolve resolves NOTHING.
//   6. AUTO-DISSOLVE— simulate the fix (verifyCommand exits 0) → the engineering ticket
//                     resolves itself; the partner-blocker stays blocked (can't auto-fix).
//
//   node scripts/verify-ball.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage, runIntake, runAutoDissolve } from '@number7even/continuum-core';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'ball-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const s = openStorage('ball-verify');
s.upsertSource('terminal:p', 'export', {});

// 1 — FORCE FAILURE: the same command failing 5 times (5 distinct events, one issue).
const events = [];
for (let i = 0; i < 5; i++) {
  const o = s.insertObservation({
    sourceId: 'terminal:p', type: 'command', content: `$ npm test → exit 1 (run ${i})`,
    timestamp: new Date(Date.now() + i).toISOString(), refs: [], metadata: { status: 'fail', exitCode: 1, cmd: 'npm test' },
  });
  events.push({ id: o.id, kind: 'command-failure', cmd: 'npm test', exitCode: 1 });
}
// + a partner-blocker event (XENOS) — different domain.
events.push({ id: 'evt-xenos-1', kind: 'partner-blocker', label: 'XENOS lead route' });

// 2/3 — INTAKE: dedup + route.
const r1 = runIntake(s, events);
const t1 = s.listTodos();
const eng = t1.filter((t) => t.title.includes(':engineering'));
const partner = t1.filter((t) => t.title.includes(':partner-blocker'));

const dedup = eng.length === 1 && eng[0].refs.length === 5 && /×5/.test(eng[0].title) && r1.deduped === 4;
const engGated = eng[0]?.verifyCommand === 'npm test' && eng[0]?.status === 'open';
const routed = partner.length === 1 && !partner[0].verifyCommand && partner[0].status === 'blocked';

// 4 — IDEMPOTENT: same events again → nothing new.
const r2 = runIntake(s, events);
const idempotent = r2.created.length === 0 && s.listTodos().filter((t) => t.title.startsWith('[auto]')).length === 2;

// 5 — GATE HOLDS: while the command still fails, auto-dissolve resolves nothing.
const stillFailing = runAutoDissolve(s, () => 1);
const gateHolds = stillFailing.dissolved.length === 0 && s.listTodos().find((t) => t.title.includes(':engineering'))?.status === 'open';

// 6 — AUTO-DISSOLVE: simulate the fix — npm test now exits 0.
const fixed = runAutoDissolve(s, (cmd) => (cmd === 'npm test' ? 0 : 1));
const engDone = s.listTodos().find((t) => t.title.includes(':engineering'))?.status === 'done';
const partnerStays = s.listTodos().find((t) => t.title.includes(':partner-blocker'))?.status === 'blocked';
const autoDissolve = fixed.dissolved.length === 1 && engDone && partnerStays;

console.log(`intake: created=${r1.created.length} deduped=${r1.deduped} · tickets: eng=${eng.length}(refs ${eng[0]?.refs.length}) partner=${partner.length}`);
console.log(`checks: dedup=${dedup} engGated=${engGated} routed=${routed} idempotent=${idempotent} gateHolds=${gateHolds} autoDissolve=${autoDissolve}`);
const green = dedup && engGated && routed && idempotent && gateHolds && autoDissolve;
console.log(green
  ? 'BALL_VERIFY: GREEN — force→dedup(5→1)→park→gate-holds→fix→auto-dissolve, all mechanical'
  : 'BALL_VERIFY: RED');
process.exit(green ? 0 : 1);
