/**
 * claim-render-gate.js — build ② (todo c9d04e92): the certainty-grammar drop-in.
 * Engine-authored, VC-deployed (the ContinuumGate.js precedent) — ONE implementation
 * of truth-semantics consumed at the claim-render layer, upstream of EVERY consumer:
 * panels, dossiers, mermaid exports, read-aloud. Truth-semantics never fork.
 *
 * Three laws enforced (VOICE_MEDIATOR_STRATEGY §6/§7, banked):
 *  1. GRAMMAR   — completion-verbs may not attach to non-verified claims; vision
 *                 claims may not claim existence. Simplify words, never certainty.
 *  2. PUFFERY   — tone is policed INDEPENDENTLY of truth: "working flawlessly!"
 *                 fails even when verified (the gauntlet-loop lesson, run receipt
 *                 2026-08-15). P4 governs certainty; the gate also governs tone.
 *  3. ABSENCE   — a failed fetch may never render a confident zero. Absence is an
 *                 explicit card; a REAL zero (successful fetch, zero rows) is data.
 *
 * Zero dependencies. Deliberately dumb: regex grammar, not NLP — a gate must be
 * auditable at a glance. Culpability-deflation policing (euphemism detection) is a
 * known v2 gap, recorded, not silently claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
 */
'use strict';

const TAGS = ['verified', 'reported', 'vision'];

// Completion/existence verbs banned per non-verified tag (word-boundary, case-insensitive).
const BANNED_BY_TAG = {
  verified: [],
  reported: ['done', 'completed?', 'live', 'deployed', 'shipped', 'working', 'verified', 'proven', 'fully integrated', 'confirmed locally'],
  vision: ['done', 'completed?', 'live', 'deployed', 'shipped', 'working', 'verified', 'proven', 'built', 'exists', 'running', 'active', 'delivering', 'integrated'],
};

// Tone violations — apply to EVERY tag, verified included.
const PUFFERY = ['flawless\\w*', 'incredibl\\w*', 'massive', 'breakthrough', 'revolutionar\\w*', 'game.chang\\w*', 'perfect(?:ly)?', '100%', 'guaranteed', 'magic\\w*', 'unstoppable', 'bulletproof'];

const rx = (words) => new RegExp(`\\b(${words.join('|')})\\b`, 'i');

/** Gate a claim's text against its odometer tag. Returns { ok, violations[] }. */
function gateClaim(text, tag) {
  if (!TAGS.includes(tag)) return { ok: false, violations: [{ kind: 'unknown-tag', match: String(tag) }] };
  const t = String(text ?? '');
  const violations = [];
  const banned = BANNED_BY_TAG[tag];
  if (banned.length) {
    const m = t.match(rx(banned));
    if (m) violations.push({ kind: 'grammar', match: m[1], detail: `completion/existence verb '${m[1]}' on a ${tag} claim` });
  }
  const p = t.match(rx(PUFFERY));
  if (p) violations.push({ kind: 'puffery', match: p[1], detail: `tone violation '${p[1]}' (puffery fails regardless of truth)` });
  return { ok: violations.length === 0, violations };
}

/** Gate-or-throw: returns the text unchanged when clean; throws with violations otherwise. */
function requireGate(text, tag) {
  const r = gateClaim(text, tag);
  if (!r.ok) {
    const err = new Error(`CLAIM_RENDER_GATE: refused — ${r.violations.map((v) => v.detail || v.kind).join('; ')}`);
    err.violations = r.violations;
    throw err;
  }
  return text;
}

/** The explicit absence card — the ONLY sanctioned rendering of a failed/empty source. */
function absence(reason, opts = {}) {
  if (!reason || !String(reason).trim()) throw new Error('CLAIM_RENDER_GATE: absence requires a reason — silent absence is the defect');
  return { kind: 'absence', reason: String(reason), source: opts.source ?? null, renderedAt: new Date().toISOString() };
}

/** No zero-defaults: a count may only render when the fetch genuinely succeeded.
 *  A REAL zero (fetchOk:true, n===0) is legitimate data and passes. */
function gatedCount(n, { fetchOk }) {
  if (!fetchOk) {
    const err = new Error('CLAIM_RENDER_GATE: refused — a failed fetch may not render a count (use absence(reason))');
    err.kind = 'zero-default';
    throw err;
  }
  if (typeof n !== 'number' || Number.isNaN(n)) throw new Error('CLAIM_RENDER_GATE: count must be a real number');
  return n;
}

module.exports = { TAGS, BANNED_BY_TAG, PUFFERY, gateClaim, requireGate, absence, gatedCount };
