#!/usr/bin/env node
// verify-voice-scorecard.mjs — proof-gate for the Brand-Voice Scorecard (Content OS Slice 3).
// Deterministic: the judge is an injected mock; every path is asserted.
//
//   1. the voice kernel assembles from the define-once registry (uniqueness law upstream)
//   2. the prompt carries kernel + channel + content; parseScores accepts a valid verdict
//   3. out-of-range / junk verdicts → null (abstain — no invented scores, P4)
//   4. aggregate: per-channel manual/automated means, the gap, and the weakest-dimension
//      "gap to watch" — verified against hand-computed values
//   5. drift: first run = baseline; second run computes signed per-channel drift
//   6. scoreItem abstains on model-down / HTTP error
//
//   node verify-voice-scorecard.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { voiceKernel, buildScorePrompt, parseScores, scoreItem, aggregate, trackDrift, DIMENSIONS } from './voice-scorecard.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'amf-scorecard-'));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── kernel + prompt + parsing ───────────────────────────────────────────');
const kernel = voiceKernel('voicecosmos');
check('kernel assembles from the registry', /voicecosmos/.test(kernel) && /POSITIONING/.test(kernel));
let refused = false; try { voiceKernel('podgeni'); } catch { refused = true; }
check('non-onboarded brand refused (uniqueness law)', refused);
const prompt = buildScorePrompt(kernel, { channel: 'x', text: 'ARIAN answers the 8pm call.' });
check('prompt carries kernel + channel + content', /CHANNEL: x/.test(prompt) && /8pm call/.test(prompt));
const good = parseScores('sure! {"voice_fidelity":4,"platform_fit":5,"clarity":4,"trust":3,"actionability":2,"note":"punchy"} done');
check('valid verdict parses (5 dims, note)', !!good && good.scores.platform_fit === 5 && good.note === 'punchy');
check('out-of-range score → abstain', parseScores('{"voice_fidelity":9,"platform_fit":5,"clarity":4,"trust":3,"actionability":2}') === null);
check('junk → abstain', parseScores('LGTM 10/10') === null);

console.log('── scoreItem fail-safety (P4) ──────────────────────────────────────────');
const down = await scoreItem(kernel, { channel: 'x', text: 't' }, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
check('model down → abstain (null)', down === null);
const http500 = await scoreItem(kernel, { channel: 'x', text: 't' }, { fetchImpl: async () => ({ ok: false, status: 500 }) });
check('HTTP 500 → abstain', http500 === null);
const ok = await scoreItem(kernel, { channel: 'x', text: 't' }, { fetchImpl: async () => ({ ok: true, json: async () => ({ response: '{"voice_fidelity":5,"platform_fit":4,"clarity":5,"trust":4,"actionability":3,"note":"n"}' }) }) });
check('healthy model → scores', !!ok && ok.scores.voice_fidelity === 5);

console.log('── aggregate: means, gap, gap-to-watch (hand-computed) ─────────────────');
const S = (vf, pf, cl, tr, ac) => ({ voice_fidelity: vf, platform_fit: pf, clarity: cl, trust: tr, actionability: ac });
const scored = [
  { id: 'm1', channel: 'linkedin', source: 'manual',    scores: S(5, 5, 4, 5, 4), note: '' },   // overall 4.6
  { id: 'm2', channel: 'linkedin', source: 'manual',    scores: S(5, 4, 4, 5, 4), note: '' },   // overall 4.4  → manual 4.5
  { id: 'a1', channel: 'linkedin', source: 'automated', scores: S(4, 4, 4, 3, 2), note: '' },   // overall 3.4
  { id: 'a2', channel: 'linkedin', source: 'automated', scores: S(4, 4, 4, 3, 3), note: '' },   // overall 3.6  → automated 3.5; ac mean 2.5 = unique weakest
  { id: 'x1', channel: 'x',        source: 'manual',    scores: S(5, 5, 5, 4, 4), note: '' },
];
const card = aggregate(scored);
const li = card.channels.linkedin;
check('per-channel means (manual 4.5 / automated 3.5)', li.manual.overall === 4.5 && li.automated.overall === 3.5, `${li.manual.overall}/${li.automated.overall}`);
check('gap = manual − automated (1.0)', li.gap === 1, String(li.gap));
check('gap-to-watch = automated\'s weakest dimension (actionability 2.5)', li.gapToWatch === 'actionability', li.gapToWatch);
check('channel with only manual: no gap invented', card.channels.x.gap === null && card.channels.x.manual.n === 1);
check('all 5 rubric dimensions present', DIMENSIONS.every(d => li.automated.dims[d] != null));

console.log('── drift tracking ──────────────────────────────────────────────────────');
const hist = join(TMP, 'history.jsonl');
const run1 = { at: '2026-07-15T00:00:00Z', brand: 'voicecosmos', card };
const d1 = trackDrift(hist, run1);
check('first run = baseline (no drift)', d1.baseline === true && d1.drift === null);
const improved = aggregate(scored.map(i => i.source === 'automated' ? { ...i, scores: S(5, 5, 5, 4, 4) } : i)); // automated → 4.6
const d2 = trackDrift(hist, { at: '2026-07-16T00:00:00Z', brand: 'voicecosmos', card: improved });
check('second run computes signed drift (+1.1 on linkedin)', d2.baseline === false && d2.drift.linkedin === 1.1, JSON.stringify(d2.drift));

rmSync(TMP, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('VOICE_SCORECARD_VERIFY: GREEN — the independent judge scores the 5-dim rubric per channel,');
  console.log('manual-vs-automated gaps + gap-to-watch are computed honestly, drift tracks across runs,');
  console.log('and every failure path ABSTAINS (no invented scores).');
  process.exit(0);
} else { console.log('VOICE_SCORECARD_VERIFY: RED'); process.exit(1); }
