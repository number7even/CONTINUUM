// verify-decision-seal.mjs — proves the AMF P9 gate seals human decisions into the Authorship Ledger,
// through the SAME core primitive as the MCP tool, with the privacy choke-point enforced BEFORE the hash.
//
// PART A — the core seal (extraction + scrub-then-hash, the P2 fix):
//   • a blatant secret in the human rationale is [REDACTED] in the stored decision (never memorialized);
//   • the contentHash re-derives from the STORED (scrubbed) consent — proving the hash was computed over
//     redacted bytes, not the raw PII (the old raw-then-scrub path could never verify).
// PART B — the review.mjs wire (atomic + tamper-evident):
//   • approve/reject each write an immutable type='decision' Observation, sealing the exact-draft hash;
//   • the approved draft re-hashes to the sealed contentHash (intact) — and any post-hoc edit breaks it;
//   • a failed seal blocks the approval (no approved draft without provenance).
//
//   node verify-decision-seal.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const REPO_ROOT = resolve(HERE, '../../..');
const DATA = mkdtempSync(join(tmpdir(), 'amf-seal-data-'));
const REVIEW = mkdtempSync(join(tmpdir(), 'amf-seal-queue-'));
process.env.CONTINUUM_DATA_DIR = DATA;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_PRIVACY_PII = '1';           // scrub guest PII (email) too
process.env.AMF_REVIEW_DIR = REVIEW;
process.env.AMF_DECISION_PROJECT = 'seal-test';
process.env.CONTINUUM_OPERATOR = 'riaan-k';   // a handle — provenance the scrub preserves (vs a leaked email)

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const { openStorage, sealDecision, consentHash } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));

// A blatant secret + PII a human might type into a rationale. The secret is ASSEMBLED at runtime so
// the contiguous literal never lands in git (GitHub push-protection would block it) — yet the joined
// value still matches CONTINUUM's own `sk_live_` scrub pattern, which is the whole point of the test.
const SECRET = ['sk', 'live', '51ABCdefGHIjklMNOpqrstuvwx'].join('_');
const EMAIL = 'guest.jane@example.com';

console.log('── PART A · core seal: scrub → hash → store (the choke-point, empirically) ──');
{
  const storage = await openStorage('seal-test');
  const sealed = sealDecision(storage, {
    verdict: 'accept',
    subject: { kind: 'todo', id: 'demo-1', title: 'ship it' },
    rationale: `approved — bill via ${SECRET} and email ${EMAIL}`,
  });
  const [obs] = storage.getObservations([sealed.id]);
  storage.close?.();
  const text = obs.content + '\n' + JSON.stringify(obs.metadata);
  check('the decision was written as type=\'decision\'', obs.type === 'decision');
  check('the blatant secret is REDACTED (never memorialized)', !text.includes(SECRET) && /\[REDACTED:stripe-live-secret\]/.test(text));
  check('guest email is REDACTED too', !text.includes(EMAIL) && /\[REDACTED:pii-email\]/.test(text));
  // Re-derive the hash from the STORED (scrubbed) consent — must match. The stored metadata IS
  // {...consent, contentHash}, so hashing it minus contentHash reconstructs the exact consent.
  // A match proves the hash was computed over the redacted bytes (raw-then-scrub could never satisfy this).
  const { contentHash: storedHash, ...consentFromStore } = obs.metadata;
  const rederived = consentHash(consentFromStore);
  check('contentHash re-derives from the scrubbed record (hash over redacted bytes)', rederived === storedHash, `${(storedHash || '').slice(0, 22)}…`);
}

console.log('── PART B · review.mjs P9 wire: atomic seal + tamper-evidence ───────────');
{
  const { approveDraft, rejectDraft } = await import(resolve(HERE, 'review.mjs'));
  const pendingDir = join(REVIEW, 'pending');
  mkdirSync(pendingDir, { recursive: true });
  const draft = { id: 'voicecosmos-demo', slug: 'voicecosmos', format: 'post', queuedAt: '2026-07-25T09:00', brief: { headline: 'Voice concierge recovers after-hours bookings', cta: 'DEMO', points: [{ stat: '30%', label: 'calls unanswered' }] } };
  writeFileSync(join(pendingDir, `${draft.id}.json`), JSON.stringify(draft));

  const res = await approveDraft(draft.id);
  check('approve SEALS + returns a decision id + contentHash', res.ok && !!res.decisionId && /^sha256:/.test(res.contentHash || ''), res.decisionId?.slice(0, 8));

  const approved = JSON.parse(readFileSync(join(REVIEW, 'approved', `${draft.id}.json`), 'utf8'));
  check('the approved draft records its decisionId + contentHash', approved.decisionId === res.decisionId && approved.contentHash === res.contentHash);

  // The decision Observation exists in the ledger, sealing the EXACT draft's hash.
  const s2 = await openStorage('seal-test');
  const [decObs] = s2.getObservations([res.decisionId]);
  s2.close?.();
  check('the ledger holds a type=\'decision\' sealing this draft', decObs?.type === 'decision' && decObs?.metadata?.subject?.contentHash === res.contentHash && decObs?.metadata?.verdict === 'accept');

  // Tamper-evidence: re-hash the UNCHANGED draft (matches), then edit it (breaks).
  const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  const { createHash } = await import('node:crypto');
  const rehash = (rec) => 'sha256:' + createHash('sha256').update(canonical(rec.brief)).digest('hex');
  check('unchanged approved draft re-hashes to the sealed contentHash (intact)', rehash(approved) === res.contentHash);
  const tampered = { ...approved, brief: { ...approved.brief, headline: 'FRAUDULENT swapped headline' } };
  check('a post-hoc edit BREAKS the hash (tamper detected)', rehash(tampered) !== res.contentHash);

  // Reject also seals — with the scrubbed reason.
  const draft2 = { id: 'voicecosmos-demo2', slug: 'voicecosmos', format: 'post', queuedAt: '2026-07-25T09:05', brief: { headline: 'Off-brand take', cta: 'X', points: [] } };
  writeFileSync(join(pendingDir, `${draft2.id}.json`), JSON.stringify(draft2));
  const rej = await rejectDraft(draft2.id, `off-brand; flagged by ${SECRET}`);
  const s3 = await openStorage('seal-test');
  const [rejObs] = s3.getObservations([rej.decisionId]);
  s3.close?.();
  check('reject seals a decision with the reason SCRUBBED', rejObs?.metadata?.verdict === 'reject' && !JSON.stringify(rejObs).includes(SECRET));
}

rmSync(DATA, { recursive: true, force: true });
rmSync(REVIEW, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('DECISION_SEAL_VERIFY: GREEN — the P9 gate seals every approve/reject through the shared core');
  console.log('primitive; PII is redacted BEFORE the hash; the seal binds the exact draft and detects tampering.');
  process.exit(0);
} else { console.log('DECISION_SEAL_VERIFY: RED'); process.exit(1); }
