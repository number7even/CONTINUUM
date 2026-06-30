/**
 * adapter-news.mjs — the LEGIT L2 brain: WorldMonitor (MCP) → CONTINUUM corpus.
 *
 * The ethical replacement for the killed Agent-Reach: instead of cookie-scraping
 * walled gardens, this consumes WorldMonitor's HOSTED MCP server (39 tools, 500+
 * curated feeds, AI-synthesized) as a peer MCP server, and writes each brief as a
 * privacy-filtered CONTINUUM Observation — sourced, searchable, brand-filterable.
 * No AGPL exposure (we are an API client of their SaaS, not integrating their code).
 *
 * Pipeline:  WorldMonitor /mcp  ──get_world_brief / get_news_intelligence──►  Observation[]
 *            (X-WorldMonitor-Key)                                              (FTS5 corpus)
 * "Today's topic" = query that corpus, scored against your product pillars.
 *
 *   WORLDMONITOR_API_KEY=wm_… node adapter-news.mjs [--project worldmonitor]
 *   node adapter-news.mjs --smoke      # proves the CONTINUUM-write path (mock briefs)
 *
 * HONEST (P4): the live WorldMonitor call is GATED on the key + UNTESTED without one
 * (same discipline as the Auphonic/whisperx seams). The corpus-write half IS proven.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WM_URL = process.env.WORLDMONITOR_MCP_URL || 'https://worldmonitor.app/mcp';
const SOURCE_ID = 'worldmonitor';
const DEFAULT_TOOLS = ['get_world_brief', 'get_news_intelligence'];

/** sha256(seed) → UUID-shape stable id (same convention as the docs adapter). */
function stableId(seed) {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Live WorldMonitor MCP call (gated; untested without a key). Uses the MCP SDK
 *  StreamableHTTP transport with the X-WorldMonitor-Key header. */
async function callWorldMonitor(tool, args = {}) {
  const key = process.env.WORLDMONITOR_API_KEY;
  if (!key) throw new Error('WORLDMONITOR_API_KEY not set');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const headers = { 'X-WorldMonitor-Key': key };
  const client = new Client({ name: 'continuum-adapter-news', version: '0.0.1' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(WM_URL), { requestInit: { headers } });
  try {
    await client.connect(transport);
    const res = await client.callTool({ name: tool, arguments: args });
    const text = res?.content?.find((c) => c.type === 'text')?.text ?? '';
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* plain text brief */ }
    return { tool, text, parsed };
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}

/** Map a WorldMonitor result → a CONTINUUM Observation input (stable id, sources in metadata). */
function briefToObservation(tool, text, parsed) {
  const content = typeof text === 'string' && text.trim() ? text : JSON.stringify(parsed ?? {});
  const sources = parsed?.sources || parsed?.links || [];
  const category = parsed?.category || tool.replace(/^get_/, '');
  return {
    id: stableId(`${tool}|${content}`),
    sourceId: SOURCE_ID,
    type: 'world_brief',
    content,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: { tool, category, sources, ingestedFrom: 'worldmonitor-mcp' },
  };
}

/** The testable core: upsert briefs into the CONTINUUM corpus. Returns count written. */
export function ingestBriefs(storage, observations) {
  storage.upsertSource(SOURCE_ID, 'docs', { adapter: 'news', provider: 'worldmonitor' });
  let written = 0;
  for (const obs of observations) {
    const r = storage.upsertObservation(obs);
    if (r) written += 1; // null = scrubbed entirely by the privacy filter
  }
  return written;
}

async function run(projectId) {
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(projectId);
  if (!process.env.WORLDMONITOR_API_KEY) {
    console.error('[adapter-news] WORLDMONITOR_API_KEY not set → skipping live ingest (P6 safely-endable).');
    console.error('               Get an API Starter+ key (wm_…) at worldmonitor.app, put it in .env.local.');
    storage.close();
    process.exit(0);
  }
  const obs = [];
  for (const tool of DEFAULT_TOOLS) {
    try {
      const { text, parsed } = await callWorldMonitor(tool);
      obs.push(briefToObservation(tool, text, parsed));
      console.error(`[adapter-news] ${tool} → 1 brief`);
    } catch (e) {
      console.error(`[adapter-news] ${tool} failed: ${e.message}`);
    }
  }
  const written = ingestBriefs(storage, obs);
  console.error(`[adapter-news] ✅ ${written} world brief(s) → corpus "${projectId}" (source=${SOURCE_ID})`);
  storage.close();
  process.exit(written > 0 ? 0 : 1);
}

async function smoke() {
  // Prove the CONTINUUM-write half WITHOUT a key, using mock briefs.
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'adapter-news-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage('worldmonitor-test');

  const mock = [
    briefToObservation('get_world_brief', 'Energy: a tanker chokepoint disruption in the Strait of Hormuz lifts Brent; supply-chain risk rises across Gulf routes.', { category: 'energy', sources: ['https://example/wm/1'] }),
    briefToObservation('get_news_intelligence', 'Cyber: a coordinated intrusion campaign targets industrial control systems across European utilities.', { category: 'cyber', sources: ['https://example/wm/2'] }),
  ];
  const written = ingestBriefs(storage, mock);
  const hits = storage.searchObservations('"energy" OR "chokepoint" OR "cyber"', 10).filter((h) => h.type === 'world_brief');
  const ok = written === 2 && hits.length >= 1;
  console.error(`\nadapter-news smoke — corpus-write path`);
  console.error(`  wrote ${written}/2 briefs · search('energy/cyber') → ${hits.length} world_brief hit(s)`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — WorldMonitor MCP client is wired + gated; live call needs WORLDMONITOR_API_KEY (untested without it, P4)\n`);
  storage.close();
  const dir = process.env.CONTINUUM_DATA_DIR;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

const arg = process.argv[2];
if (arg === '--smoke') smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else {
  const pIdx = process.argv.indexOf('--project');
  run(pIdx >= 0 ? process.argv[pIdx + 1] : 'worldmonitor').catch((e) => { console.error(e.message); process.exit(1); });
}
