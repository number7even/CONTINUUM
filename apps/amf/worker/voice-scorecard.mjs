#!/usr/bin/env node
/**
 * voice-scorecard.mjs — the Brand-Voice Scorecard (Content OS, Slice 3).
 *
 * The semantic half of the Brand Kernel: continuum_check_brand retrieves WHAT to judge
 * against (promises/positions, a retrieval gate by design — P4); this module makes the
 * judgment, using V — the independent local llama3.2 linesman (zero-egress) — as the
 * scorer, so brand drift is caught by the same skeptic that guards the Truth Ledger.
 *
 * Rubric (1–5 per dimension, per item):
 *   voice_fidelity  — does it sound like the same person/brand wrote it?
 *   platform_fit    — does it match the channel's native style?
 *   clarity         — is the idea easy to grasp quickly?
 *   trust           — does it feel credible and specific?
 *   actionability   — does it move the audience to the next step?
 *
 * Compares MANUAL vs AUTOMATED corpora per channel (linkedin / youtube / x), computes the
 * gap-to-watch (the automated corpus's weakest dimension per channel), and tracks DRIFT
 * over time by appending every run to a history ledger. Fail-safe (P4): an unparseable or
 * unreachable model ABSTAINS on that item — never a silently invented score.
 *
 *   node voice-scorecard.mjs --brand voicecosmos --in items.jsonl [--out out/] [--dry]
 *   items.jsonl: {"id":"...","channel":"linkedin|youtube|x","source":"manual|automated","text":"..."}
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import './env.mjs';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandIdentity } from './brand-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OLLAMA_URL = process.env.CONTINUUM_VALIDATOR_URL || 'http://localhost:11434/api/generate';
const MODEL = process.env.CONTINUUM_VALIDATOR_MODEL || 'llama3.2';

export const DIMENSIONS = ['voice_fidelity', 'platform_fit', 'clarity', 'trust', 'actionability'];
const CHANNELS = ['linkedin', 'youtube', 'x'];

/** Assemble the brand's voice kernel from the define-once registry (uniqueness law upstream). */
export function voiceKernel(slug, universePath = join(HERE, 'portfolio-universe.json')) {
  const { angle, identity } = brandIdentity(slug, universePath);       // refuses non-onboarded
  const j = JSON.parse(readFileSync(universePath, 'utf8'));
  const p = slug === 'personal' ? j.personal : j.products.find(x => x.slug === slug);
  return [
    `BRAND: ${slug}`,
    `POSITIONING: ${angle}`,
    p.topics?.length ? `TOPICS: ${p.topics.join(', ')}` : '',
    p.sales_signals?.length ? `SALES SIGNALS: ${p.sales_signals.join(', ')}` : '',
    identity.style ? `TONE/STYLE: ${identity.style}` : '',
  ].filter(Boolean).join('\n');
}

/** The scorer brief — structured verdict demanded up front (deterministic parsing). */
export function buildScorePrompt(kernel, item) {
  return [
    'You are an independent BRAND-VOICE JUDGE in a content quality system. You do not',
    'flatter. Score the CONTENT below against the BRAND VOICE KERNEL, for its CHANNEL.',
    '',
    kernel,
    '',
    `CHANNEL: ${item.channel}`,
    `CONTENT:\n${String(item.text).slice(0, 4000)}`,
    '',
    'Score each dimension 1 (poor) to 5 (excellent):',
    'voice_fidelity — sounds like the same brand/person wrote it;',
    'platform_fit — native to the channel (linkedin: nuanced authority · youtube: natural narrative hooks · x: concise, contrarian punch);',
    'clarity — the idea lands fast; trust — credible and specific, no hype; actionability — moves the reader to a next step.',
    '',
    'Reply with EXACTLY one line of JSON and nothing else:',
    '{"voice_fidelity":N,"platform_fit":N,"clarity":N,"trust":N,"actionability":N,"note":"<one sentence>"}',
  ].join('\n');
}

/** Parse the model's reply → {scores, note} or null (abstain). All 5 dims, each 1..5. */
export function parseScores(text) {
  const m = String(text ?? '').match(/\{[^{}]*"voice_fidelity"[^{}]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const scores = {};
    for (const d of DIMENSIONS) {
      const v = Number(j[d]);
      if (!Number.isFinite(v) || v < 1 || v > 5) return null;
      scores[d] = v;
    }
    return { scores, note: String(j.note ?? '').slice(0, 300) };
  } catch { return null; }
}

/** Score one item via the independent model. Abstains (null) on any failure — P4. */
export async function scoreItem(kernel, item, { fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetchImpl(OLLAMA_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: buildScorePrompt(kernel, item), stream: false, options: { temperature: 0 } }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    return parseScores((await r.json()).response);
  } catch { return null; }
}

/** Aggregate scored items → the scorecard: per channel × source means, overall, the gap,
 *  and each channel's gap-to-watch (the automated corpus's weakest dimension). Pure. */
export function aggregate(scored) {
  const mean = (xs) => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null;
  const cell = (items) => {
    if (!items.length) return null;
    const dims = {};
    for (const d of DIMENSIONS) dims[d] = mean(items.map(i => i.scores[d]));
    return { n: items.length, dims, overall: mean(items.map(i => mean(DIMENSIONS.map(d => i.scores[d])))) };
  };
  const channels = {};
  for (const ch of CHANNELS) {
    const manual = cell(scored.filter(i => i.channel === ch && i.source === 'manual'));
    const automated = cell(scored.filter(i => i.channel === ch && i.source === 'automated'));
    let gap = null, gapToWatch = null;
    if (manual && automated) {
      gap = +(manual.overall - automated.overall).toFixed(2);
      gapToWatch = DIMENSIONS.map(d => [d, automated.dims[d]]).sort((a, b) => a[1] - b[1])[0][0];
    }
    channels[ch] = { manual, automated, gap, gapToWatch };
  }
  return { channels, scoredCount: scored.length };
}

/** Append this run to the brand's history ledger and compute drift vs the previous run. */
export function trackDrift(historyPath, run) {
  let prev = null;
  if (existsSync(historyPath)) {
    const lines = readFileSync(historyPath, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) prev = JSON.parse(lines[lines.length - 1]);
  }
  appendFileSync(historyPath, JSON.stringify(run) + '\n');
  if (!prev) return { baseline: true, drift: null };
  const drift = {};
  for (const ch of CHANNELS) {
    const a = run.card.channels[ch]?.automated?.overall, b = prev.card.channels[ch]?.automated?.overall;
    drift[ch] = (a != null && b != null) ? +(a - b).toFixed(2) : null;
  }
  return { baseline: false, drift };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
  const brand = arg('--brand', null);
  const inPath = arg('--in', null);
  const outDir = arg('--out', join(HERE, 'out'));
  if (!brand || !inPath || !existsSync(inPath)) {
    console.error('usage: node voice-scorecard.mjs --brand <slug|personal> --in items.jsonl [--out <dir>]');
    process.exit(2);
  }
  const kernel = voiceKernel(brand);                                   // uniqueness law
  const items = readFileSync(inPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  console.log(`[scorecard] ${brand} · ${items.length} item(s) · judge: ${MODEL} (local, zero-egress)`);

  const scored = [], abstained = [];
  for (const item of items) {
    const res = await scoreItem(kernel, item);
    if (res) scored.push({ ...item, ...res });
    else abstained.push(item.id);
  }
  if (abstained.length) console.log(`[scorecard] ABSTAINED on ${abstained.length} item(s) (model unreachable/unparseable — no invented scores, P4): ${abstained.join(', ')}`);
  if (!scored.length) { console.error('[scorecard] nothing scored — is Ollama up?'); process.exit(1); }

  const card = aggregate(scored);
  mkdirSync(outDir, { recursive: true });
  const run = { at: new Date().toISOString(), brand, model: MODEL, card, abstained };
  const { baseline, drift } = trackDrift(join(outDir, `voice-scorecard-${brand}.history.jsonl`), run);
  writeFileSync(join(outDir, `voice-scorecard-${brand}.json`), JSON.stringify(run, null, 2));

  for (const ch of CHANNELS) {
    const c = card.channels[ch];
    if (!c.manual && !c.automated) continue;
    console.log(`  ${ch}: manual ${c.manual?.overall ?? '—'} · automated ${c.automated?.overall ?? '—'}` +
      (c.gap != null ? ` · gap ${c.gap > 0 ? '+' : ''}${c.gap} · watch: ${c.gapToWatch}` : ''));
  }
  console.log(baseline ? '[scorecard] baseline run recorded (drift starts next run)' : `[scorecard] drift vs last run: ${JSON.stringify(drift)}`);
  console.log(`[scorecard] → ${join(outDir, `voice-scorecard-${brand}.json`)}`);
}
