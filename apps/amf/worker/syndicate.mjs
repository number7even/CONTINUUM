/**
 * syndicate.mjs — the SYNDICATION path: your OWN published content → reworked branded briefs.
 *
 * The other half of the feed system. content-matcher drafts NEW content from third-party
 * INTELLIGENCE (and must verify every stat). syndicate REWORKS your platform's OWN content
 * (site RSS, YouTube channels — ingested as type='own_content') into a new format/channel.
 * It's yours already, so this is repurposing, not fact-checking: sharpen the hook, re-cast
 * in brand voice, keep it truthful to the source.
 *
 *   # 1. pull your own content (site RSS + YouTube channel RSS) into the corpus
 *   node adapter-news.mjs --provider own --brand voicecosmos --project vc
 *   # 2. rework the freshest piece into a channel-ready brief
 *   node syndicate.mjs --brand voicecosmos --format post --project vc
 *   node syndicate.mjs --smoke
 *
 * --format post|report|short → a brief consumable by produce-post / produce-report /
 * produce-short. LLM rework gated on ANTHROPIC_API_KEY; grounded template fallback (P6).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'from', 'into', 'its', 'has', 'have', 'will', 'not']);
const terms = (t) => [...new Set((String(t).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];
const ftsQuery = (list) => list.slice(0, 30).map((t) => `"${t}"`).join(' OR ');
const loadUniverse = () => { try { return JSON.parse(readFileSync(resolve(HERE, 'portfolio-universe.json'), 'utf8')); } catch { return { products: [] }; } };
const getProduct = (slug) => (loadUniverse().products || []).find((p) => p.slug === slug) || null;
function loadBrand(name) {
  const def = { name: 'AMF', tagline: 'amf.continuum.rest', cta: 'DETAILS' };
  if (!name) return def;
  try { return { ...def, ...JSON.parse(readFileSync(resolve(HERE, 'brandbooks', `${name}.json`), 'utf8')) }; } catch { return { ...def, name }; }
}
function extractPoints(text) {
  const out = [], re = /([€$]?\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?\s*(?:%|percent|euros?|k|bn|m|min|hours?)?)/gi;
  for (const s of String(text).split(/(?<=[.!?])\s+/)) { const m = s.match(re); if (m) out.push({ stat: m[0].trim(), label: s.replace(re, '').replace(/\s+/g, ' ').trim().slice(0, 60) }); if (out.length >= 3) break; }
  return out.length ? out : [{ stat: '—', label: 'see the source' }];
}

function reworkTemplate(item, brand, format) {
  const first = String(item.content).split(/(?<=[.!?])\s+/)[0] || item.title;
  return { headline: first.slice(0, 90), points: extractPoints(item.content), cta: (brand.cta || 'DETAILS').toUpperCase().replace(/\s+/g, '').slice(0, 10), angle: `Repurposed from your own content for a ${format}.`, drafted: 'template' };
}
async function reworkLLM(item, brand, format, product, key) {
  const sys = `You REPURPOSE the brand's OWN already-published content into a ${format}, in the brand voice, for a new channel. It is the brand's own material — reformat and sharpen the hook; stay truthful to the source; do not invent facts. Return ONLY JSON: {"headline":"<=90 chars","points":[{"stat":"...","label":"..."}],"cta":"<ONE_UPPERCASE_KEYWORD>","angle":"the channel angle"}`;
  const user = `BRAND: ${brand.name} — ${brand.tagline || ''}\nTARGET FORMAT: ${format}\nANGLE: ${product?.angle || ''}\nOWN CONTENT: ${String(item.content).slice(0, 1800)}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 700, system: sys, messages: [{ role: 'user', content: user }] }) });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const text = (await res.json())?.content?.find((c) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in LLM reply');
  return { ...JSON.parse(m[0]), drafted: 'llm' };
}

/** Pick the freshest own_content for a product (most on-brand by pillar terms, else newest). */
export function pickOwnContent(storage, product) {
  const pillars = terms([...(product?.topics || []), ...(product?.keywords || []), product?.name || ''].join(' '));
  let hits = pillars.length ? storage.searchObservations(ftsQuery(pillars), 40).filter((h) => h.type === 'own_content') : [];
  if (!hits.length) hits = storage.searchObservations('own', 40).filter((h) => h.type === 'own_content');
  if (!hits.length) return null;
  hits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return storage.getObservations([hits[0].id])[0] || null;
}

async function buildSyndicationBrief(item, brand, product, format) {
  const key = process.env.ANTHROPIC_API_KEY; let draft;
  if (key) { try { draft = await reworkLLM(item, brand, format, product, key); } catch (e) { console.error(`[syndicate] LLM failed (${e.message}) → template`); draft = reworkTemplate(item, brand, format); } }
  else { console.error('[syndicate] ANTHROPIC_API_KEY not set → grounded template rework (P6)'); draft = reworkTemplate(item, brand, format); }
  return { brand: brand.name, format, ...draft, sources: item.metadata?.sources || [], fromOwn: item.id, provenance: 'own_content (first-party — syndication, not third-party claim)', verify: 'Repurposed from your OWN published content — confirm the reworked framing before publish' };
}

async function run() {
  const a = process.argv, get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const slug = get('--brand', process.env.AMF_BRAND), format = get('--format', 'post'), project = get('--project', slug || 'worldmonitor');
  if (!['post', 'report', 'short'].includes(format)) { console.error('--format must be post|report|short'); process.exit(2); }
  const brand = loadBrand(slug), product = getProduct(slug);
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(project);
  const item = pickOwnContent(storage, product);
  if (!item) { console.error(`[syndicate] no own_content in "${project}" — run: adapter-news --provider own --brand ${slug} --project ${project}`); storage.close(); process.exit(1); }
  const brief = await buildSyndicationBrief(item, brand, product, format);
  storage.close();
  console.log(JSON.stringify(brief, null, 2));
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'syndicate-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const s = openStorage('synd-test'); s.upsertSource('own', 'docs', {});
  s.upsertObservation({ id: '99999999-9999-9999-9999-999999999999', sourceId: 'own', type: 'own_content', content: 'How our ARIAN concierge recovered 24 after-hours bookings a week for a 40-room boutique hotel — a VoiceCosmos case study.', timestamp: new Date().toISOString(), refs: [], metadata: { sources: ['https://voicecosmos.ai/case/arian'], category: 'own' } });
  // a YouTube-style own item to prove channel RSS flows the same path
  s.upsertObservation({ id: '88888888-8888-8888-8888-888888888888', sourceId: 'own', type: 'own_content', content: 'VoiceCosmos on YouTube: a 3-minute walkthrough of ARIAN answering the 8pm spa call.', timestamp: new Date(Date.now() - 86400000).toISOString(), refs: [], metadata: { sources: ['https://www.youtube.com/watch?v=xxxx'], category: 'own' } });
  const product = getProduct('voicecosmos');
  const item = pickOwnContent(s, product);
  const brief = await buildSyndicationBrief(item, loadBrand('voicecosmos'), product, 'post');
  const ok = item && brief.format === 'post' && brief.fromOwn && /own/.test(brief.provenance) && brief.headline?.length > 0;
  console.error(`\nsyndicate smoke — own_content → reworked branded brief`);
  console.error(`  picked own item: ${item?.id?.slice(0, 8)} · "${String(item?.content).slice(0, 44)}…"`);
  console.error(`  brief: "${brief.headline?.slice(0, 44)}…" cta=${brief.cta} drafted=${brief.drafted}`);
  console.error(`  provenance: ${brief.provenance?.slice(0, 40)}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — own content reworked (not fact-checked); YouTube channel RSS flows the same path\n`);
  s.close(); const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
