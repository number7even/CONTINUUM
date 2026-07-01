/**
 * discover.mjs — feed DISCOVERY (Feedly's "Follow sources" page, as an API).
 *
 * Feedly's /v3/search/feeds endpoint is OPEN — no Enterprise token. It gates CONTENT
 * (streams) behind the paywall, but feed DISCOVERY is public and returns candidate feeds
 * by topic WITH subscribers + velocity (a popularity/freshness proxy) and Feedly's own
 * topic tags. This queries it per product using the Portfolio-Universe entity terms and
 * PROPOSES feeds + tier bands — so we populate every product's pool ourselves, without
 * depending on a Feedly account that only covers Emporium/hospitality.
 *
 *   node discover.mjs --brand voiceidvault          # discover feeds for one product
 *   node discover.mjs --brand voiceidvault --deep   # also rate-source each (reachability + fit)
 *   node discover.mjs --all                          # every product with a vocabulary
 *   node discover.mjs --smoke
 *
 * NEVER writes the universe (P9 — proposes; the human ratifies tier/authority). Feedly's
 * subscribers/velocity only SEED a tier guess; you decide. Paste ratified lines into feeds[].
 *
 * HONEST CAVEAT (verified 2026-07-01): the open Feedly endpoint returns GOOD candidates for
 * BROAD topics (hospitality) but SPARSE / low-authority junk for niche ones (deepfake →
 * a Google-News stub; vishing → a fishing site; "voice fraud" → nothing). For niche verticals
 * prefer Google News RSS per-topic (news.google.com/rss/search?q=…) as the content firehose,
 * plus a human-curated authority seed list. Feedly-discover is a broad-topic assist, not a
 * pool-filler on its own.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { fileURLToPath } from 'node:url';
import { loadUniverse, productTerms, fitScore, sampleFeed } from './rate-source.mjs';

const FEEDLY = 'https://cloud.feedly.com/v3/search/feeds';
const rssUrl = (feedId) => String(feedId || '').replace(/^feed\//, '');

/** Query Feedly's open discovery endpoint for one topic → candidate feeds. */
export async function searchFeedly(query, count = 8) {
  const res = await fetch(`${FEEDLY}?query=${encodeURIComponent(query)}&count=${count}`, { headers: { 'User-Agent': 'continuum-discover/0.1' } });
  if (!res.ok) throw new Error(`Feedly HTTP ${res.status}`);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    url: rssUrl(r.feedId), title: r.title || r.website || '(untitled)', website: r.website || '',
    subscribers: Number(r.subscribers || 0), velocity: Number(r.velocity || 0),
    topics: r.topics || [], language: r.language || '', state: r.state || '',
  }));
}

/** Seed a tier guess from popularity+freshness. AUTHORITY is the human's call (P9) — this is a hint. */
export function proposeFeedTier(f) {
  if (f.subscribers >= 20000 && f.velocity >= 0.5) return 'T1?';
  if (f.subscribers >= 3000) return 'T2?';
  return 'T3?';
}

/** Discover + dedupe candidates for a product across its entity queries. */
async function discoverForProduct(p, { deep } = {}) {
  const queries = [...new Set([...(p.topics || []).slice(0, 4), p.sector].filter(Boolean))];
  const byUrl = new Map();
  for (const q of queries) {
    let hits = []; try { hits = await searchFeedly(q, 8); } catch (e) { console.error(`  [${p.slug}] "${q}" → ${e.message}`); continue; }
    for (const f of hits) {
      if (f.language && f.language !== 'en') continue;
      if (!byUrl.has(f.url)) byUrl.set(f.url, { ...f, queries: new Set([q]) });
      else byUrl.get(f.url).queries.add(q);
    }
  }
  let cands = [...byUrl.values()].sort((a, b) => b.subscribers - a.subscribers).slice(0, 12);
  if (deep) {
    for (const c of cands) {
      try { const items = await sampleFeed(c.url); c.reach = true; c.fit = items.length ? fitScore(items.map((i) => `${i.title} ${i.content}`).join(' '), p).fraction : 0; }
      catch (e) { c.reach = false; c.note = e.message; }
    }
    cands = cands.filter((c) => c.reach !== false); // drop unreachable when we bothered to check
  }
  return cands;
}

async function run() {
  const a = process.argv, get = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  const brand = get('--brand'), deep = a.includes('--deep');
  const universe = loadUniverse();
  const products = brand ? universe.products.filter((p) => p.slug === brand) : universe.products.filter((p) => productTerms(p).length);
  if (!products.length) { console.error(brand ? `no such product: ${brand}` : 'no products with vocabulary'); process.exit(2); }
  console.error(`\ndiscover · Feedly open feed-search · ${products.length} product(s)${deep ? ' · deep (reachability+fit)' : ''}\n`);
  for (const p of products) {
    const cands = await discoverForProduct(p, { deep });
    console.error(`● ${p.slug}  (P${p.priority} · ${p.sector})`);
    if (!cands.length) { console.error('    (no candidates — widen topics or check network)\n'); continue; }
    for (const c of cands.slice(0, 8)) {
      const tier = proposeFeedTier(c);
      const pop = c.subscribers >= 1000 ? `${(c.subscribers / 1000).toFixed(0)}k` : `${c.subscribers}`;
      const fit = deep && c.fit != null ? ` fit ${(c.fit * 100).toFixed(0)}%` : '';
      console.error(`    ${tier.padEnd(4)} ${pop.padStart(5)} subs · v${c.velocity.toFixed(1)}${fit}  ${c.title.slice(0, 30).padEnd(30)}  {"url":"${c.url}","tier":?,"name":"${c.title.slice(0, 22)}"}`);
    }
    console.error('');
  }
  console.error('→ subscribers/velocity are Feedly HINTS; YOU assign the tier (authority is human-rated, P9).');
  console.error('  Ratify the good ones into portfolio-universe.json feeds[]; run rate-source --deep to confirm fit.\n');
  process.exit(0);
}

async function smoke() {
  // parse a mock Feedly response + tier proposal (no network)
  const mock = { results: [
    { feedId: 'feed/https://krebsonsecurity.com/feed/', title: 'Krebs on Security', website: 'https://krebsonsecurity.com', subscribers: 45000, velocity: 1.2, topics: ['security'], language: 'en' },
    { feedId: 'feed/https://tiny.example/rss', title: 'Tiny Blog', website: 'https://tiny.example', subscribers: 40, velocity: 0.01, topics: [], language: 'en' },
  ] };
  const mapped = mock.results.map((r) => ({ url: rssUrl(r.feedId), title: r.title, subscribers: r.subscribers, velocity: r.velocity }));
  const t1 = proposeFeedTier(mapped[0]); // 45k subs, v1.2 → T1?
  const t3 = proposeFeedTier(mapped[1]); // 40 subs → T3?
  const okUrl = mapped[0].url === 'https://krebsonsecurity.com/feed/';
  const ok = okUrl && t1 === 'T1?' && t3 === 'T3?';
  console.error(`\ndiscover smoke — parse Feedly discovery results + tier hint`);
  console.error(`  feedId→url: ${mapped[0].url}`);
  console.error(`  Krebs (45k subs, v1.2) → ${t1} · Tiny (40 subs) → ${t3}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — discovery parse + popularity→tier hint (live query happens in run())\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
