/**
 * interview — the VERIFIABLE INTERVIEW spine.
 *
 * The article's "agent interview" indexes a self-authored corpus and lets an LLM "judge the quality of
 * your work." That measures how well you DOCUMENTED yourself, not whether it's TRUE. This is the
 * CONTINUUM answer: an interview where every surfaced claim is provenance-sealed and its truth is
 * MECHANICALLY verifiable — "the résumé that refuses to lie."
 *
 * A CLAIM is an assertion of OUTCOME (the WHAT — a skill/result/experience) bound to:
 *   • a PROOF that it's true — either a re-runnable `verifyCommand` that exits 0 (mechanical, the
 *     interviewer can re-run it), or a named independent/human attestation; else UNVERIFIED; and
 *   • a tamper-evident `contentHash` (scrub → hash → store, like the decision seal).
 * It deliberately does NOT store the METHOD (the HOW) — only the outcome, the proof, and a POINTER to
 * the evidence. So a claim proves WHAT you did and THAT it's true, without leaking the sauce (P1/P2).
 *
 * The anti-padding invariant: you can ASSERT anything, but a mechanical proof that does not exit 0
 * yields UNVERIFIED — it can never masquerade as PROVEN. The corpus is not trusted; claims are verified.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash, randomUUID } from 'node:crypto';
import { scrubMetadataDeep } from './observation.js';
import type { StorageBackend } from './storage.js';

export const INTERVIEW_SOURCE_ID = 'interview';
export type ClaimTier = 'PROVEN' | 'ATTESTED' | 'UNVERIFIED';

export interface ClaimVerification {
  kind: 'mechanical' | 'attested' | 'unverified';
  /** A re-runnable witness — the interviewer runs it themselves; exit 0 = proven. (Not the method.) */
  verifyCommand?: string;
  /** The exit code at seal time (0 = passed). */
  exitCode?: number;
  /** A named independent/human attestor (for the attested tier). */
  attestedBy?: string;
  at?: string;
}
/** A POINTER to the proof source — never the method itself. */
export interface ClaimEvidence { sourceId?: string; ref?: string; url?: string; hash?: string }

export interface ClaimInput {
  subject: string;            // the candidate
  statement: string;          // the WHAT — outcome/skill/experience; NEVER the method
  evidence?: ClaimEvidence;
  verification?: ClaimVerification;
  refs?: string[];
}

export interface SealedClaim {
  id: string;
  subject: string;
  statement: string;
  evidence: ClaimEvidence;
  tier: ClaimTier;
  verification: ClaimVerification;
  contentHash: string;
  sealedAt: string;
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}
/** The claim's self-integrity hash — over the SCRUBBED body, so it commits to redacted bytes + re-derives. */
export function claimHash(body: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonical(body)).digest('hex');
}

/** PROVEN needs a mechanical exit-0; ATTESTED needs a named attestor; everything else is UNVERIFIED. */
export function tierOf(v: ClaimVerification | undefined): ClaimTier {
  if (v?.kind === 'mechanical' && v.exitCode === 0) return 'PROVEN';
  if (v?.kind === 'attested' && !!v.attestedBy?.trim()) return 'ATTESTED';
  return 'UNVERIFIED';
}
const TIER_RANK: Record<ClaimTier, number> = { PROVEN: 3, ATTESTED: 2, UNVERIFIED: 1 };

/**
 * Seal a claim into the interview ledger (type='claim' Observation). Scrubs the body (a candidate could
 * paste PII/secrets) BEFORE hashing, so the seal commits to redacted bytes and re-derives. The tier is
 * derived from the verification — an asserted-but-unproven claim CANNOT be PROVEN.
 */
export function recordClaim(storage: StorageBackend, input: ClaimInput): SealedClaim {
  const subject = String(input.subject ?? '').trim();
  const statement = String(input.statement ?? '').trim();
  if (!subject || !statement) throw new Error('a claim needs a subject and a statement');
  const v = input.verification ?? { kind: 'unverified' as const };
  const verification: ClaimVerification = {
    kind: v.kind,
    ...(v.verifyCommand !== undefined ? { verifyCommand: v.verifyCommand } : {}),
    ...(v.exitCode !== undefined ? { exitCode: v.exitCode } : {}),
    ...(v.attestedBy !== undefined ? { attestedBy: v.attestedBy } : {}),
    at: v.at ?? new Date().toISOString(),
  };
  const tier = tierOf(verification);
  const sealedAt = new Date().toISOString();

  // Scrub the WHOLE body once (statement + evidence strings), THEN hash — the same scrub the write
  // applies, so stored === hashed and re-derivation holds.
  const rawBody = { subject, statement, evidence: input.evidence ?? {}, verification, tier };
  const body = (scrubMetadataDeep(rawBody as Record<string, unknown>).scrubbed ?? rawBody) as typeof rawBody;
  const contentHash = claimHash(body);

  storage.upsertSource(INTERVIEW_SOURCE_ID, 'docs', { ledger: 'verifiable-interview', pillar: 'proof-of-competence' });
  const proofLine = verification.verifyCommand
    ? `\nproof: \`${verification.verifyCommand}\` → exit ${verification.exitCode}`
    : verification.attestedBy ? `\nattested by ${verification.attestedBy}` : '';
  const content = `[${tier}] ${body.subject}: ${body.statement}${proofLine}`;
  const id = randomUUID();
  const obs = storage.insertObservation({
    id, sourceId: INTERVIEW_SOURCE_ID, type: 'claim', content, timestamp: sealedAt,
    refs: input.refs ?? [], metadata: { ...body, contentHash, sealedAt },
  });
  if (!obs) throw new Error('claim dropped by the privacy filter');
  return { id, subject: body.subject, statement: body.statement, evidence: body.evidence, tier: body.tier, verification: body.verification, contentHash, sealedAt };
}

/** Re-derive a stored claim's hash — true iff untampered. (Editing the statement to pad it breaks this.) */
export function verifyClaimIntegrity(obs: { metadata?: Record<string, unknown> } | undefined): boolean {
  const m = obs?.metadata;
  if (!m || typeof m.contentHash !== 'string') return false;
  const { contentHash, sealedAt: _s, ...body } = m as Record<string, unknown>;
  return claimHash(body) === contentHash;
}

/** The WHAT-not-HOW interview projection of a stored claim — outcome + proof, never the method. */
export interface InterviewHit {
  id: string;
  subject: string;
  statement: string;          // WHAT
  tier: ClaimTier;
  verification: ClaimVerification;  // the PROOF (re-runnable verifyCommand / attestor) — not the method
  evidence: ClaimEvidence;    // a POINTER
  contentHash: string;
  intact: boolean;            // re-derived integrity
}

/**
 * The interview: an agent asks a question; the ledger answers with matching CLAIMS ranked by proof tier
 * (PROVEN > ATTESTED > UNVERIFIED), each carrying its re-runnable/attested proof and tamper check — but
 * never the method. `minTier` gates out anything weaker (e.g. only surface PROVEN claims to a skeptic).
 */
export function interview(
  storage: StorageBackend,
  question: string,
  opts: { minTier?: ClaimTier; limit?: number } = {},
): InterviewHit[] {
  if (!question?.trim()) throw new Error('an interview needs a question');
  const min = TIER_RANK[opts.minTier ?? 'UNVERIFIED'];
  const hits = storage.searchObservations(question, opts.limit ?? 50);
  const full = storage.getObservations(hits.map((h) => h.id)).filter((o) => o.type === 'claim');
  const out: InterviewHit[] = full.map((o) => {
    const m = (o.metadata ?? {}) as Record<string, unknown>;
    const tier = (m.tier as ClaimTier) ?? 'UNVERIFIED';
    return {
      id: o.id,
      subject: String(m.subject ?? ''),
      statement: String(m.statement ?? ''),        // WHAT only
      tier,
      verification: (m.verification ?? { kind: 'unverified' }) as ClaimVerification,
      evidence: (m.evidence ?? {}) as ClaimEvidence,
      contentHash: String(m.contentHash ?? ''),
      intact: verifyClaimIntegrity(o),
    };
  });
  return out
    .filter((h) => TIER_RANK[h.tier] >= min)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
}
