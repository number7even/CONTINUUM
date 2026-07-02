/**
 * vault-guard.mjs — the StudioMunich VAULT rights wall (handshake §2 step 4 + §7 step 7).
 *
 * THE LINE WE HOLD: never serve an unsigned human likeness. Every rented-talent frame must be
 * VAULT-signed and AMF-verified, or the engine declines to a synthetic avatar. This module is
 * the single enforcement point the produce path routes through. Fail-safe by construction:
 * anything we cannot cryptographically verify → decline → synthetic (P8 no-extract, P4 verify).
 *
 * avatarId scheme (handshake §1):
 *   studiomunich:<actorId>  → RENTED human likeness — requires a verified X-Rights-Signature
 *   digital:<id>            → SYNTHETIC — AMF renders itself, no likeness rights needed
 *
 * Step 4 verify: recompute HMAC-SHA256 over [actorId, modality, phraseHash, duration, tier]
 * with VAULT_RIGHTS_SIGNING_SECRET; HARD REJECT on mismatch. The EXACT field order/encoding is
 * pending VAULT (handshake §7.3) — the canonical string below is our aligned default and must
 * match VAULT byte-for-byte before a live signature can pass. Until then the fail-safe holds:
 * with no secret (VAULT in shadow) every rented request declines to synthetic regardless.
 *
 *   node apps/amf/worker/vault-guard.mjs --smoke
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RENTED_PREFIX = 'studiomunich:';
const SYNTH_PREFIX = 'digital:';
export const SYNTHETIC_FALLBACK = 'digital:synthetic';

/** Classify an avatarId into { kind: 'rented'|'synthetic'|'unknown', actorId, raw }. */
export function parseAvatarId(avatarId) {
  const raw = String(avatarId || '').trim();
  if (raw.startsWith(RENTED_PREFIX)) return { kind: 'rented', actorId: raw.slice(RENTED_PREFIX.length), raw };
  if (raw.startsWith(SYNTH_PREFIX)) return { kind: 'synthetic', actorId: raw.slice(SYNTH_PREFIX.length), raw };
  return { kind: 'unknown', actorId: raw, raw };
}

/** phraseHash of a scripted line — the identity of the exact words VAULT signed for. */
export function phraseHashOf(text) { return createHash('sha256').update(String(text ?? '')).digest('hex'); }

/**
 * Canonical signing string (handshake §2.4 / §7.3): the 5 fields newline-joined in order.
 * EXACT encoding pending VAULT confirmation — this is the aligned default. HMAC-SHA256 hex.
 */
export function computeRightsSignature({ actorId, modality, phraseHash, duration, tier }, secret) {
  const canonical = [actorId, modality, phraseHash, String(duration), String(tier)].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

/** Timing-safe verify of a provided X-Rights-Signature against the recompute. False if unverifiable. */
export function verifyRightsSignature(fields, providedSig, secret) {
  if (!secret || !providedSig) return false;
  const expected = computeRightsSignature(fields, secret);
  const a = Buffer.from(String(providedSig), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The rights wall. Decide whether to serve a presenter or decline to synthetic.
 *   avatarId       — requested avatar (studiomunich:<id> | digital:<id>)
 *   render         — VAULT render response { status, modality, phraseHash, duration, tier, signature } | null
 *   secret         — VAULT_RIGHTS_SIGNING_SECRET (absent = VAULT in shadow → decline all rented)
 *   takedownActors — actorIds under talent.takedown / license.revoked → decline immediately
 * Returns a decision; serve=false always carries mode='synthetic' + avatarId=SYNTHETIC_FALLBACK.
 */
export function decideRender({ avatarId, render = null, secret = process.env.VAULT_RIGHTS_SIGNING_SECRET, takedownActors = [] } = {}) {
  const a = parseAvatarId(avatarId);
  const decline = (reason, severity = 'decline', extra = {}) => ({
    serve: false, mode: 'synthetic', avatarId: SYNTHETIC_FALLBACK,
    requested: a.raw, kind: a.kind, reason, severity, ...extra,
  });

  // Synthetic → AMF renders itself; no likeness rights required.
  if (a.kind === 'synthetic') {
    return { serve: true, mode: 'synthetic', avatarId: a.raw, requested: a.raw, kind: 'synthetic', reason: 'synthetic avatar — no likeness rights required' };
  }
  // Unknown scheme → fail-safe decline.
  if (a.kind !== 'rented') return decline(`unrecognised avatarId scheme "${a.raw}" — fail-safe decline to synthetic`);

  // Rented human likeness — the wall.
  const takenDown = new Set((takedownActors || []).map(String));
  if (takenDown.has(a.actorId)) return decline(`actor "${a.actorId}" is under talent.takedown — permission dissolved, serving synthetic`, 'takedown');
  if (!secret) return decline(`VAULT in shadow (no VAULT_RIGHTS_SIGNING_SECRET) — cannot verify rights for "${a.raw}", serving synthetic`, 'shadow');
  if (!render || render.status === 404 || !render.signature) return decline(`no signed render for "${a.raw}" (404 / partial coverage) — serving synthetic`, 'no-signature');

  const fields = { actorId: a.actorId, modality: render.modality, phraseHash: render.phraseHash, duration: render.duration, tier: render.tier };
  if (!verifyRightsSignature(fields, render.signature, secret)) {
    return decline(`X-Rights-Signature MISMATCH for "${a.raw}" — HARD REJECT (possible forged/unsigned likeness), serving synthetic`, 'reject', { securityEvent: true });
  }
  // Verified — cleared to serve the signed bytes.
  return { serve: true, mode: 'rented-signed', avatarId: a.raw, requested: a.raw, kind: 'rented', actorId: a.actorId, signature: render.signature, reason: `X-Rights-Signature verified for "${a.raw}" — signed likeness cleared to serve` };
}

/** One-line human summary of a decision (for produce logs / the render ledger). */
export function describeDecision(d) {
  const tag = d.mode === 'rented-signed' ? '✅ SERVE signed likeness'
    : d.securityEvent ? '⛔ HARD REJECT → synthetic'
    : '↩︎ decline → synthetic';
  return `${tag} · ${d.requested} → ${d.avatarId} · ${d.reason}`;
}

// ── smoke: prove every branch of the wall ────────────────────────────────────
function smoke() {
  const SECRET = 'test-vault-secret';
  let pass = 0, fail = 0;
  const check = (label, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? 'OK ' : 'XX '} ${label}`); };

  // 1. synthetic always serves
  const synth = decideRender({ avatarId: 'digital:default' });
  check('digital: → serve synthetic', synth.serve && synth.mode === 'synthetic');

  // 2. rented, VAULT in shadow (no secret) → decline
  const shadow = decideRender({ avatarId: 'studiomunich:astrid', secret: '' });
  check('rented + no secret (shadow) → decline to synthetic', !shadow.serve && shadow.avatarId === SYNTHETIC_FALLBACK && shadow.severity === 'shadow');

  // 3. rented, secret set, no render (404) → decline
  const noSig = decideRender({ avatarId: 'studiomunich:astrid', secret: SECRET, render: { status: 404 } });
  check('rented + 404 render → decline to synthetic', !noSig.serve && noSig.severity === 'no-signature');

  // 4. rented, valid signature → SERVE signed
  const fields = { actorId: 'astrid', modality: 'presence', phraseHash: phraseHashOf('verify then dissolve'), duration: 6.2, tier: 'A' };
  const goodSig = computeRightsSignature(fields, SECRET);
  const served = decideRender({ avatarId: 'studiomunich:astrid', secret: SECRET, render: { status: 200, ...fields, signature: goodSig } });
  check('rented + valid X-Rights-Signature → SERVE signed', served.serve && served.mode === 'rented-signed' && served.signature === goodSig);

  // 5. rented, FORGED signature → hard reject → synthetic
  const forged = decideRender({ avatarId: 'studiomunich:astrid', secret: SECRET, render: { status: 200, ...fields, signature: goodSig.replace(/.$/, '0') } });
  check('rented + forged signature → HARD REJECT + securityEvent → synthetic', !forged.serve && forged.securityEvent === true && forged.avatarId === SYNTHETIC_FALLBACK);

  // 6. tampered field (same sig, different duration) → mismatch → reject
  const tampered = decideRender({ avatarId: 'studiomunich:astrid', secret: SECRET, render: { status: 200, ...fields, duration: 99, signature: goodSig } });
  check('rented + tampered field → signature mismatch → reject', !tampered.serve && tampered.securityEvent === true);

  // 7. takedown → decline even with a valid signature
  const down = decideRender({ avatarId: 'studiomunich:astrid', secret: SECRET, render: { status: 200, ...fields, signature: goodSig }, takedownActors: ['astrid'] });
  check('actor under takedown → decline (permission dissolved)', !down.serve && down.severity === 'takedown');

  // 8. unknown scheme → decline
  const unk = decideRender({ avatarId: 'someface.png' });
  check('unknown scheme → fail-safe decline', !unk.serve && unk.mode === 'synthetic');

  // 9. timing-safe verify: true for good, false for bad/absent secret
  check('verifyRightsSignature true on match / false on mismatch / false w/o secret',
    verifyRightsSignature(fields, goodSig, SECRET) === true
    && verifyRightsSignature(fields, goodSig, 'wrong') === false
    && verifyRightsSignature(fields, goodSig, '') === false);

  console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — vault-guard rights wall: ${pass} passed, ${fail} failed`);
  console.log('  THE LINE HELD: unsigned / forged / shadow / takedown human likeness never served — declined to synthetic every time.\n');
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke();
  else console.log('vault-guard — the rights wall. Run with --smoke to prove every branch, or import { decideRender }.');
}
