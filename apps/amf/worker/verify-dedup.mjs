// verify-dedup.mjs — proof-gate for the story-freshness dedup stage (AMF adopt of "eligible-before-collect").
//
// Proves the gate collapses re-drafted stories WITHOUT losing distinct ones:
//   • the fingerprint is stable to case/punctuation/truncation noise (same story → same key);
//   • same brand + same story ⇒ duplicates, canonical = the EARLIEST (the original);
//   • the SAME story under a DIFFERENT brand is a distinct angle, NOT merged;
//   • an empty headline is never a "duplicate" (no false collapse);
//   • loadSeenFingerprints / isDuplicateStory give the pipeline its "already told this?" memory (step 2);
//   • --suppress quarantines duplicates (reversible move, canonical kept) and is idempotent.
//
//   node verify-dedup.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REVIEW = mkdtempSync(join(tmpdir(), 'amf-dedup-'));
process.env.AMF_REVIEW_DIR = REVIEW;
const pending = join(REVIEW, 'pending');
mkdirSync(pending, { recursive: true });

const { normalizeHeadline, fingerprint, scanBucket, findDuplicateGroups, loadSeenFingerprints, isDuplicateStory } =
  await import(new URL('./dedup.mjs', import.meta.url).href);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const put = (id, slug, headline, queuedAt) => writeFileSync(join(pending, `${id}.json`), JSON.stringify({ id, slug, brief: { headline }, queuedAt }));

console.log('── fingerprint identity ────────────────────────────────────────────────');
const a = fingerprint({ slug: 'continuum', brief: { headline: 'Codebase memory is now a race — can your AI agent prove it' } });
const b = fingerprint({ slug: 'continuum', brief: { headline: 'CODEBASE Memory is now a RACE: can your AI agent PROVE it???' } });
check('same story survives case + punctuation noise → same key', a.key === b.key, a.norm.slice(0, 40));
const cross = fingerprint({ slug: 'voicecosmos', brief: { headline: 'Codebase memory is now a race — can your AI agent prove it' } });
check('same headline, different brand → different key (distinct angle)', a.key !== cross.key);
check('normalizeHeadline drops stopwords + short tokens', !normalizeHeadline('the AI is on a race').split(' ').includes('the'));

console.log('── collapse the real-world shape (15-copy problem, in miniature) ────────');
put('c-01', 'continuum', 'Codebase memory is now a race — can your AI agent prove it', '2026-07-06T01:00');
put('c-02', 'continuum', 'Codebase Memory is now a RACE: can your agent PROVE it??', '2026-07-07T01:00');
put('c-03', 'continuum', 'codebase memory is now a race can your ai agent prove it', '2026-07-08T01:00');
put('v-01', 'voicecosmos', 'Codebase memory is now a race — can your AI agent prove it', '2026-07-06T01:00');
put('c-04', 'continuum', 'A different story entirely about spa booking recovery', '2026-07-09T01:00');
put('c-05', 'continuum', '', '2026-07-10T01:00');   // empty headline — must never collapse
const groups = findDuplicateGroups(scanBucket('pending'));
check('exactly one duplicate group found', groups.length === 1, `${groups.length} group(s)`);
check('the 3 same-brand copies collapse to 1 (2 duplicates)', groups[0]?.duplicates.length === 2);
check('canonical = the earliest draft (the original story)', groups[0]?.canonical.rec.id === 'c-01', groups[0]?.canonical.rec.id);
check('the cross-brand draft is NOT swept in', !groups[0]?.duplicates.some(d => d.rec.id === 'v-01') && groups[0]?.canonical.rec.id !== 'v-01');
check('the distinct story + the empty-headline draft are untouched', !groups.some(g => g.duplicates.some(d => ['c-04', 'c-05'].includes(d.rec.id))));

console.log('── the pipeline memory (step-2 eligibility test) ───────────────────────');
const seen = loadSeenFingerprints();
check('a story already in the queue is flagged as a duplicate', isDuplicateStory({ slug: 'continuum', brief: { headline: 'Codebase memory is now a RACE — can your agent prove it?!' } }, seen) === true);
check('a brand-new story is NOT flagged', isDuplicateStory({ slug: 'continuum', brief: { headline: 'Direct booking surges after voice concierge launch' } }, seen) === false);

console.log('── --suppress is reversible + idempotent ───────────────────────────────');
const { execFileSync } = await import('node:child_process');
const run = () => execFileSync(process.execPath, [new URL('./dedup.mjs', import.meta.url).pathname, '--suppress'], { encoding: 'utf8', env: { ...process.env, AMF_REVIEW_DIR: REVIEW } });
run();
const afterPending = readdirSync(pending).filter(f => f.endsWith('.json'));
const quarantined = readdirSync(join(REVIEW, 'duplicates')).filter(f => f.endsWith('.json'));
check('duplicates moved to duplicates/ (not deleted), canonicals kept in pending', quarantined.length === 2 && afterPending.includes('c-01.json') && !afterPending.includes('c-03.json'));
run(); // second pass — nothing left to move
check('re-running suppress is idempotent (no further moves)', readdirSync(join(REVIEW, 'duplicates')).length === 2);

rmSync(REVIEW, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('DEDUP_VERIFY: GREEN — a re-drafted story collapses to its earliest original; distinct stories and');
  console.log('cross-brand angles survive; the pipeline gains an "already told this?" memory; suppress is reversible.');
  process.exit(0);
} else { console.log('DEDUP_VERIFY: RED'); process.exit(1); }
