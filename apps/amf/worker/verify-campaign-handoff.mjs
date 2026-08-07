// verify-campaign-handoff.mjs — CROOMA Wave-1, Seam-1 proof (CONTINUUM side).
//
// Proves ONE end-to-end sealed campaign with an unbroken cryptographic chain of custody, and the P9
// WALL that the Campaign Engine mirrors on intake:
//   • an APPROVED (human-sealed) draft exports a self-contained bundle — decisionId + contentHash +
//     verdict + operator + a sourceChain that walks decision → draft → source signal → its origin URL,
//     ACROSS two project DBs (decision in one, source in another);
//   • an UNSEALED draft (never approved) is REFUSED — no P9, no export;
//   • a draft TAMPERED after approval is REFUSED — the contentHash no longer re-derives.
//
// This is the CONTINUUM half. The Campaign Engine's intake rejection is proven in the pod-geni repo
// against this same contract — not claimed here (Cadence stays 🟡 REPORTED until then).
//
//   node verify-campaign-handoff.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = resolve(HERE, '../../..');
const DATA = mkdtempSync(join(tmpdir(), 'amf-handoff-data-'));
const REVIEW = mkdtempSync(join(tmpdir(), 'amf-handoff-queue-'));
process.env.CONTINUUM_DATA_DIR = DATA;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_PRIVACY_PII = '1';
process.env.AMF_REVIEW_DIR = REVIEW;
process.env.AMF_DECISION_PROJECT = 'amf-decisions';   // the P9 seal lands here
delete process.env.AMF_CONTENT_PROJECT;               // NO manual override — the draft must be self-contained
process.env.CONTINUUM_OPERATOR = 'riaan-k';

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const { approveDraft } = await import(resolve(HERE, 'review.mjs'));
const { campaignHandoff } = await import(resolve(HERE, 'campaign-handoff.mjs'));

// 1. Seed the SOURCE signal (the ingested news article) in the CONTENT project.
const SIGNAL_ID = 'aa111111-1111-1111-1111-111111111111';
const SRC_URL = 'https://skift.com/hotels-after-hours';
{
  const cs = await openStorage('amf-content');
  cs.upsertSource('googlenews', 'docs', {});
  cs.upsertObservation({ id: SIGNAL_ID, sourceId: 'googlenews', type: 'feed_article', content: 'Hotels lose after-hours bookings to voicemail; a voice concierge recovers the guest.', timestamp: new Date().toISOString(), refs: [], metadata: { sources: [SRC_URL] } });
  cs.close?.();
}

// 2. Enqueue a draft whose brief points back at that source signal.
const pendingDir = join(REVIEW, 'pending');
mkdirSync(pendingDir, { recursive: true });
// The draft stamps its OWN contentProject (as content-matcher/pipeline now do) → self-contained, no env override.
const DRAFT = { id: 'voicecosmos-camp', slug: 'voicecosmos', format: 'post', queuedAt: '2026-07-25T09:00', brief: { headline: 'Recover the bookings you lose after 6pm', cta: 'DEMO', points: [{ stat: '30%', label: 'calls unanswered' }], fromSignal: SIGNAL_ID, sources: [SRC_URL], contentProject: 'amf-content' } };
writeFileSync(join(pendingDir, `${DRAFT.id}.json`), JSON.stringify(DRAFT));

console.log('── the P9 WALL · an UNSEALED draft cannot be exported ───────────────────');
{
  const refused = await campaignHandoff(DRAFT.id);   // still pending — never approved
  check('a draft with no P9 seal is REFUSED', refused.ok === false && /no P9 seal|not an approved/i.test(refused.reason), refused.reason);
}

console.log('── the human leap · approve seals, then the sealed bundle exports ───────');
const appr = await approveDraft(DRAFT.id);
const bundle = await campaignHandoff(DRAFT.id);
check('an approved (sealed) asset exports ok', bundle.ok === true && !!bundle.decisionId && /^sha256:/.test(bundle.contentHash || ''));
check('the bundle carries the human witness (verdict + operator)', bundle.verdict === 'accept' && bundle.operator === 'riaan-k', bundle.operator);
check('the contentHash matches the sealed approval', bundle.contentHash === appr.contentHash);

console.log('── the chain of custody · walks decision → draft → source → origin ─────');
const roles = bundle.sourceChain.map(n => n.role);
check('the chain is unbroken (decision · draft · signal)', bundle.chainUnbroken === true && roles.join(',') === 'decision,draft,signal', roles.join('→'));
const sig = bundle.sourceChain.find(n => n.role === 'signal');
check('the signal node resolves the ORIGIN source (id + sourceId + url)', sig?.id === SIGNAL_ID && sig?.sourceId === 'googlenews' && sig?.url === SRC_URL, sig?.url);
check('SELF-CONTAINED: the chain resolves from the draft\'s OWN contentProject — NO env override', bundle.decisionProject === 'amf-decisions' && sig?.project === 'amf-content' && process.env.AMF_CONTENT_PROJECT === undefined, `signal.project=${sig?.project} (env unset)`);

console.log('── the P9 WALL · a TAMPERED asset is refused (hash no longer re-derives) ──');
{
  const approvedPath = join(REVIEW, 'approved', `${DRAFT.id}.json`);
  const rec = JSON.parse(readFileSync(approvedPath, 'utf8'));
  rec.brief.headline = 'FRAUDULENT swapped headline after approval';   // tamper post-seal
  writeFileSync(approvedPath, JSON.stringify(rec));
  const refused = await campaignHandoff(DRAFT.id);
  check('a post-approval edit BREAKS the export (tamper detected)', refused.ok === false && /tampered|mismatch/i.test(refused.reason), refused.reason);
}

rmSync(DATA, { recursive: true, force: true });
rmSync(REVIEW, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('CAMPAIGN_HANDOFF_VERIFY: GREEN — a sealed asset exports a self-contained provenance bundle whose');
  console.log('chain walks decision→draft→source→origin across projects; unsealed + tampered assets are refused.');
  process.exit(0);
} else { console.log('CAMPAIGN_HANDOFF_VERIFY: RED'); process.exit(1); }
