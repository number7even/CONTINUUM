/**
 * content-matcher.mjs — the AI filter machine: signals → match-to-pillars → content brief.
 *
 * Closes the input loop. Reads the corpus (world_brief / feed_article / rss observations),
 * scores each against a product's PORTFOLIO-UNIVERSE targeting, and drafts an on-brand,
 * GROUNDED content brief ready for produce-post / produce-report / produce-short.
 *
 * Ranking = RELEVANCE (FTS5 bm25 vs the product's topics+keywords)
 *          × ACTUALITY (recency)
 *          × AUTHORITY (source feed tier from the universe)
 *          × SALES-SIGNAL (does it hit a buying-intent signal?)
 *          × ENGAGEMENT (metadata.engagement, e.g. HN points, when present)
 *
 *   node content-matcher.mjs --project rss-demo --brand voicecosmos
 *   node content-matcher.mjs --smoke
 *
 * Doubt-Driven (P4): stats from the signal only, sources carried, every brief flagged
 * for verification. LLM drafter gated on ANTHROPIC_API_KEY; grounded template fallback.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const SIGNAL_TYPES = new Set(['world_brief', 'feed_article', 'rss']);
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'from', 'into', 'its', 'has', 'have', 'will', 'not']);
const terms = (t) => [...new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];
const ftsQuery = (list) => list.slice(0, 30).map((t) => `"${t}"`).join(' OR ');

// ── the Portfolio Universe (targeting per product) ───────────────────────────
function loadUniverse() { try { return JSON.parse(readFileSync(resolve(HERE, 'portfolio-universe.json'), 'utf8')); } catch { return { products: [] }; }
}
function getProduct(slug) { return (loadUniverse().products || []).find((p) => p.slug === slug) || null; }
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// ── the five weights ─────────────────────────────────────────────────────────
function recencyWeight(iso, nowMs) { const d = Math.max(0, (nowMs - new Date(iso).getTime()) / 86400000); return 1 / (1 + d / 14); }
const TIER_W = { 1: 1.6, 2: 1.3, 3: 1.1 };
function authorityWeight(sources, domTier) {
  let best = 1.0;
  for (const s of sources || []) { const t = domTier[domainOf(s)]; if (t && TIER_W[t] > best) best = TIER_W[t]; }
  return best;
}
function salesWeight(content, salesTerms) {
  const lc = content.toLowerCase();
  const hit = salesTerms.filter((s) => s && lc.includes(s)).length;
  return 1 + Math.min(hit, 2) * 0.25; // up to +50% for buying-intent signals
}
function engagementWeight(meta) { const e = Number((meta || {}).engagement || 0); return e > 0 ? 1 + Math.min(e / 200, 0.5) : 1; }

/** Rank pillar-relevant signals by relevance × recency × authority × sales × engagement. */
export function rankSignals(storage, pillarTerms, product, nowMs, k = 5) {
  const q = ftsQuery(pillarTerms);
  if (!q) return [];
  const hits = storage.searchObservations(q, 60).filter((h) => SIGNAL_TYPES.has(h.type));
  if (!hits.length) return [];
  const full = storage.getObservations(hits.map((h) => h.id));
  const byId = new Map(full.map((o) => [o.id, o]));
  const domTier = {}; for (const f of (product?.feeds || [])) domTier[domainOf(f.url)] = f.tier;
  const salesTerms = (product?.sales_signals || []).map((s) => s.toLowerCase());
  return hits.map((h) => {
    const o = byId.get(h.id); const meta = o?.metadata || {}; const content = o?.content || h.title; const sources = meta.sources || [];
    const rec = recencyWeight(h.timestamp, nowMs), auth = authorityWeight(sources, domTier), sales = salesWeight(content, salesTerms), eng = engagementWeight(meta);
    return { id: h.id, type: h.type, title: h.title, ts: h.timestamp, rel: +h.score.toFixed(3), content, sources, auth, sales, eng, score: h.score * rec * auth * sales * eng };
  }).sort((a, b) => b.score - a.score).slice(0, k);
}

function extractStats(text) {
  const out = [], re = /([€$]?\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?\s*(?:%|percent|euros?|\/\s*\w+|k|bn|m)?)/gi;
  for (const s of text.split(/(?<=[.!?])\s+/)) { const m = s.match(re); if (m) out.push({ stat: m[0].trim(), label: s.replace(re, '').replace(/\s+/g, ' ').trim().slice(0, 60) }); if (out.length >= 3) break; }
  return out;
}
function draftTemplate(signal, brand) {
  return { headline: (signal.content.split(/(?<=[.!?])\s+/)[0] || signal.title).slice(0, 90), points: extractStats(signal.content).length ? extractStats(signal.content) : [{ stat: '—', label: 'see the brief' }], cta: (brand.cta || 'DETAILS').toUpperCase().replace(/\s+/g, '').slice(0, 10), angle: `Signal matched to ${brand.name} pillars.`, drafted: 'template' };
}
async function draftViaLLM(signal, brand, product, key) {
  const sys = `You draft a SHORT social-post brief connecting a sourced news signal to a brand, in the brand voice. RULES: use ONLY facts/numbers in the signal (never invent); ground every claim; if the connection is weak, say so. Return ONLY JSON: {"headline":"<=90 chars","points":[{"stat":"...","label":"..."}],"cta":"<ONE_UPPERCASE_KEYWORD>","angle":"why it matters to the brand"}`;
  const user = `BRAND: ${brand.name} — ${brand.tagline || ''}\nANGLE: ${product?.angle || ''}\nSIGNAL: ${signal.content.slice(0, 1500)}\nSOURCES: ${(signal.sources || []).join(', ')}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 700, system: sys, messages: [{ role: 'user', content: user }] }) });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const text = (await res.json())?.content?.find((c) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in LLM reply');
  return { ...JSON.parse(m[0]), drafted: 'llm' };
}
function loadBrand(name) {
  const def = { name: 'AMF', tagline: 'amf.continuum.rest', cta: 'DETAILS' };
  if (!name) return def;
  try { return { ...def, ...JSON.parse(readFileSync(resolve(HERE, 'brandbooks', `${name}.json`), 'utf8')) }; } catch { return { ...def, name }; }
}
function pillarId(slug) { const h = createHash('sha256').update(`pillar:${slug}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; }
async function derivePillarsFromCorpus(slug) { try { const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js')); const ps = openStorage('pillars'); const o = ps.getObservations([pillarId(slug)]); ps.close(); return o[0] ? terms(o[0].content) : []; } catch { return []; } }

async function buildBrief(signal, brand, product) {
  const key = process.env.ANTHROPIC_API_KEY; let draft;
  if (key) { try { draft = await draftViaLLM(signal, brand, product, key); } catch (e) { console.error(`[matcher] LLM failed (${e.message}) → template`); draft = draftTemplate(signal, brand); } }
  else { console.error('[matcher] ANTHROPIC_API_KEY not set → grounded template draft (P6)'); draft = draftTemplate(signal, brand); }
  return { brand: brand.name, ...draft, sources: signal.sources || [], fromSignal: signal.id, score: +signal.score.toFixed(3), weights: { relevance: signal.rel, authority: signal.auth, sales: +signal.sales.toFixed(2), engagement: +signal.eng.toFixed(2) }, verify: 'AI-drafted from a sourced signal — verify stats against the source + run continuum_check_brand before publish' };
}

async function run() {
  const a = process.argv; const get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const project = get('--project', 'worldmonitor');
  const slug = get('--brand', process.env.AMF_BRAND);
  const brand = loadBrand(slug);
  const product = getProduct(slug);
  let pillars = (get('--pillars', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pillars.length && product) { pillars = terms([...(product.topics || []), ...(product.keywords || [])].join(' ')); console.error(`[matcher] ${pillars.length} pillar terms for "${slug}" from the Portfolio Universe (sector: ${product.sector})`); }
  if (!pillars.length && slug) pillars = await derivePillarsFromCorpus(slug);
  if (!pillars.length) { console.error('no pillars — add the product to portfolio-universe.json, or pass --pillars "a,b,c"'); process.exit(2); }
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(project);
  const ranked = rankSignals(storage, pillars, product, Date.now(), 1);
  if (!ranked.length) { console.error('[matcher] no matching signals — run adapter-news first'); storage.close(); process.exit(1); }
  const brief = await buildBrief(ranked[0], brand, product);
  storage.close();
  console.log(JSON.stringify(brief, null, 2));
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'matcher-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const s = openStorage('matcher-test'); s.upsertSource('rss', 'docs', {});
  const now = Date.now();
  const mk = (id, content, ageDays, domain, eng) => s.upsertObservation({ id, sourceId: 'rss', type: 'feed_article', content, timestamp: new Date(now - ageDays * 86400000).toISOString(), refs: [], metadata: { sources: [`https://${domain}/x`], engagement: eng } });
  // A: fresh, TIER-1 (skift), hits a sales_signal ("revenue leak") → should win
  mk('11111111-1111-1111-1111-111111111111', 'Hotels face a revenue leak from no-show bookings; a concierge that answers the after-hours call recovers the guest.', 1, 'skift.com', 0);
  // B: fresh, unknown source, same topic, no sales signal
  mk('22222222-2222-2222-2222-222222222222', 'A hotel booking trends piece about guest occupancy.', 1, 'randomblog.example', 0);
  // C: old, tier-1
  mk('33333333-3333-3333-3333-333333333333', 'Hotel no-show revenue leak, an old note about concierge booking.', 45, 'skift.com', 0);

  const product = getProduct('voicecosmos');
  const pillars = terms([...(product.topics || []), ...(product.keywords || [])].join(' '));
  const ranked = rankSignals(s, pillars, product, now, 3);
  const top = ranked[0];
  const brief = await buildBrief(top, loadBrand('voicecosmos'), product);
  const okWin = top?.id.startsWith('11111111'); // fresh × tier-1 × sales beats the others
  const okWeights = top && top.auth > 1 && top.sales > 1 && brief.weights;
  console.error(`\ncontent-matcher smoke (relevance × recency × authority × sales)`);
  console.error(`  pillars=${pillars.length} · ranked=${ranked.length} · top=${top?.id?.slice(0, 8)} score=${top?.score?.toFixed(3)} (auth ${top?.auth} · sales ${top?.sales?.toFixed(2)})`);
  console.error(`  brief: "${brief.headline?.slice(0, 46)}…" cta=${brief.cta} drafted=${brief.drafted}`);
  console.error(`  ${okWin && okWeights ? '✅ PASS' : '❌ FAIL'} — fresh × tier-1 × sales-signal ranks first; LLM gated (template proven)\n`);
  s.close(); const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(okWin && okWeights ? 0 : 1);
}

if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else run().catch((e) => { console.error(e.message); process.exit(1); });
