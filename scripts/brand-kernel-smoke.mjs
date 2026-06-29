/**
 * brand-kernel-smoke.mjs — proves the Brand Kernel (Layer-0) end-to-end against
 * the real engine: record Brand DNA → the Publish Identity Gate surfaces a
 * contradicting prior commitment WITH its Observation ID, and clears an on-brand
 * draft. Nested-brand inheritance proven: a `voicecosmos` draft is caught by a
 * `master` promise it would break.
 *
 * Run:
 *   npm run build -w @number7even/continuum-core -w @number7even/continuum-mcp-server
 *   node scripts/brand-kernel-smoke.mjs
 *
 * Deterministic + isolated: forces the sqlite backend and a throwaway data dir.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Isolate: throwaway data dir + deterministic V0 backend (no heavy hybrid deps).
const DATA_DIR = mkdtempSync(join(tmpdir(), 'brand-kernel-'));
process.env.CONTINUUM_DATA_DIR = DATA_DIR;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const { dispatchTool } = await import(resolve(REPO_ROOT, 'packages/mcp-server/dist/tools/index.js'));

const TENANT = 'brand-riaan';
const storage = openStorage(TENANT);

let pass = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${detail ? `— ${detail}` : ''}`); }
};

async function call(name, args) {
  const res = await dispatchTool(name, args, storage);
  return JSON.parse(res.content[0].text);
}

console.log(`\nBrand Kernel smoke · tenant=${TENANT} · ${DATA_DIR}\n`);

// ── 1. Record Brand DNA (the four primitive kinds, nested) ───────────────────
console.log('1. Record Brand DNA');
const heygenPromise = await call('continuum_record_brand_dna', {
  kind: 'promise',
  statement: 'I will never recommend HeyGen to a client — we own our avatar pipeline end to end.',
  subBrand: 'master',
  topic: 'avatar',
});
check('master promise recorded with an Observation ID', !!heygenPromise.id, JSON.stringify(heygenPromise));
check('promise stored under subBrand=master', heygenPromise.subBrand === 'master');

const position = await call('continuum_record_brand_dna', {
  kind: 'position', subBrand: 'master', topic: 'video',
  statement: 'Faceless AI video is a race to the bottom; a real founder face builds trust.',
});
const framework = await call('continuum_record_brand_dna', {
  kind: 'framework', subBrand: 'master', topic: 'storytelling',
  statement: 'The Rehook Loop: Stakes → Big Question → Head Fake → Rehook.',
});
const persona = await call('continuum_record_brand_dna', {
  kind: 'persona', subBrand: 'voicecosmos', topic: 'hospitality',
  statement: 'Independent boutique-hotel operators who distrust generic chatbots.',
});
check('position / framework / persona all recorded', !!(position.id && framework.id && persona.id));

// ── 2. Publish Identity Gate FLAGS a contradicting sub-brand draft ───────────
console.log('\n2. Gate flags a contradiction (nested: voicecosmos inherits master)');
const badDraft = await call('continuum_check_brand', {
  subBrand: 'voicecosmos',
  draft: 'Honestly the fastest way to scale avatar video is to just use HeyGen — I recommend HeyGen to every client now.',
});
check('gate returns status=review', badDraft.status === 'review', `got ${badDraft.status}`);
const surfaced = badDraft.candidates.find((c) => c.id === heygenPromise.id);
check('the contradicting master promise is surfaced by its Observation ID', !!surfaced,
  `candidate ids: ${badDraft.candidates.map((c) => c.id).join(', ')}`);
check('surfaced promise carries the master subBrand (inherited by voicecosmos)',
  surfaced?.subBrand === 'master');
check('surfaced candidate shows the overlapping terms (incl. "heygen")',
  !!surfaced && surfaced.sharedTerms.includes('heygen'),
  surfaced ? surfaced.sharedTerms.join(',') : 'n/a');

// ── 3. Gate CLEARS an on-brand draft ─────────────────────────────────────────
console.log('\n3. Gate clears an on-brand draft');
const goodDraft = await call('continuum_check_brand', {
  subBrand: 'voicecosmos',
  draft: 'Boutique hotel teams deserve a concierge that sounds human. Here is how we tune ours for warmth.',
});
check('on-brand draft is not flagged for review', goodDraft.status === 'clear', `got ${goodDraft.status}`);

// ── 4. FTS5 safety: a punctuation-heavy draft must not throw ─────────────────
console.log('\n4. FTS5-safety on adversarial punctuation');
let threw = false;
try {
  await call('continuum_check_brand', { draft: 'AND OR "NEAR" * : (foo) -bar ^^^ \\\\ test??!' });
} catch (e) { threw = true; console.log(`    error: ${e.message}`); }
check('gate survives raw FTS5 operators / punctuation in the draft', !threw);

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed\n`);
try { storage.close(); } catch { /* noop */ }
if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
