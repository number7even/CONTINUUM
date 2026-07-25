// verify-matcher-dedup.mjs — proves the freshness gate is WIRED into content-matcher (step 2).
//
// The standalone gate proved the fingerprint logic. This proves the matcher USES it, keyed on the
// SOURCE SIGNAL (stable) rather than the drafted headline (which the LLM rewords run-to-run). So the
// test is DRAFT-MODE-INDEPENDENT — it holds whether the draft was templated or LLM-authored:
//   • empty queue → drafts the top story and stamps its signal storyKey on the draft;
//   • that story already in the queue → the matcher SKIPS it and PROMOTES the next-freshest signal;
//   • every candidate already told → honest skip (exit 3), no duplicate emitted.
//
//   node verify-matcher-dedup.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = resolve(HERE, '../../..');
const DATA = mkdtempSync(join(tmpdir(), 'amf-mdedup-data-'));
const REVIEW = mkdtempSync(join(tmpdir(), 'amf-mdedup-queue-'));
const PROJECT = 'mdedup-test';
const SLUG = 'testbrand';
const PILLARS = 'hotel,booking,revenue,concierge';

const { signalStoryKey } = await import(new URL('./dedup.mjs', import.meta.url).href);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

// Two stories; both match the pillars. Signal storyKeys computed exactly as the matcher will.
const STORY_A = 'Hotels face a revenue leak from no-show bookings. A concierge recovers the guest booking.';
const STORY_B = 'Direct booking surges after a voice concierge launch lifts hotel revenue. Guests self-serve.';
const KEY_A = signalStoryKey(SLUG, { content: STORY_A });
const KEY_B = signalStoryKey(SLUG, { content: STORY_B });

// ANTHROPIC_API_KEY='' forces template drafting → the gate stays OFFLINE + deterministic for smoke
// (the assertions are storyKey-based, so draft mode is irrelevant to what's proven).
const env = { ...process.env, CONTINUUM_DATA_DIR: DATA, CONTINUUM_STORAGE_BACKEND: 'sqlite', AMF_REVIEW_DIR: REVIEW, ANTHROPIC_API_KEY: '' };

// Seed the two signals.
const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
process.env.CONTINUUM_DATA_DIR = DATA; process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
const s = await openStorage(PROJECT);
s.upsertSource('rss', 'docs', {});
const now = Date.now();
s.upsertObservation({ id: '1a111111-1111-1111-1111-111111111111', sourceId: 'rss', type: 'feed_article', content: STORY_A, timestamp: new Date(now - 0.5 * 86400000).toISOString(), refs: [], metadata: { sources: ['https://skift.com/x'] } });
s.upsertObservation({ id: '2b222222-2222-2222-2222-222222222222', sourceId: 'rss', type: 'feed_article', content: STORY_B, timestamp: new Date(now - 2.0 * 86400000).toISOString(), refs: [], metadata: { sources: ['https://phocuswire.com/y'] } });
s.close();

const seedQueueKeys = (keys) => {
  rmSync(join(REVIEW, 'pending'), { recursive: true, force: true });
  const p = join(REVIEW, 'pending'); mkdirSync(p, { recursive: true });
  keys.forEach((k, i) => writeFileSync(join(p, `seed-${i}.json`), JSON.stringify({ id: `seed-${i}`, slug: SLUG, brief: { headline: `seeded ${i}`, storyKey: k }, queuedAt: '2026-07-01T01:00' })));
};
const runMatcher = () => {
  const r = spawnSync(process.execPath, [join(HERE, 'content-matcher.mjs'), '--project', PROJECT, '--brand', SLUG, '--pillars', PILLARS], { encoding: 'utf8', env });
  return { code: r.status, brief: (() => { try { return JSON.parse(r.stdout); } catch { return {}; } })(), stderr: r.stderr || '' };
};

console.log('── baseline · empty queue → drafts a top story + stamps its signal key ──');
seedQueueKeys([]);
const base = runMatcher();
const topKey = base.brief.storyKey;
check('drafts a story and stamps its signal storyKey', [KEY_A, KEY_B].includes(topKey), topKey);
check('nothing skipped on an empty queue', base.code === 0 && !!base.brief.headline);

console.log('── the wire · that story already drafted → PROMOTE the other ───────────');
seedQueueKeys([topKey]);                              // the top story is now "already told"
const promoted = runMatcher();
const otherKey = topKey === KEY_A ? KEY_B : KEY_A;
check('the matcher SKIPPED the already-drafted story', /skipped=([1-9])/.test(promoted.stderr), (promoted.stderr.match(/skipped=\d+/) || [''])[0]);
check('and PROMOTED the OTHER signal (different storyKey)', promoted.brief.storyKey === otherKey, promoted.brief.storyKey);
check('no duplicate: it did not re-draft the seen story', promoted.brief.storyKey !== topKey);

console.log('── exhaustion · every candidate already told → honest skip (exit 3) ────');
seedQueueKeys([KEY_A, KEY_B]);
const exhausted = runMatcher();
check('all-drafted → exits 3, emits no duplicate', exhausted.code === 3 && /no fresh story/i.test(exhausted.stderr), `exit ${exhausted.code}`);

rmSync(DATA, { recursive: true, force: true });
rmSync(REVIEW, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('MATCHER_DEDUP_VERIFY: GREEN — the freshness gate is wired on the SOURCE SIGNAL (draft-mode-independent):');
  console.log('an already-told story is skipped, the next-freshest is promoted, exhaustion is an honest skip.');
  process.exit(0);
} else { console.log('MATCHER_DEDUP_VERIFY: RED'); process.exit(1); }
