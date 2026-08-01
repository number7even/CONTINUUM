// dedup.mjs — the story-freshness gate for the AMF content pipeline.
//
// Clean-room adopt of the "discover ELIGIBLE items before you collect/process" pattern (seen in
// Repomix's fileSearch stage; reimplemented here from the idea, not the code). Our factory drafts
// the top-ranked signal every run — so a topic that keeps re-reporting (a fresh news observation
// each day, same story) gets RE-DRAFTED daily. That is why the review queue accumulated 15 near-
// identical "codebase-memory-mcp…" drafts. This module gives the pipeline a memory of which
// STORIES it has already drafted, so a story is drafted ONCE and the next-freshest signal is
// promoted instead of a duplicate.
//
// Identity: a story = (brand slug) × (normalized headline). Same brand + same story ⇒ duplicate.
// The SAME story under a DIFFERENT brand is a legitimately distinct angle and is NOT merged.
//
//   node dedup.mjs --report                 # scan pending, show the collapse (read-only)
//   node dedup.mjs --report --bucket approved
//   node dedup.mjs --suppress               # move duplicates → duplicates/ (keeps the earliest; reversible)
//   node dedup.mjs --smoke                  # self-test on a temp fixture
//
// AMF_REVIEW_DIR overrides the queue root (tests + non-invasive runs).
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REVIEW = () => process.env.AMF_REVIEW_DIR || join(HERE, 'out', 'review-queue');
const bucketDir = (s) => join(REVIEW(), s);

// Stopwords + short tokens carry no story identity — dropping them makes the fingerprint robust to
// filler and to headline truncation ("…Let's D" vs "…Let's Dig In" still share their real tokens).
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'with', 'is', 'are', 'was', 'be', 'your', 'you', 'how', 'why', 'what', 'it', 'its', 'that', 'this', 'as', 'by', 'from', 'can', 'now', 'vs']);

/** Reduce a headline to its stable story tokens: lowercase, alphanumeric, no stopwords/short bits. */
export function normalizeHeadline(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .join(' ');
}

/** The dedup identity of one draft record: brand slug × normalized headline → a short stable key. */
export function fingerprint(record) {
  const slug = record?.slug || record?.brief?.brand || 'unknown';
  const norm = normalizeHeadline(record?.brief?.headline);
  const key = createHash('sha256').update(`${slug}␟${norm}`).digest('hex').slice(0, 16);
  return { slug, norm, key };
}

/** Read a queue bucket into { file, rec, fp } entries (skips unreadable files, never throws). */
export function scanBucket(bucket) {
  const d = bucketDir(bucket);
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
    try {
      const rec = JSON.parse(readFileSync(join(d, f), 'utf8'));
      out.push({ file: f, rec, fp: fingerprint(rec) });
    } catch { /* corrupt/partial file — skip, don't crash the sweep */ }
  }
  return out;
}

/**
 * Group entries that share a fingerprint. The canonical (kept) draft is the EARLIEST by queuedAt
 * (the original story); the rest are the duplicates a fresh run should never have produced.
 */
export function findDuplicateGroups(entries) {
  const byKey = new Map();
  for (const e of entries) {
    if (e.fp.norm === '') continue; // an empty headline has no story identity — never a "duplicate"
    if (!byKey.has(e.fp.key)) byKey.set(e.fp.key, []);
    byKey.get(e.fp.key).push(e);
  }
  const groups = [];
  for (const [key, arr] of byKey) {
    if (arr.length < 2) continue;
    const sorted = arr.slice().sort((a, b) =>
      String(a.rec.queuedAt || a.rec.id).localeCompare(String(b.rec.queuedAt || b.rec.id)));
    groups.push({ key, slug: sorted[0].fp.slug, norm: sorted[0].fp.norm, canonical: sorted[0], duplicates: sorted.slice(1) });
  }
  // Biggest collapses first — the loudest wins in the report.
  return groups.sort((a, b) => b.duplicates.length - a.duplicates.length);
}

/** First sentence of a text — the stable "story" of a source signal (the LLM may reword the headline). */
export function firstSentence(text) {
  const s = String(text || '').trim();
  return (s.split(/(?<=[.!?])\s+/)[0] || s).trim();
}

/** Canonical story key from any text: brand slug × normalized text → short stable key. */
export function storyKeyOf(slug, text) {
  return createHash('sha256').update(`${slug || 'unknown'}␟${normalizeHeadline(text)}`).digest('hex').slice(0, 16);
}

/**
 * The story identity of a SOURCE SIGNAL — keyed on the signal's own content, NOT the drafted
 * headline. This is the robust dedup key: the LLM rewords headlines run-to-run, so two drafts of
 * the same story would fingerprint differently on their headlines — but the source signal is stable.
 * The matcher checks THIS before drafting and stamps it on the draft (brief.storyKey).
 */
export function signalStoryKey(slug, signal) {
  return storyKeyOf(slug, firstSentence(signal?.content) || signal?.title || '');
}

/**
 * The set of already-drafted story keys across ALL buckets — the pipeline's "have I told this?"
 * memory. Includes BOTH the drafted-headline key (for the suppress/report path + back-compat) AND
 * the signal storyKey stamped on newer drafts (the robust, draft-mode-independent identity).
 */
export function loadSeenFingerprints() {
  const set = new Set();
  for (const b of ['pending', 'approved', 'rejected']) for (const e of scanBucket(b)) {
    if (e.fp.norm) set.add(e.fp.key);
    const sk = e.rec?.brief?.storyKey;
    if (sk) set.add(sk);
  }
  return set;
}

/** Would a new draft be a duplicate of a story already in the queue? The eligibility test (step 2). */
export function isDuplicateStory(record, seen = loadSeenFingerprints()) {
  const fp = fingerprint(record);
  return fp.norm !== '' && seen.has(fp.key);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function report(bucket) {
  const entries = scanBucket(bucket);
  const groups = findDuplicateGroups(entries);
  const dupCount = groups.reduce((n, g) => n + g.duplicates.length, 0);
  const unique = entries.filter((e) => e.fp.norm).length - dupCount;
  console.log(`[dedup] ${bucket}: ${entries.length} draft(s) · ${unique} unique stories · ${groups.length} duplicate group(s) · would collapse ${entries.length} → ${entries.length - dupCount} (${dupCount} duplicates)`);
  for (const g of groups.slice(0, 12)) {
    console.log(`   ×${g.duplicates.length + 1}  ${g.slug} · "${g.norm.slice(0, 64)}"`);
  }
  return { total: entries.length, unique, groups: groups.length, dupCount };
}

function suppress(bucket) {
  const groups = findDuplicateGroups(scanBucket(bucket));
  const quarantine = bucketDir('duplicates');
  mkdirSync(quarantine, { recursive: true });
  let moved = 0;
  for (const g of groups) {
    for (const d of g.duplicates) {
      renameSync(join(bucketDir(bucket), d.file), join(quarantine, d.file)); // move, never delete (reversible)
      moved++;
    }
  }
  console.log(`[dedup] suppressed ${moved} duplicate(s) from ${bucket}/ → duplicates/ (canonicals kept). Reversible.`);
  return moved;
}

async function smoke() {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  process.env.AMF_REVIEW_DIR = mkdtempSync(join(tmpdir(), 'dedup-smoke-'));
  const p = bucketDir('pending');
  mkdirSync(p, { recursive: true });
  const put = (id, slug, headline, queuedAt) => writeFileSync(join(p, `${id}.json`), JSON.stringify({ id, slug, brief: { headline }, queuedAt }));
  put('c-01', 'continuum', 'Codebase memory is now a race — can your AI agent prove it', '2026-07-06T01:00');
  put('c-02', 'continuum', 'Codebase Memory is now a RACE: can your AI agent PROVE it??', '2026-07-07T01:00'); // same story, punctuation/case noise
  put('c-03', 'continuum', 'codebase memory is now a race can your ai agent prove it', '2026-07-08T01:00'); // same story
  put('v-01', 'voicecosmos', 'Codebase memory is now a race — can your AI agent prove it', '2026-07-06T01:00'); // SAME story, DIFFERENT brand → NOT a dupe
  put('c-04', 'continuum', 'A completely different headline about spa bookings', '2026-07-09T01:00');
  const groups = findDuplicateGroups(scanBucket('pending'));
  const ok = groups.length === 1 && groups[0].duplicates.length === 2 && groups[0].canonical.rec.id === 'c-01';
  rmSync(process.env.AMF_REVIEW_DIR, { recursive: true, force: true });
  delete process.env.AMF_REVIEW_DIR;
  console.log(ok ? '[dedup] smoke OK — 3 same-brand copies → 1 group of 2 dupes; cross-brand kept; canonical = earliest' : '[dedup] smoke FAIL');
  process.exit(ok ? 0 : 1);
}

const argv = process.argv.slice(2);
// Only act when dedup.mjs is the ENTRY point — never on import. (Previously `--smoke` was checked
// first, so importing this module from any process that happened to carry --smoke in argv — e.g. a
// sibling module's own --smoke run — hijacked the process and exited. Entry-point is the outer gate.)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (argv.includes('--smoke')) {
    await smoke();
  } else {
    const bucketIdx = argv.indexOf('--bucket');
    const bucket = bucketIdx >= 0 ? argv[bucketIdx + 1] : 'pending';
    if (argv.includes('--suppress')) suppress(bucket);
    else report(bucket);
  }
}
