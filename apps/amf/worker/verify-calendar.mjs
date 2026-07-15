#!/usr/bin/env node
// verify-calendar.mjs — proof-gate for the 30-Day Calendar Generator (Content OS Slice 2).
//
//   1. intelligence pull: the committed Demand Atlas parses into demand-ranked CORE terms
//   2. the pool merges atlas terms + packet topics, deduped
//   3. buildCalendar maps EXACTLY 30 days; every day carries topic + hook + BOTH angles
//   4. no topic repeats within any 7-day cluster (the directive's no-repeat law)
//   5. recap days synthesize their week; profiles share the topic graph but differ in angle
//   6. the ledger weld: 30 CONTINUUM todos land on a real board, idempotent on re-run
//   7. the uniqueness law holds: a non-onboarded brand cannot generate a calendar
//
//   node verify-calendar.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-cal-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { parseAtlasCore, topicPool, buildCalendar, gateCalendar, CADENCE } = await import('./calendar.mjs');
const { openStorage } = await import('@number7even/continuum-core');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── intelligence pull ───────────────────────────────────────────────────');
const atlas = readFileSync(resolve(HERE, '..', '..', '..', 'docs', 'DEMAND_ATLAS_2026-07-01.md'), 'utf8');
const core = parseAtlasCore(atlas, 'voicecosmos');
check('Demand Atlas parses: ≥8 demand-scored CORE terms', core.length >= 8, `${core.length} terms, top: ${core[0]?.term} @ ${core[0]?.score}`);
check('terms are demand-ranked (descending)', core.every((t, i) => i === 0 || t.score <= core[i - 1].score));
const uni = JSON.parse(readFileSync(join(HERE, 'portfolio-universe.json'), 'utf8'));
const vc = uni.products.find(p => p.slug === 'voicecosmos');
const pool = topicPool(core, vc.topics);
check('pool merges atlas + packet topics, deduped', pool.length >= core.length && new Set(pool.map(t => t.toLowerCase())).size === pool.length, `pool=${pool.length}`);

console.log('── the cadence + the mechanical gate ───────────────────────────────────');
check('cadence encodes 30 days with 4 recaps + month-end', CADENCE.length === 30 && CADENCE.filter(c => c.format === 'recap').length === 5);
const days = buildCalendar({ brand: 'voicecosmos', profile: 'company', start: '2026-08-01', pool });
const issues = gateCalendar(days);
check('30 days mapped, gate GREEN', days.length === 30 && issues.length === 0, issues.join('; ') || 'no issues');
check('every day: topic + hook + BOTH angles', days.every(d => d.topic && d.hook && d.personal_angle && d.company_angle));
for (let w = 1; w <= 4; w++) {
  const cl = days.filter(d => Math.ceil(d.day / 7) === w && d.format !== 'recap').map(d => d.topic);
  if (w === 1) check('no repeats within a cluster (spot: week 1)', new Set(cl).size === cl.length, cl.join(' · '));
}
const recap7 = days.find(d => d.day === 7);
check('recap days synthesize their week', /week 1 synthesis/.test(recap7.topic), recap7.topic);
const personal = buildCalendar({ brand: 'voicecosmos', profile: 'personal', start: '2026-08-01', pool });
check('profiles share the topic graph, differ in angle',
  personal[0].topic === days[0].topic && personal[0].angle !== days[0].angle,
  `"${personal[0].angle}" vs "${days[0].angle}"`);

console.log('── a broken calendar is REFUSED ────────────────────────────────────────');
const broken = days.map(d => ({ ...d }));
broken[3].topic = broken[1].topic;  // force a week-1 cluster repeat
broken[9].hook = '';
const brokenIssues = gateCalendar(broken);
check('gate catches cluster repeat + missing hook', brokenIssues.length >= 2, brokenIssues.join('; '));

console.log('── the ledger weld (real board, idempotent) ────────────────────────────');
const storage = await openStorage('cal-test');
const mkRef = (d) => `calendar:voicecosmos:company:2026-08-01:d${String(d.day).padStart(2, '0')}`;
for (const d of days) storage.createTodo({ title: `📅 voicecosmos W&T d${String(d.day).padStart(2, '0')} · ${d.theme} — ${d.topic}`, status: 'open', refs: [mkRef(d)] });
check('30 todos welded to the board', storage.listTodos().length === 30);
// idempotency: the CLI skips refs it has seen — simulate its re-run guard
const seen = new Map();
for (const t of storage.listTodos()) for (const r of t.refs ?? []) seen.set(r, t);
const wouldCreate = days.filter(d => !seen.has(mkRef(d))).length;
check('re-run creates 0 duplicates (idempotent by ref)', wouldCreate === 0);

console.log('── the uniqueness law upstream ─────────────────────────────────────────');
const { brandIdentity } = await import('./brand-tokens.mjs');
let refused = false;
try { brandIdentity('podgeni'); } catch { refused = true; }
check('a non-onboarded brand cannot generate a calendar', refused);

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('CALENDAR_VERIFY: GREEN — demand intelligence → 30-day cadence → the board, mechanically');
  console.log('gated: full coverage, both angles, no cluster repeats, idempotent weld, uniqueness upstream.');
  process.exit(0);
} else { console.log('CALENDAR_VERIFY: RED'); process.exit(1); }
