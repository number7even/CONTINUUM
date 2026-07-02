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
import './env.mjs'; // load .env.local into process.env first (P1)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const SIGNAL_TYPES = new Set(['world_brief', 'feed_article', 'rss', 'engagement_signal']);
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'from', 'into', 'its', 'has', 'have', 'will', 'not']);
const terms = (t) => [...new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];
const ftsQuery = (list) => list.slice(0, 30).map((t) => `"${t}"`).join(' OR ');
// decode HTML entities (named + numeric), 2 passes → handles double-encoding (F&amp;amp;B, &amp;nbsp;)
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };
function cleanText(s) {
  const once = (t) => String(t)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } })
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n.toLowerCase()] ?? m);
  return once(once(s)).replace(/\s+/g, ' ').trim();
}

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
/**
 * Feedback weight — Seam ② closing into ranking (the learning half). Prior XENOS HITL
 * decisions arrive (via feedback-sync.mjs) as type='ground_truth' Observations carrying
 * metadata.reward (approve 1.0 · modify 0.7 · reject 0.2). For a candidate signal, prior
 * decisions on TOPICALLY-SIMILAR content nudge its score: approved topics ↑, rejected ↓.
 * Bounded to [0.8, 1.3] so feedback is a NUDGE — the boolean gate + relevance still lead;
 * one reject cannot erase a strong fresh signal, one approve cannot resurrect off-topic noise.
 * `gt` = [{ reward:Number, terms:string[] }] (pre-tokenised). Empty → 1 (backward compatible).
 */
function feedbackWeight(content, gt) {
  if (!gt || !gt.length) return 1;
  const ct = new Set(terms(content)); if (!ct.size) return 1;
  let nudge = 0, matched = 0;
  for (const g of gt) {
    const r = Number(g.reward); if (!Number.isFinite(r)) continue;
    const overlap = g.terms.filter((t) => ct.has(t)).length;
    if (overlap >= 2) { nudge += (r - 0.5) * Math.min(overlap / 4, 1); matched += 1; } // r-0.5: approve→+.5, modify→+.2, reject→−.3, scaled by topic overlap
  }
  return matched ? Math.max(0.8, Math.min(1.3, 1 + nudge / matched)) : 1;
}

/**
 * Boolean pre-score gate (the Feedly AND/NOT model). product.filters = { must, not }:
 *   must — array of GROUPS; the signal must hit ≥1 term in EVERY group  (AND-of-ORs)
 *   not  — flat list; the signal must contain NONE                       (exclusion)
 * Absent filters → everything passes (backward compatible). This kills broad-feed noise
 * (e.g. a Skift "World Cup" story) BEFORE it can score, not by curation luck.
 */
export function passesFilters(content, product) {
  const f = product?.filters; if (!f) return true;
  const lc = String(content).toLowerCase();
  if (Array.isArray(f.not) && f.not.some((t) => lc.includes(String(t).toLowerCase()))) return false;
  if (Array.isArray(f.must)) for (const group of f.must) {
    const alts = Array.isArray(group) ? group : [group];
    if (!alts.some((t) => lc.includes(String(t).toLowerCase()))) return false;
  }
  return true;
}

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
  // Seam ② feedback (the learning half): prior XENOS HITL decisions land as type='ground_truth'
  // Observations (via feedback-sync.mjs) in the SAME project as the content pool. Co-locate them
  // to close the loop — approved topics get boosted next run, rejected topics dampened.
  const gtHits = storage.searchObservations(q, 40).filter((h) => h.type === 'ground_truth');
  const gtFull = gtHits.length ? storage.getObservations(gtHits.map((h) => h.id)) : [];
  const slug = String(product?.slug || '').toLowerCase();
  const gt = gtFull.map((o) => ({ reward: o?.metadata?.reward, product: String(o?.metadata?.product || '').toLowerCase(), terms: terms(o?.content || '') }))
    .filter((g) => g.reward != null && (!slug || !g.product || g.product === slug || g.product.includes(slug) || slug.includes(g.product)));
  return hits.map((h) => {
    const o = byId.get(h.id); const meta = o?.metadata || {}; const content = o?.content || h.title; const sources = meta.sources || [];
    const rec = recencyWeight(h.timestamp, nowMs), auth = authorityWeight(sources, domTier), sales = salesWeight(content, salesTerms), eng = engagementWeight(meta);
    const fb = feedbackWeight(content, gt); // Seam ② — approved topics ↑, rejected ↓ (bounded)
    return { id: h.id, type: h.type, title: h.title, ts: h.timestamp, rel: +h.score.toFixed(3), content, sources, auth, sales, eng, fb, score: h.score * rec * auth * sales * eng * fb };
  }).filter((x) => passesFilters(x.content, product)) // Feedly AND/NOT gate — drop noise before ranking
    .sort((a, b) => b.score - a.score).slice(0, k);
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
  return { brand: brand.name, ...draft, sources: signal.sources || [], fromSignal: signal.id, score: +signal.score.toFixed(3), weights: { relevance: signal.rel, authority: signal.auth, sales: +signal.sales.toFixed(2), engagement: +signal.eng.toFixed(2), feedback: +(signal.fb ?? 1).toFixed(2) }, verify: 'AI-drafted from a sourced signal — verify stats against the source + run continuum_check_brand before publish' };
}

// ── the REPORT drafter — a multi-section lead-magnet PDF brief (produce-report shape) ─────
const firstSentence = (s) => (String(s.content || '').split(/(?<=[.!?])\s+/)[0] || s.title || '');
function draftReportTemplate(signals, brand, product) {
  const angle = cleanText(product?.angle || `${brand.name} — ${brand.tagline || ''}`);
  const evidence = signals.slice(0, 4).map((s) => ({
    heading: cleanText(String(s.title || firstSentence(s)).replace(/\s*[-–|]\s*[^-–|]*$/, '')).slice(0, 64), // strip " - Publisher" suffix
    stats: extractStats(cleanText(s.content)),
    body: cleanText(s.content).slice(0, 480),
  })).filter((sec) => sec.heading && sec.heading.length > 8);
  return {
    kicker: brand.kicker || brand.name,
    title: cleanText(`The ${product?.sector || 'Market'} Signal — What ${brand.name} Is Watching Now`).slice(0, 90),
    subtitle: angle.slice(0, 160), // the product's ARGUMENT leads, not an echoed headline
    author: 'Riaan Kleynhans',
    sections: [
      { heading: 'Why this matters now', stats: [], body: angle },              // brand argument up front
      ...evidence,                                                              // signals as supporting evidence
    ],
    cta: { headline: 'See it on your numbers.', body: cleanText(`Book a ${brand.name} walkthrough and we'll model this against your actual data. ${brand.tagline || ''}`) },
    drafted: 'template',
    sources: [...new Set(signals.flatMap((s) => s.sources || []))].slice(0, 8),
    verify: 'Template SKELETON grounded in sourced signals — the LLM (ANTHROPIC_API_KEY) authors the full brand argument. Verify stats + run continuum_check_brand before publish.',
  };
}
async function draftReportViaLLM(signals, brand, product, key) {
  const corpus = signals.slice(0, 4).map((s, i) => `[${i + 1}] ${cleanText(s.content).slice(0, 900)}  (sources: ${(s.sources || []).join(', ')})`).join('\n\n');
  const sys = `You write a lead-magnet report as a BRAND ARGUMENT (not a news digest), in the brand voice. Structure: open with the brand's thesis/angle, then 3-4 sections that use the signals as EVIDENCE for that argument, close with the CTA. RULES: use ONLY facts/numbers present in the signals (never invent); ground every claim; each section body <=600 chars. Return ONLY JSON: {"title":"<=90","subtitle":"","sections":[{"heading":"","stats":[{"stat":"","label":""}],"body":""}],"cta":{"headline":"","body":""}}`;
  const user = `BRAND: ${brand.name} — ${brand.tagline || ''}\nARGUMENT/ANGLE (lead with this): ${product?.angle || ''}\nEVIDENCE SIGNALS:\n${corpus}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 1500, system: sys, messages: [{ role: 'user', content: user }] }) });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const text = (await res.json())?.content?.find((c) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in LLM reply');
  return { ...JSON.parse(m[0]), author: 'Riaan Kleynhans', kicker: brand.kicker || brand.name, drafted: 'llm', sources: [...new Set(signals.flatMap((s) => s.sources || []))].slice(0, 8), verify: 'LLM-synthesised from sourced signals — verify stats + continuum_check_brand before publish' };
}
async function buildReportBrief(signals, brand, product) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) { try { return await draftReportViaLLM(signals, brand, product, key); } catch (e) { console.error(`[matcher] report LLM failed (${e.message}) → template`); } }
  else console.error('[matcher] ANTHROPIC_API_KEY not set → grounded template report (P6)');
  return draftReportTemplate(signals, brand, product);
}

async function run() {
  const a = process.argv; const get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const project = get('--project', 'worldmonitor');
  const slug = get('--brand', process.env.AMF_BRAND);
  const format = get('--format', 'post'); // post → single-signal brief · report → multi-section PDF brief
  const brand = loadBrand(slug);
  const product = getProduct(slug);
  let pillars = (get('--pillars', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pillars.length && product) { pillars = terms([...(product.topics || []), ...(product.keywords || [])].join(' ')); console.error(`[matcher] ${pillars.length} pillar terms for "${slug}" from the Portfolio Universe (sector: ${product.sector})`); }
  if (!pillars.length && slug) pillars = await derivePillarsFromCorpus(slug);
  if (!pillars.length) { console.error('no pillars — add the product to portfolio-universe.json, or pass --pillars "a,b,c"'); process.exit(2); }
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(project);
  const ranked = rankSignals(storage, pillars, product, Date.now(), format === 'report' ? 4 : 1);
  if (!ranked.length) { console.error('[matcher] no matching signals — run adapter-news first'); storage.close(); process.exit(1); }
  const brief = format === 'report' ? await buildReportBrief(ranked, brand, product) : await buildBrief(ranked[0], brand, product);
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
  // D: fresh × tier-1, would score #1 — BUT hits a NOT term (world cup). Boolean gate must drop it.
  mk('44444444-4444-4444-4444-444444444444', 'World Cup fever fills hotels as football fans book rooms across the host city.', 1, 'skift.com', 0);
  // E: off-topic — fails the lodging MUST group (no hospitality entity). Must be dropped.
  mk('55555555-5555-5555-5555-555555555555', 'A fintech startup raised a Series B for its payments booking API.', 1, 'skift.com', 0);

  const product = getProduct('voicecosmos');
  const pillars = terms([...(product.topics || []), ...(product.keywords || [])].join(' '));
  const ranked = rankSignals(s, pillars, product, now, 5);
  const top = ranked[0];
  const brief = await buildBrief(top, loadBrand('voicecosmos'), product);
  const okWin = top?.id.startsWith('11111111'); // fresh × tier-1 × sales beats the others
  const okWeights = top && top.auth > 1 && top.sales > 1 && brief.weights;
  const okFiltered = !ranked.some((r) => /world cup|fintech|series b/i.test(r.content)) && ranked.length === 3; // D+E dropped, A/B/C remain
  console.error(`\ncontent-matcher smoke (Feedly gate + relevance × recency × authority × sales)`);
  console.error(`  pillars=${pillars.length} · survivors=${ranked.length}/5 (World-Cup + fintech dropped by must/not) · top=${top?.id?.slice(0, 8)} (auth ${top?.auth} · sales ${top?.sales?.toFixed(2)})`);
  console.error(`  boolean gate: ${okFiltered ? 'World-Cup NOT-dropped + off-topic MUST-dropped ✓' : 'LEAKED ✗'}`);
  console.error(`  brief: "${brief.headline?.slice(0, 42)}…" cta=${brief.cta} drafted=${brief.drafted}`);
  console.error(`  ${okWin && okWeights && okFiltered ? '✅ PASS' : '❌ FAIL'} — noise gated BEFORE scoring; fresh × tier-1 × sales still wins\n`);
  s.close(); const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(okWin && okWeights && okFiltered ? 0 : 1);
}

// only run the CLI when invoked directly — safe to `import { rankSignals }` elsewhere
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
