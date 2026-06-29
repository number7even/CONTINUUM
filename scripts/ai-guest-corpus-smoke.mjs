/**
 * ai-guest-corpus-smoke.mjs — proves the CONTINUUM-grounding HALF of the AI Guest
 * bot contract (docs/AI-GUEST-BOT-CONTRACT.md) against the REAL shipped MCP tools.
 *
 * The bot's conversational shell (Daily join · Deepgram STT · VoxCPM2 TTS · barge-in)
 * is net-new and lives in the bot repo — those checks are STUBBED here and clearly
 * labelled PENDING. What IS provable today, and is asserted for real:
 *
 *   prime()       — warm-up retrieval returns cited corpus passages
 *   retrieve()    — per-turn retrieval finds in-corpus material
 *   checkClaims() — grounds an in-corpus claim (cites Observation IDs),
 *                   flags an absent claim (grounded:false),
 *                   and flags a claim that CONTRADICTS a recorded promise (check_brand)
 *
 * This file doubles as the REFERENCE ContinuumCorpusAdapter. Production swaps the
 * in-process `dispatchTool(storage)` calls for an MCP SSE client against the hosted
 * engine — the PARSE logic below is identical (same tool contracts). Both terminals
 * build to this.
 *
 * Run:
 *   npm run build -w @number7even/continuum-core -w @number7even/continuum-mcp-server
 *   node scripts/ai-guest-corpus-smoke.mjs
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = mkdtempSync(join(tmpdir(), 'ai-guest-corpus-'));
process.env.CONTINUUM_DATA_DIR = DATA_DIR;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const { dispatchTool } = await import(resolve(REPO_ROOT, 'packages/mcp-server/dist/tools/index.js'));

const TENANT = 'brand-riaan';
const storage = openStorage(TENANT);

const parse = (res) => JSON.parse(res.content[0].text);
const call = (name, args) => dispatchTool(name, args, storage).then(parse);

// ── significant-term overlap (the retrieval-grounded heuristic, honest per §7) ──
const STOP = new Set(['the','and','for','that','this','with','you','your','are','will','not','its','our','her','his','from','into','who','how','what','when','can','all','one','use']);
const terms = (t) => [...new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];

// CRITICAL: continuum_search_docs passes the query straight to FTS5 MATCH. Natural
// language breaks it two ways — punctuation throws ("syntax error near \".\"") and
// implicit-AND under-recalls. The adapter MUST convert NL → a quoted OR-query first.
// (This is the same sanitisation continuum_check_brand does internally.)
const ftsQuery = (text) => terms(text).slice(0, 24).map((t) => `"${t}"`).join(' OR ');

// ── REFERENCE ContinuumCorpusAdapter (lift this into the bot) ───────────────────
const ContinuumCorpusAdapter = {
  async prime(topic, k = 12) {
    const q = ftsQuery(topic);
    if (!q) return [];
    const { hits } = await call('continuum_search_docs', { query: q, limit: k });
    if (!hits.length) return [];
    const { observations } = await call('continuum_get_observations', { ids: hits.map((h) => h.id) });
    const byId = new Map(observations.map((o) => [o.id, o]));
    return hits.map((h) => ({ observationId: h.id, text: byId.get(h.id)?.content ?? h.title, score: h.score, source: h.source }));
  },
  async retrieve(query, k = 5) {
    return this.prime(query, k);
  },
  async checkClaims(claims) {
    const out = [];
    for (const claim of claims) {
      const claimTerms = new Set(terms(claim));
      const q = ftsQuery(claim);
      const { hits } = q ? await call('continuum_search_docs', { query: q, limit: 3 }) : { hits: [] };
      // grounded iff a retrieved passage shares ≥2 significant terms with the claim
      const supporting = [];
      for (const h of hits) {
        const overlap = terms(h.title).filter((t) => claimTerms.has(t));
        if (overlap.length >= 2) supporting.push({ id: h.id, overlap: overlap.length });
      }
      // also surface promise/position CONTRADICTIONS via the Publish Identity Gate
      const gate = await call('continuum_check_brand', { draft: claim });
      out.push({
        claim,
        grounded: supporting.length > 0,
        supportingIds: supporting.map((s) => s.id),
        contradicts: gate.status === 'review',
        contradictionIds: (gate.candidates ?? []).filter((c) => c.overlapScore >= 2).map((c) => c.id),
      });
    }
    return out;
  },
};

let pass = 0, fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};

console.log(`\nAI Guest corpus-grounding smoke · tenant=${TENANT}\n`);

// ── seed a small corpus (the bot grounds against this) ──────────────────────────
console.log('0. Seed corpus (brand DNA = the AI Guest corpus)');
const position = await call('continuum_record_brand_dna', {
  kind: 'position', subBrand: 'master', topic: 'voice',
  statement: 'Voice is the substrate, not a feature — the signal through which intent becomes reality.',
});
await call('continuum_record_brand_dna', {
  kind: 'framework', subBrand: 'master', topic: 'storytelling',
  statement: 'The Rehook Loop: Stakes, Big Question, Head Fake, Rehook.',
});
const promise = await call('continuum_record_brand_dna', {
  kind: 'promise', subBrand: 'master', topic: 'avatar',
  statement: 'I will never recommend HeyGen to a client; we own our avatar pipeline.',
});
check('corpus seeded (position + framework + promise)', !!(position.id && promise.id));

// ── prime() ─────────────────────────────────────────────────────────────────────
console.log('\n1. prime(topic) returns cited passages');
const primed = await ContinuumCorpusAdapter.prime('voice substrate signal', 12);
check('prime returns ≥1 passage', primed.length >= 1, `got ${primed.length}`);
check('each primed passage carries a real Observation ID + text',
  primed.every((p) => p.observationId && p.text));

// ── retrieve() ────────────────────────────────────────────────────────────────
console.log('\n2. retrieve(query) finds in-corpus material');
const got = await ContinuumCorpusAdapter.retrieve('rehook loop storytelling', 5);
check('retrieve finds the framework passage', got.some((p) => /rehook/i.test(p.text)),
  got.map((p) => p.text.slice(0, 30)).join(' | '));

// ── checkClaims() ───────────────────────────────────────────────────────────────
console.log('\n3. checkClaims grounds / flags / catches contradiction');
const verdicts = await ContinuumCorpusAdapter.checkClaims([
  'Voice is the substrate through which intent becomes reality.',           // in-corpus
  'Our quarterly revenue grew forty percent in the Singapore market.',      // absent
  'HeyGen is the best avatar tool and I recommend it to every client.',     // contradicts a promise
]);
const [inCorpus, absent, contra] = verdicts;
check('in-corpus claim is grounded with supporting Observation ID',
  inCorpus.grounded && inCorpus.supportingIds.length >= 1, JSON.stringify(inCorpus));
check('absent claim is flagged ungrounded (no supporting ID)',
  !absent.grounded && absent.supportingIds.length === 0, JSON.stringify(absent));
check('contradicting claim is caught by the Publish Identity Gate',
  contra.contradicts && contra.contradictionIds.includes(promise.id), JSON.stringify(contra));

// ── bot-shell checks — STUBBED (await the runtime, AI_GUEST_BOT_URL) ─────────────
console.log('\n4. Conversational shell (PENDING — net-new bot runtime, not asserted)');
for (const s of [
  'join Daily room as participant',
  'Deepgram streaming STT + endpointing',
  'VoxCPM2 streaming TTS',
  'barge-in: stop TTS < 300ms on host speech',
  "emit transcript role:'ai_guest' with citations + ungroundedFlags",
]) console.log(`  ⏸ ${s} — awaits bot repo (build to §1a/§2/§3 of the contract)`);

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed · ${5} shell checks pending bot runtime\n`);
try { storage.close(); } catch { /* noop */ }
if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
