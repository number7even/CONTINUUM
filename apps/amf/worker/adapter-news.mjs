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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** sha256(seed) → UUID-shape stable id (same convention as the docs adapter). */
function stableId(seed) {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
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

const PROVIDERS = { worldmonitor, feedly };

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
      metadata: { provider: provider.id, category: it.category, sources: it.sources || [] },
    };
    if (storage.upsertObservation(obs)) written += 1; // null = privacy-scrubbed
  }
  return written;
}

async function run(which, projectId) {
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
  const hits = storage.searchObservations('"energy" OR "safari" OR "hospitality" OR "concierge"', 10);
  const types = new Set(hits.map((h) => h.type));
  const ok = w === 1 && f === 2 && types.has('world_brief') && types.has('feed_article');
  console.error(`\nadapter-news smoke — corpus-write path (worldmonitor + feedly)`);
  console.error(`  worldmonitor ${w}/1 · feedly ${f}/2 · search → ${hits.length} hits, types: ${[...types].join(', ')}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — both providers wired + gated; live calls need their keys (untested without, P4)\n`);
  storage.close();
  const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

const a = process.argv;
if (a.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else {
  const pi = a.indexOf('--provider'); const pr = a.indexOf('--project');
  run(pi >= 0 ? a[pi + 1] : 'all', pr >= 0 ? a[pr + 1] : 'worldmonitor').catch((e) => { console.error(e.message); process.exit(1); });
}
