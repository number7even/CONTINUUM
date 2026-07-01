/**
 * adapter-news.mjs — the LEGIT L2 brain: multi-provider intelligence → CONTINUUM corpus.
 *
 * The ethical replacement for the killed Agent-Reach. Pulls from licensed/curated
 * providers (no cookie-scraping) and writes each item as a privacy-filtered
 * Observation — sourced, searchable, brand-filterable. Two layers:
 *
 *   • worldmonitor  — MACRO: WorldMonitor hosted MCP (geopolitics/energy/cyber), 39 tools.
 *   • feedly        — YOUR VERTICALS: Feedly Web API streams (hospitality/safari/
 *                     digital-strategy/consumer-behavior — your own curated feeds + AI Feeds).
 *
 * "Today's topic" = query this corpus, scored against your product pillars.
 * No AGPL exposure (API clients of hosted SaaS, not integrating their code).
 *
 *   WORLDMONITOR_API_KEY=wm_…              node adapter-news.mjs --provider worldmonitor
 *   FEEDLY_ACCESS_TOKEN=… FEEDLY_STREAM_ID=… node adapter-news.mjs --provider feedly
 *   node adapter-news.mjs --provider all [--project worldmonitor]
 *   node adapter-news.mjs --smoke          # proves the corpus-write path (mock items, no keys)
 *
 * HONEST (P4): live provider calls are GATED on their keys + UNTESTED without them
 * (same discipline as the Auphonic/whisperx seams). The corpus-write half IS proven.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** sha256(seed) → UUID-shape stable id (same convention as the docs adapter). */
function stableId(seed) {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ── minimal RSS/Atom parser (no dep) — handles the common well-formed case ──────
function decodeXml(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function xmlTag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeXml(m[1]) : '';
}
export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const title = xmlTag(b, 'title');
    const link = isAtom ? (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '') : xmlTag(b, 'link');
    const desc = xmlTag(b, isAtom ? 'summary' : 'description') || xmlTag(b, 'content');
    const dateRaw = xmlTag(b, isAtom ? 'updated' : 'pubDate') || xmlTag(b, 'published') || xmlTag(b, 'dc:date');
    let published; try { published = dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(); } catch { published = new Date().toISOString(); }
    return { title, content: `${title}${desc ? ' — ' + desc : ''}`.slice(0, 2000), category: xmlTag(b, 'category') || 'rss', sources: [link].filter(Boolean), published };
  }).filter((it) => it.title);
}

// ── Provider: WorldMonitor (hosted MCP) ──────────────────────────────────────
const worldmonitor = {
  id: 'worldmonitor',
  obsType: 'world_brief',
  gate: () => (process.env.WORLDMONITOR_API_KEY ? null : 'set WORLDMONITOR_API_KEY (wm_…) from worldmonitor.app'),
  async fetch() {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const url = process.env.WORLDMONITOR_MCP_URL || 'https://worldmonitor.app/mcp';
    const headers = { 'X-WorldMonitor-Key': process.env.WORLDMONITOR_API_KEY };
    const client = new Client({ name: 'continuum-adapter-news', version: '0.0.1' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
    const items = [];
    try {
      await client.connect(transport);
      for (const tool of ['get_world_brief', 'get_news_intelligence']) {
        const res = await client.callTool({ name: tool, arguments: {} }).catch(() => null);
        const text = res?.content?.find((c) => c.type === 'text')?.text ?? '';
        if (!text) continue;
        let parsed = null; try { parsed = JSON.parse(text); } catch { /* plain */ }
        items.push({ title: tool, content: text, category: parsed?.category || tool.replace(/^get_/, ''), sources: parsed?.sources || [], published: new Date().toISOString() });
      }
    } finally { try { await client.close(); } catch { /* noop */ } }
    return items;
  },
};

// ── Provider: Feedly (Web API streams — YOUR curated feeds/boards/AI-Feeds) ───
const feedly = {
  id: 'feedly',
  obsType: 'feed_article',
  gate: () => (process.env.FEEDLY_ACCESS_TOKEN && process.env.FEEDLY_STREAM_ID ? null : 'set FEEDLY_ACCESS_TOKEN + FEEDLY_STREAM_ID (an AI-Feed/board/category stream id)'),
  async fetch() {
    const token = process.env.FEEDLY_ACCESS_TOKEN;
    const count = process.env.FEEDLY_COUNT || 20;
    const items = [];
    for (const streamId of String(process.env.FEEDLY_STREAM_ID).split(',').map((s) => s.trim()).filter(Boolean)) {
      const url = `https://cloud.feedly.com/v3/streams/contents?streamId=${encodeURIComponent(streamId)}&count=${count}`;
      const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
      if (!res.ok) { console.error(`[feedly] ${streamId} → HTTP ${res.status}`); continue; }
      const j = await res.json();
      for (const it of j.items || []) {
        const body = (it.summary?.content || it.content?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        items.push({
          title: it.title || '(untitled)',
          content: `${it.title || ''}${body ? ' — ' + body : ''}`.trim(),
          category: it.origin?.title || j.title || 'feedly',
          sources: (it.alternate || []).map((a) => a.href).filter(Boolean),
          published: it.published ? new Date(it.published).toISOString() : new Date().toISOString(),
        });
      }
    }
    return items;
  },
};

// ── Provider: RSS (the FREE path — no API key; export your Feedly feeds as OPML) ─
const rss = {
  id: 'rss',
  obsType: 'feed_article',
  gate: () => (process.env.AMF_RSS_FEEDS ? null : 'set AMF_RSS_FEEDS="https://feed1,https://feed2" (public RSS/Atom — free, no API; export your Feedly OPML for the URLs)'),
  async fetch() {
    const items = [];
    for (const url of String(process.env.AMF_RSS_FEEDS).split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'continuum-adapter-news/0.1' } });
        if (!res.ok) { console.error(`[rss] ${url} → HTTP ${res.status}`); continue; }
        const parsed = parseFeed(await res.text());
        for (const it of parsed.slice(0, Number(process.env.AMF_RSS_COUNT || 20))) items.push(it);
        console.error(`[rss] ${url} → ${parsed.length} items`);
      } catch (e) { console.error(`[rss] ${url} failed: ${e.message}`); }
    }
    return items;
  },
};

// ── the ENGAGEMENT layer — trending signals with real crowd-scores (key-free) ──
// Query terms come from AMF_SIGNAL_QUERY (comma list) — run() derives them from a
// product's Portfolio-Universe keywords when --brand is passed. engagement = a raw
// crowd-score (points+comments) the matcher's engagementWeight normalises. This is
// what recovers Feedly-AI's "trending" signal without a paid key.
const signalTerms = () => String(process.env.AMF_SIGNAL_QUERY || '').split(',').map((s) => s.trim()).filter(Boolean);
const perQuery = () => Math.max(1, Number(process.env.AMF_SIGNAL_COUNT || 8));

// Hacker News — Algolia search API: real `points` + `num_comments`, no key.
const hackernews = {
  id: 'hackernews',
  obsType: 'engagement_signal',
  gate: () => (signalTerms().length ? null : 'set AMF_SIGNAL_QUERY="term1,term2" (or pass --brand to derive from the Portfolio Universe)'),
  async fetch() {
    const items = [], seen = new Set();
    for (const q of signalTerms()) {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${perQuery()}`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'continuum-adapter-news/0.1' } });
        if (!res.ok) { console.error(`[hackernews] "${q}" → HTTP ${res.status}`); continue; }
        const j = await res.json();
        for (const h of j.hits || []) {
          if (!h.title || seen.has(h.objectID)) continue; seen.add(h.objectID);
          const points = Number(h.points || 0), comments = Number(h.num_comments || 0);
          const src = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
          items.push({ title: h.title, content: h.title, category: `hn:${q}`, sources: [src], engagement: points + comments, published: h.created_at || new Date().toISOString() });
        }
        console.error(`[hackernews] "${q}" → ${(j.hits || []).length} stories`);
      } catch (e) { console.error(`[hackernews] "${q}" failed: ${e.message}`); }
    }
    return items;
  },
};

// Reddit — public search JSON: `score` + `num_comments`, no key (needs a UA header).
const reddit = {
  id: 'reddit',
  obsType: 'engagement_signal',
  gate: () => (signalTerms().length ? null : 'set AMF_SIGNAL_QUERY="term1,term2" (or pass --brand to derive from the Portfolio Universe)'),
  async fetch() {
    const items = [], seen = new Set();
    const window = process.env.AMF_REDDIT_WINDOW || 'week';
    for (const q of signalTerms()) {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=top&t=${window}&limit=${perQuery()}`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'continuum-adapter-news/0.1 (by /u/continuum)' } });
        if (!res.ok) { console.error(`[reddit] "${q}" → HTTP ${res.status}`); continue; }
        const j = await res.json();
        for (const c of j.data?.children || []) {
          const d = c.data || {}; if (!d.title || seen.has(d.id)) continue; seen.add(d.id);
          const score = Number(d.score || 0), comments = Number(d.num_comments || 0);
          const body = String(d.selftext || '').replace(/\s+/g, ' ').trim().slice(0, 600);
          items.push({ title: d.title, content: `${d.title}${body ? ' — ' + body : ''}`, category: `reddit:${d.subreddit || q}`, sources: [`https://www.reddit.com${d.permalink}`], engagement: score + comments, published: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString() });
        }
        console.error(`[reddit] "${q}" → ${(j.data?.children || []).length} posts`);
      } catch (e) { console.error(`[reddit] "${q}" failed: ${e.message}`); }
    }
    return items;
  },
};

const PROVIDERS = { worldmonitor, feedly, rss, hackernews, reddit };

/** Derive AMF_SIGNAL_QUERY from a product's Portfolio-Universe keywords (--brand). */
function deriveSignalQuery(slug) {
  try {
    const uni = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'portfolio-universe.json'), 'utf8'));
    const p = (uni.products || []).find((x) => x.slug === slug);
    if (!p) return [];
    // top signal terms: sales_signals + the tightest keywords (bounded to keep API calls sane)
    return [...(p.sales_signals || []).slice(0, 3), ...(p.keywords || []).slice(0, 3)];
  } catch { return []; }
}

/** The testable core: upsert provider items into the CONTINUUM corpus. Returns count. */
export function ingest(storage, provider, items) {
  storage.upsertSource(provider.id, 'docs', { adapter: 'news', provider: provider.id });
  let written = 0;
  for (const it of items) {
    const obs = {
      id: stableId(`${provider.id}|${it.title}|${it.content}`),
      sourceId: provider.id,
      type: provider.obsType,
      content: it.content,
      timestamp: it.published || new Date().toISOString(),
      refs: [],
      metadata: { provider: provider.id, category: it.category, sources: it.sources || [], ...(it.engagement != null ? { engagement: it.engagement } : {}) },
    };
    if (storage.upsertObservation(obs)) written += 1; // null = privacy-scrubbed
  }
  return written;
}

async function run(which, projectId, brand) {
  // engagement providers need a query — derive it from the product's universe keywords (--brand)
  if (brand && !process.env.AMF_SIGNAL_QUERY) {
    const q = deriveSignalQuery(brand);
    if (q.length) { process.env.AMF_SIGNAL_QUERY = q.join(','); console.error(`[adapter-news] signal query for "${brand}": ${q.join(', ')}`); }
  }
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(projectId);
  const targets = which === 'all' ? Object.values(PROVIDERS) : [PROVIDERS[which]].filter(Boolean);
  if (!targets.length) { console.error(`unknown provider: ${which}`); storage.close(); process.exit(2); }
  let total = 0;
  for (const p of targets) {
    const skip = p.gate();
    if (skip) { console.error(`[adapter-news] ${p.id}: skipped (${skip}) — P6 safely-endable`); continue; }
    try {
      const items = await p.fetch();
      const n = ingest(storage, p, items);
      total += n;
      console.error(`[adapter-news] ${p.id}: ✅ ${n} item(s) → corpus`);
    } catch (e) { console.error(`[adapter-news] ${p.id}: failed — ${e.message}`); }
  }
  console.error(`[adapter-news] total ${total} item(s) → "${projectId}"`);
  storage.close();
  process.exit(0);
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'adapter-news-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage('news-test');

  const w = ingest(storage, worldmonitor, [
    { title: 'get_world_brief', content: 'Energy: a chokepoint disruption in the Strait of Hormuz lifts Brent; Gulf supply-chain risk rises.', category: 'energy', sources: ['https://ex/wm/1'] },
  ]);
  const f = ingest(storage, feedly, [
    { title: 'Luxury safari demand rebounds', content: 'Luxury safari demand rebounds — Okavango Delta camps report record forward bookings into 2027.', category: 'Emporium-Safari', sources: ['https://ex/feedly/1'] },
    { title: 'Hospitality AI concierge adoption', content: 'Hospitality AI concierge adoption accelerates among boutique hotels seeking 24/7 booking recovery.', category: 'hospitality', sources: ['https://ex/feedly/2'] },
  ]);
  // rss: prove the parser + ingest (the free, no-key path)
  const rssItems = parseFeed('<?xml version="1.0"?><rss version="2.0"><channel><item><title>Boutique hotel AI concierge</title><description><![CDATA[Hotels recover after-hours bookings.]]></description><link>https://ex/rss/1</link><pubDate>Mon, 01 Jul 2026 08:00:00 GMT</pubDate></item></channel></rss>');
  const r = ingest(storage, rss, rssItems);
  // engagement: prove a crowd-scored HN signal carries metadata.engagement through ingest
  const e = ingest(storage, hackernews, [
    { title: 'Voice deepfake fraud hits a bank call-centre', content: 'Voice deepfake fraud hits a bank call-centre', category: 'hn:deepfake', sources: ['https://news.ycombinator.com/item?id=1'], engagement: 342, published: new Date().toISOString() },
  ]);
  const engObs = storage.getObservations([stableId(`hackernews|Voice deepfake fraud hits a bank call-centre|Voice deepfake fraud hits a bank call-centre`)]);
  const engWritten = engObs[0]?.metadata?.engagement;
  const hits = storage.searchObservations('"energy" OR "safari" OR "hospitality" OR "concierge" OR "hotel" OR "deepfake"', 10);
  const types = new Set(hits.map((h) => h.type));
  const ok = w === 1 && f === 2 && r === 1 && e === 1 && engWritten === 342 && rssItems[0]?.sources[0] === 'https://ex/rss/1' && types.has('world_brief') && types.has('feed_article') && types.has('engagement_signal');
  const q = deriveSignalQuery('voiceidvault');
  console.error(`\nadapter-news smoke — corpus-write path (worldmonitor + feedly + rss + engagement)`);
  console.error(`  worldmonitor ${w}/1 · feedly ${f}/2 · rss ${r}/1 · hackernews ${e}/1 (engagement=${engWritten})`);
  console.error(`  --brand voiceidvault → signal query: ${q.join(', ')}`);
  console.error(`  search → ${hits.length} hits, types: ${[...types].join(', ')}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — providers wired + gated; HN/Reddit engagement flows to metadata; live calls need only a UA (P4)\n`);
  storage.close();
  const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

const a = process.argv;
if (a.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else {
  const pi = a.indexOf('--provider'); const pr = a.indexOf('--project'); const bi = a.indexOf('--brand');
  run(pi >= 0 ? a[pi + 1] : 'all', pr >= 0 ? a[pr + 1] : 'worldmonitor', bi >= 0 ? a[bi + 1] : process.env.AMF_BRAND).catch((e) => { console.error(e.message); process.exit(1); });
}
