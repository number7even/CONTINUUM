#!/usr/bin/env node
// verify-teleprompter.mjs — proof-gate for the Recording Assistant (Layer-4 human-core).
//
//   1. the H-P-I-P-A skeleton is THE LAW: 5 segments, exact windows (0-3/3-15/15-40/40-70/70-90),
//      total exactly 90s, contiguous (no gaps/overlaps)
//   2. buildSession casts a calendar day into the skeleton: the hook lands VERBATIM in H;
//      topic/angle feed P & I; the Proof card carries the P4 never-invent-a-number rule
//   3. a day without hook/topic is refused (no empty prompter)
//   4. the served page mounts: enforces the skeleton (segment bar + windows), shows the hook,
//      carries the shot checklist, exposes /api/session
//   5. the calendar loader finds the latest generated calendar
//
//   node verify-teleprompter.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { HPIPA, buildSession, latestCalendar, html, makeServer } from './teleprompter.mjs';

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── the skeleton is the law ─────────────────────────────────────────────');
check('5 segments H-P-I-P-A', HPIPA.map(s => s.key).join('') === 'HPIPA');
check('exact windows 0-3/3-15/15-40/40-70/70-90', JSON.stringify(HPIPA.map(s => [s.start, s.end])) === JSON.stringify([[0, 3], [3, 15], [15, 40], [40, 70], [70, 90]]));
check('contiguous, total exactly 90s', HPIPA.every((s, i) => i === 0 || s.start === HPIPA[i - 1].end) && HPIPA[4].end === 90);

console.log('── buildSession casts the day into the skeleton ────────────────────────');
const day = { day: 3, date: '2026-07-18', theme: 'Workflow inefficiency', format: 'teardown', topic: 'booking recovery', hook: 'Most teams are still doing this manually.', company_angle: 'Workflow automation value' };
const s = buildSession({ brand: 'voicecosmos', angle: 'AI concierge (ARIAN) recovers the revenue hotels/spas quietly lose — no-shows...', day });
check('hook lands VERBATIM in H', s.segments[0].card === day.hook);
check('topic feeds Problem + Insight', s.segments[1].card.includes('booking recovery') && s.segments[2].card.includes('booking recovery'));
check('Proof card carries the P4 rule (never invent a number)', /real number|true story/i.test(s.segments[3].card) || /never invent/i.test(s.segments[3].cue));
check('session totals 90s with a 5-point shot checklist', s.totalSeconds === 90 && s.checklist.length === 5);
let refused = false; try { buildSession({ brand: 'x', angle: 'a', day: { day: 1 } }); } catch { refused = true; }
check('a day without hook/topic is refused', refused);

console.log('── the prompter mounts + serves ────────────────────────────────────────');
const page = html(s);
check('page enforces the skeleton (windows in the controls + segs JSON)', page.includes('H 0–3 · P 3–15 · I 15–40 · P 40–70 · A 70–90') && page.includes('"start":40'));
check('page shows the verbatim hook + checklist + mirror mode', page.includes(day.hook) && page.includes('Mic check') && page.includes('M mirror'));
const srv = makeServer(s);
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const root = await (await fetch(`http://127.0.0.1:${port}/`)).text();
const api = await (await fetch(`http://127.0.0.1:${port}/api/session`)).json();
srv.close();
check('server serves the prompter page', root.includes('W&T PROMPTER'));
check('/api/session returns the structured session', api.segments?.length === 5 && api.topic === 'booking recovery');

console.log('── calendar loader ─────────────────────────────────────────────────────');
const cal = latestCalendar('voicecosmos', 'company');
check('finds the latest generated voicecosmos calendar', !!cal && cal.days?.length === 30, cal ? `start ${cal.start}` : 'none');

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('TELEPROMPTER_VERIFY: GREEN — the Recording Assistant enforces the 90s H-P-I-P-A skeleton,');
  console.log('casts real calendar days into cue cards (hook verbatim, P4 proof rule), and serves locally.');
  process.exit(0);
} else { console.log('TELEPROMPTER_VERIFY: RED'); process.exit(1); }
