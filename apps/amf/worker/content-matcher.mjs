/**
 * content-matcher.mjs — the AI filter machine: signals → match-to-pillars → content brief.
 *
 * Closes the input loop. Reads the corpus (world_brief / feed_article observations from
 * adapter-news), scores each against your product PILLARS by RELEVANCE (FTS5 bm25) ×
 * ACTUALITY (recency), picks the top signal, and drafts an on-brand content BRIEF
 * (headline + stats + CTA) GROUNDED in the sourced signal — ready to pipe into
 * produce-post / produce-report. Doubt-Driven Development (P4): stats come from the
 * signal, sources are carried through, and the draft is flagged for verification.
 *
 *   node content-matcher.mjs --project worldmonitor --brand voicecosmos \
 *        --pillars "voice,hospitality,booking,concierge,no-show,revenue,spa,hotel,guest"
 *   → prints a BRIEF json on stdout (feed it: AMF_POST_JSON="$(…)" node produce-post.mjs --brand voicecosmos)
 *
 *   node content-matcher.mjs --smoke      # proves match + draft (mock corpus, no keys)
 *
 * The LLM drafter is GATED on ANTHROPIC_API_KEY (untested without it, P4); a deterministic
 * template draft is the fail-safe so the machine never blocks.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SIGNAL_TYPES = new Set(['world_brief', 'feed_article']);
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'from', 'into', 'its', 'has', 'have', 'will']);
const terms = (t) => [...new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];
const ftsQuery = (list) => list.slice(0, 24).map((t) => `"${t}"`).join(' OR ');

/** recency weight: 1.0 today → ~0.5 at 14 days → small after a month. */
function recencyWeight(iso, nowMs) {
  const ageDays = Math.max(0, (nowMs - new Date(iso).getTime()) / 86400000);
  return 1 / (1 + ageDays / 14);
}

/** Rank pillar-relevant signals by bm25 (relevance) × recency (actuality). */
export function rankSignals(storage, pillarTerms, nowMs, k = 5) {
  const q = ftsQuery(pillarTerms);
  if (!q) return [];
  const hits = storage.searchObservations(q, 40).filter((h) => SIGNAL_TYPES.has(h.type));
  const ranked = hits
    .map((h) => ({ id: h.id, type: h.type, title: h.title, ts: h.timestamp, rel: h.score, score: h.score * recencyWeight(h.timestamp, nowMs) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  const full = storage.getObservations(ranked.map((r) => r.id));
  const byId = new Map(full.map((o) => [o.id, o]));
  return ranked.map((r) => ({ ...r, content: byId.get(r.id)?.content ?? r.title, sources: (byId.get(r.id)?.metadata || {}).sources || [] }));
}

/** Pull up to 3 number-bearing phrases from the signal → stat points (grounded). */
function extractStats(text) {
  const out = [];
  const re = /([€$]?\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?\s*(?:%|percent|euros?|\/\s*\w+|k|bn|m)?)/gi;
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const m = s.match(re);
    if (m) { out.push({ stat: m[0].trim(), label: s.replace(re, '').replace(/\s+/g, ' ').trim().slice(0, 60) }); }
    if (out.length >= 3) break;
  }
  return out;
}

/** Deterministic fallback brief — honest, grounded, no creativity (the no-key path). */
function draftTemplate(signal, brand) {
  const head = (signal.content.split(/(?<=[.!?])\s+/)[0] || signal.title).slice(0, 90);
  const points = extractStats(signal.content);
  return {
    headline: head, points: points.length ? points : [{ stat: '—', label: 'see the brief' }],
    cta: (brand.cta || 'DETAILS').toUpperCase().replace(/\s+/g, '').slice(0, 10),
    angle: `Signal matched to ${brand.name} pillars.`, drafted: 'template',
  };
}

/** LLM drafter (gated on ANTHROPIC_API_KEY; untested without a key, P4). */
async function draftViaLLM(signal, brand, key) {
  const sys = `You draft a SHORT social-post brief that connects a sourced news signal to a brand, in the brand's voice. ` +
    `RULES: use ONLY facts/numbers present in the signal (never invent stats); ground every claim in it; ` +
    `if the brand connection is weak, say so. Return ONLY compact JSON: ` +
    `{"headline": "<=90 chars hook","points":[{"stat":"...","label":"..."}](2-3, stats from the signal),"cta":"<ONE_UPPERCASE_KEYWORD>","angle":"why this matters to the brand"}`;
  const user = `BRAND: ${brand.name} — ${brand.tagline || ''}\nSIGNAL: ${signal.content.slice(0, 1500)}\nSOURCES: ${(signal.sources || []).join(', ')}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 700, system: sys, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const j = await res.json();
  const text = j?.content?.find((c) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in LLM reply');
  return { ...JSON.parse(m[0]), drafted: 'llm' };
}

function loadBrand(name) {
  const def = { name: 'AMF', tagline: 'amf.continuum.rest', cta: 'DETAILS' };
  if (!name) return def;
  try { const b = JSON.parse(readFileSync(resolve(REPO_ROOT, 'apps/amf/worker/brandbooks', `${name}.json`), 'utf8')); return { ...def, ...b }; }
  catch { return { ...def, name }; }
}

async function buildBrief(signal, brand) {
  const key = process.env.ANTHROPIC_API_KEY;
  let draft;
  if (key) { try { draft = await draftViaLLM(signal, brand, key); } catch (e) { console.error(`[matcher] LLM failed (${e.message}) → template`); draft = draftTemplate(signal, brand); } }
  else { console.error('[matcher] ANTHROPIC_API_KEY not set → deterministic template draft (P6)'); draft = draftTemplate(signal, brand); }
  return { brand: brand.name, ...draft, sources: signal.sources || [], fromSignal: signal.id, relevance: +signal.score.toFixed(3), verify: 'AI-drafted from a sourced signal — verify stats against the source + run continuum_check_brand before publish' };
}

async function run() {
  const a = process.argv;
  const get = (flag, def) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : def; };
  const project = get('--project', 'worldmonitor');
  const brand = loadBrand(get('--brand', process.env.AMF_BRAND));
  const pillars = (get('--pillars', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pillars.length) { console.error('--pillars "term1,term2,…" required (your product ontology)'); process.exit(2); }
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(project);
  const ranked = rankSignals(storage, pillars, Date.now(), 1);
  if (!ranked.length) { console.error('[matcher] no pillar-relevant signals in corpus — run adapter-news first'); storage.close(); process.exit(1); }
  const brief = await buildBrief(ranked[0], brand);
  storage.close();
  console.log(JSON.stringify(brief, null, 2)); // stdout = the brief, pipe into produce-post
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'matcher-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const s = openStorage('matcher-test');
  s.upsertSource('worldmonitor', 'docs', {});
  const now = Date.now();
  const mk = (id, type, content, ageDays, sources) => ({ id, sourceId: 'worldmonitor', type, content, timestamp: new Date(now - ageDays * 86400000).toISOString(), refs: [], metadata: { sources } });
  // a fresh, on-pillar hospitality signal vs an old + an off-pillar one
  s.upsertObservation(mk('11111111-1111-1111-1111-111111111111', 'feed_article', 'Hospitality AI concierge adoption: boutique hotels recover 24 after-hours bookings a week, worth €2,400, by answering the 8pm call no human picks up.', 1, ['https://ex/feed/1']));
  s.upsertObservation(mk('22222222-2222-2222-2222-222222222222', 'world_brief', 'Energy: a Strait of Hormuz chokepoint disruption lifts Brent crude 4%.', 1, ['https://ex/wm/2']));
  s.upsertObservation(mk('33333333-3333-3333-3333-333333333333', 'feed_article', 'Hotel booking no-shows cost 12-15% of revenue, an old report notes.', 40, ['https://ex/feed/3']));

  const pillars = ['voice', 'hospitality', 'booking', 'concierge', 'hotel', 'guest', 'revenue', 'no-show'];
  const ranked = rankSignals(s, pillars, now, 3);
  const top = ranked[0];
  const brief = await buildBrief(top, loadBrand('voicecosmos'));
  const okMatch = top && top.id.startsWith('11111111'); // fresh on-pillar wins over old + off-pillar
  const okBrief = !!brief.headline && Array.isArray(brief.points) && brief.sources.length > 0 && !!brief.verify;
  console.error(`\ncontent-matcher smoke`);
  console.error(`  ranked ${ranked.length} signals · top=${top?.id?.slice(0, 8)} (fresh hospitality) score=${top?.score?.toFixed(3)}`);
  console.error(`  brief: "${brief.headline?.slice(0, 50)}…" · ${brief.points.length} stats · cta=${brief.cta} · drafted=${brief.drafted}`);
  console.error(`  ${okMatch && okBrief ? '✅ PASS' : '❌ FAIL'} — match (relevance×recency) + grounded brief; LLM gated on ANTHROPIC_API_KEY (template fallback proven)\n`);
  s.close();
  const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(okMatch && okBrief ? 0 : 1);
}

if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else run().catch((e) => { console.error(e.message); process.exit(1); });
