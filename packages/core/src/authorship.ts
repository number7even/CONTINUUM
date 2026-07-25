/**
 * authorship — the single source of truth for sealing a human P9 decision (Authorship Ledger §2).
 *
 * `sealDecision` writes an immutable `type='decision'` Observation capturing a human's acceptance
 * (accept | override | reject) with a self-integrity `contentHash`. Extracted from the MCP tool so
 * that BOTH `continuum_record_decision` AND the AMF `review.mjs` P9 gate seal through the exact same
 * cryptographic path — two implementations of a hash-verified ledger would drift and corrupt the chain.
 *
 * P2 / privacy invariant, made coherent: the consent record is SCRUBBED (privacy filter + deep
 * metadata scrub) BEFORE the contentHash is computed. So the hash commits to the redacted bytes,
 * the stored Observation is redacted, and re-deriving the hash from the stored record MATCHES. (The
 * prior tool hashed the raw consent then scrubbed at insert — the stored record could never verify.)
 * PII therefore never enters the hash preimage, and tamper of the stored decision is detectable.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import { scrubMetadataDeep, AUTHORSHIP_SOURCE_ID } from './observation.js';
import type { StorageBackend } from './storage.js';

export { AUTHORSHIP_SOURCE_ID };
export const DECISION_VERDICTS = ['accept', 'override', 'reject'] as const;
export type DecisionVerdict = (typeof DECISION_VERDICTS)[number];

export interface DecisionSubject { kind?: string; id?: string; title?: string; contentHash?: string }
export interface DecisionBasis { verifyCommand?: string; exitCode?: number; qualifierRef?: string }
export interface SealDecisionInput {
  verdict: DecisionVerdict | string;
  subject: DecisionSubject;
  operator?: string;
  rationale?: string;
  basis?: DecisionBasis;
  refs?: string[];
}
export interface SealedDecision {
  id: string;
  contentHash: string;
  verdict: DecisionVerdict;
  operator: string;
  subject: DecisionSubject;
  timestamp: string;
}

/** Recursive canonical JSON (sorted keys at every depth) — stable + reproducible hash preimage. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

/** The consent record → its sealing hash. Exported so verifiers re-derive through the SAME path. */
export function consentHash(consent: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonical(consent)).digest('hex');
}

/**
 * Seal a human decision into the Authorship Ledger. Scrubs → hashes → stores (in that order), so the
 * hash is over redacted content. Returns the decision id + contentHash. Throws if the privacy filter
 * drops the whole record. The write goes through `storage.insertObservation` — the mandatory choke-point.
 */
export function sealDecision(storage: StorageBackend, input: SealDecisionInput): SealedDecision {
  const verdict = String(input.verdict ?? '').trim();
  if (!(DECISION_VERDICTS as readonly string[]).includes(verdict)) {
    throw new Error(`verdict must be one of: ${DECISION_VERDICTS.join(', ')}`);
  }
  const subjectRaw = input.subject ?? {};
  if (!subjectRaw.id && !subjectRaw.kind && !subjectRaw.title) {
    throw new Error('subject must identify what is being accepted (id, kind, or title)');
  }
  const operator = String(input.operator ?? process.env.CONTINUUM_OPERATOR ?? '').trim() || 'unknown';
  const basis = input.basis && typeof input.basis === 'object' ? input.basis : null;
  const refs = Array.isArray(input.refs) ? input.refs.map(String) : [];
  const timestamp = new Date().toISOString();
  const rationale = input.rationale ? String(input.rationale).trim() : null;

  // ── SCRUB BEFORE HASH (Directive 3 / P2). Scrub the WHOLE consent record exactly as
  //    storage.insertObservation will scrub the metadata, THEN hash. This guarantees the
  //    contentHash commits to the redacted bytes and re-derives from the stored record —
  //    the write's own re-scrub is idempotent, so stored === hashed, always.
  const rawConsent = { verdict, operator, subject: subjectRaw, basis, rationale, timestamp };
  // Exempt `operator` from PII redaction (authorized provenance) — matching insertObservation's
  // re-scrub — so the hash preimage and the stored record agree on a preserved identity.
  const consent = (scrubMetadataDeep(rawConsent as Record<string, unknown>, { piiExemptKeys: ['operator'] }).scrubbed ?? rawConsent) as {
    verdict: string; operator: string; subject: DecisionSubject; basis: DecisionBasis | null; rationale: string | null; timestamp: string;
  };
  const contentHash = consentHash(consent);

  storage.upsertSource(AUTHORSHIP_SOURCE_ID, 'export', { ledger: 'authorship', pillar: 'provenance-of-authorship' });

  const s = consent.subject ?? {};
  const subjectLabel = s.title || s.id || s.kind || '(unspecified)';
  const basisLine = consent.basis?.verifyCommand
    ? `\nbasis: ${consent.basis.verifyCommand}${consent.basis.exitCode !== undefined ? ` → exit ${consent.basis.exitCode}` : ''}`
    : '';
  const content = `${consent.verdict.toUpperCase()} · ${subjectLabel} · by ${consent.operator}` + basisLine + (consent.rationale ? `\nrationale: ${consent.rationale}` : '');

  const obs = storage.insertObservation({
    sourceId: AUTHORSHIP_SOURCE_ID,
    type: 'decision',
    content,
    timestamp,
    refs,
    metadata: { ...consent, contentHash },
  });
  if (!obs) throw new Error('decision record was dropped by the privacy filter');

  return { id: obs.id, contentHash, verdict: consent.verdict as DecisionVerdict, operator: consent.operator, subject: consent.subject, timestamp };
}
