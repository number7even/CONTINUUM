/**
 * analyze.mjs — DEMAND ANALYSIS: what people search vs what we target. Drives feed selection.
 *
 * Inverts the curation flow: understand demand FIRST, then pick feeds to serve it. Per product:
 *   1. EXPAND each keyword via Google Autocomplete (real queries + adjacent terms we're missing).
 *   2. SCORE demand from free signals — autocomplete depth · Google News volume · HN attention ·
 *      YouTube result-volume (official v3, if keyed).
 *   3. BUCKET against our positioning vocabulary:
 *        CORE    — we target it AND it has demand   → be found for NOW (make content + pull feeds)
 *        EXPAND  — real demand we DON'T target yet   → keywords to add (autocomplete found them)
 *        EDUCATE — we target it but demand is low     → vision-led / category-creation (the GAP)
 *
 *   node analyze.mjs --brand voiceidvault [--max 14] [--threshold 0.35]
 *   node analyze.mjs --smoke
 *
 * All signals are FREE (autocomplete/news/HN key-free; YouTube uses the free official v3 key).
 * Output is a demand map + the discover command to find feeds for the Core+Expand clusters.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from './adapter-news.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'from', 'into', 'its', 'has', 'have', 'will', 'not', 'what', 'how', 'why', 'best', 'free', 'online', 'vs', 'near', 'app', 'apps']);
const terms = (t) => [...new Set((String(t).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];
const enc = encodeURIComponent;
const clamp = (x) => Math.max(0, Math.min(1, x));
const loadUniverse = () => { try { return JSON.parse(readFileSync(resolve(HERE, 'portfolio-universe.json'), 'utf8')); } catch { return { products: [] }; } };
const getProduct = (slug) => (loadUniverse().products || []).find((p) => p.slug === slug) || null;
// vision-led products: low search demand is EXPECTED (they create the category, not chase it)
const VISION_LED = new Set(['continuum', 'thenine']);

// ── free demand signals ──────────────────────────────────────────────────────
async function autocomplete(q) { try { const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${enc(q)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) return []; const j = await r.json(); return Array.isArray(j?.[1]) ? j[1] : []; } catch { return []; } }
async function newsVolume(q) { try { const r = await fetch(`https://news.google.com/rss/search?q=${enc(q)}&hl=en-US&gl=US&ceid=US:en`, { headers: { 'User-Agent': 'continuum-analyze/0.1' } }); if (!r.ok) return 0; return parseFeed(await r.text()).length; } catch { return 0; } }
async function hnHits(q) { try { const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${enc(q)}&tags=story&hitsPerPage=5`); if (!r.ok) return { hits: 0, points: 0 }; const j = await r.json(); return { hits: Number(j.nbHits || 0), points: (j.hits || []).reduce((s, h) => s + Number(h.points || 0), 0) }; } catch { return { hits: 0, points: 0 }; } }
async function ytVolume(q) { const k = process.env.YOUTUBE_API_KEY; if (!k) return null; try { const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&relevanceLanguage=en&q=${enc(q)}&key=${k}`); if (!r.ok) return null; return Number((await r.json()).pageInfo?.totalResults || 0); } catch { return null; } }

export function demandScore(sig, hasYt) {
  const nAuto = clamp(sig.auto / 10), nNews = clamp(sig.news / 60), nHN = clamp(Math.log10(1 + sig.hnHits) / 3), nYT = hasYt ? clamp(Math.log10(1 + (sig.yt || 0)) / 6) : 0;
  const w = hasYt ? { a: 0.25, n: 0.30, h: 0.20, y: 0.25 } : { a: 0.38, n: 0.42, h: 0.20, y: 0 };
  return nAuto * w.a + nNews * w.n + nHN * w.h + nYT * w.y;
}
async function analyzeTerm(t, hasYt) {
  const [sugg, news, hn, yt] = await Promise.all([autocomplete(t), newsVolume(t), hnHits(t), ytVolume(t)]);
  const sig = { auto: sugg.length, news, hnHits: hn.hits, hnPoints: hn.points, yt };
  return { term: t, suggestions: sugg, demand: +demandScore(sig, hasYt).toFixed(3), sig };
}
const sigLine = (s, hasYt) => `auto ${String(s.auto).padStart(2)} · news ${String(s.news).padStart(3)} · hn ${String(s.hnHits).padStart(4)}${hasYt ? ` · yt ${(s.yt || 0) >= 1000 ? (s.yt / 1000).toFixed(0) + 'k' : s.yt}` : ''}`;

async function run() {
  const a = process.argv, get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const slug = get('--brand', process.env.AMF_BRAND);
  const product = getProduct(slug);
  if (!product) { console.error(`no such product: ${slug}`); process.exit(2); }
  const maxN = Number(get('--max', 14)), TH = Number(get('--threshold', 0.35)), hasYt = !!process.env.YOUTUBE_API_KEY;
  const vocab = new Set(terms([...(product.topics || []), ...(product.keywords || []), ...(product.sales_signals || [])].join(' ')));
  const seeds = [...new Set([...(product.topics || []), ...(product.keywords || [])])].slice(0, 10);
  console.error(`\nanalyze · ${slug} (P${product.priority} · ${product.sector})${hasYt ? ' · +YouTube' : ' · no YT key'}`);
  console.error(`  expanding ${seeds.length} seeds via autocomplete…`);

  // Phase 1 — discover expansion terms (autocomplete suggestions that introduce NEW words)
  const freq = new Map();
  for (const seed of seeds) { for (const s of await autocomplete(seed)) freq.set(s, (freq.get(s) || 0) + 1); }
  const discovered = [...freq.entries()].map(([sug, f]) => ({ sug, f, newWords: terms(sug).filter((w) => !vocab.has(w)) }))
    .filter((d) => d.newWords.length && terms(d.sug).some((w) => vocab.has(w))) // relevant: shares a vocab word AND adds a new one
    .sort((x, y) => y.f - x.f);

  // candidate set: seeds + top discovered, capped
  const candidates = [...seeds.map((s) => ({ term: s, kind: 'seed' })), ...discovered.slice(0, Math.max(0, maxN - seeds.length)).map((d) => ({ term: d.sug, kind: 'discovered', newWords: d.newWords }))].slice(0, maxN);
  console.error(`  scoring demand for ${candidates.length} terms (${discovered.length} discovered)…`);

  // Phase 2 — score demand
  const scored = [];
  for (const c of candidates) { const r = await analyzeTerm(c.term, hasYt); scored.push({ ...c, ...r }); process.stderr.write('.'); }
  console.error('');

  // Phase 3 — bucket
  const CORE = [], EXPAND = [], EDUCATE = [];
  for (const s of scored) {
    if (s.kind === 'seed') (s.demand >= TH ? CORE : EDUCATE).push(s);
    else if (s.demand >= TH) EXPAND.push(s);
  }
  const byD = (x, y) => y.demand - x.demand;
  CORE.sort(byD); EXPAND.sort(byD); EDUCATE.sort(byD);

  console.error(`\n══ DEMAND MAP · ${slug} ${VISION_LED.has(slug) ? '(VISION-LED — low demand = category-creation, not reject)' : '(demand-led)'} ══`);
  console.error(`\n● CORE — be found for NOW (we target it + real demand):`);
  for (const s of CORE) console.error(`   ${s.demand.toFixed(2)}  ${s.term.padEnd(34)} [${sigLine(s.sig, hasYt)}]`);
  console.error(`\n● EXPAND — real demand we DON'T target yet (add these keywords):`);
  if (!EXPAND.length) console.error('   (none above threshold)');
  for (const s of EXPAND) console.error(`   ${s.demand.toFixed(2)}  ${s.term.padEnd(34)} + new: ${s.newWords.join(', ')}`);
  console.error(`\n● EDUCATE — we target it, demand is thin ${VISION_LED.has(slug) ? '(expected — early market)' : '(niche / education play)'}:`);
  if (!EDUCATE.length) console.error('   (none)');
  for (const s of EDUCATE) console.error(`   ${s.demand.toFixed(2)}  ${s.term.padEnd(34)} [${sigLine(s.sig, hasYt)}]`);

  const clusters = [...CORE.slice(0, 4), ...EXPAND.slice(0, 3)].map((s) => s.term);
  console.error(`\n→ next: pull feeds for the demand clusters —`);
  console.error(`  AMF_SIGNAL_QUERY="${clusters.join(',')}" node adapter-news.mjs --provider googlenews --project ${slug}`);
  console.error(`  (and add the EXPAND terms to ${slug}.keywords in portfolio-universe.json — your call, P9)\n`);
  process.exit(0);
}

async function smoke() {
  const hi = demandScore({ auto: 10, news: 50, hnHits: 500, yt: 500000 }, true);
  const lo = demandScore({ auto: 1, news: 1, hnHits: 2, yt: 50 }, true);
  const noYt = demandScore({ auto: 8, news: 40, hnHits: 100, yt: 0 }, false);
  const ok = hi > 0.6 && lo < 0.2 && hi > noYt && noYt > lo;
  console.error(`\nanalyze smoke — demand scoring + monotonicity`);
  console.error(`  high-signal ${hi.toFixed(2)} > no-yt ${noYt.toFixed(2)} > low-signal ${lo.toFixed(2)}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — composite demand score orders as expected; live signals fetched in run()\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
