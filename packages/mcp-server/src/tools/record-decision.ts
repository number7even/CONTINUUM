/**
 * continuum_record_decision — capture the human's P9 acceptance as an immutable
 * `type='decision'` Observation (Authorship Ledger spec §2).
 *
 * This is the consent primitive of the Authorship Ledger: when a human accepts
 * (or overrides / rejects) a proposal at the acceptance boundary — the Board's
 * REVIEW queue — their decision is written here, append-only and privacy-scrubbed,
 * with a self-integrity contentHash over the canonical consent record. A later
 * checkpoint seals it into the SHA-256 chain via StateEntry.acceptedBy (spec §3).
 *
 * The decision is the evidence that a HUMAN authored the acceptance — the engine
 * asserts no authorship of its own (P9: the leap is the human's).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const AUTHORSHIP_SOURCE_ID = 'authorship';
const VERDICTS = ['accept', 'override', 'reject'] as const;
type Verdict = (typeof VERDICTS)[number];

interface Subject { kind?: string; id?: string; title?: string; contentHash?: string }
interface Basis { verifyCommand?: string; exitCode?: number; qualifierRef?: string }
interface RecordDecisionArgs {
  verdict?: string;
  subject?: Subject;
  operator?: string;
  rationale?: string;
  basis?: Basis;
  refs?: string[];
}

/** Recursive canonical JSON (sorted keys at every depth) — mirrors core's
 *  canonicalStringify so a decision's hash is stable + reproducible. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
      .join(',') +
    '}'
  );
}

export const recordDecisionTool: ToolDefinition = {
  name: 'continuum_record_decision',
  description:
    'Record a human acceptance decision (accept | override | reject) at the P9 ' +
    'boundary as an immutable type=\'decision\' Observation — the consent primitive of ' +
    'the Authorship Ledger. Returns the decision id + contentHash. Call this when a ' +
    'human accepts a proposal in the REVIEW queue; a later checkpoint seals it into ' +
    'the hash chain via StateEntry.acceptedBy.',
  inputSchema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: [...VERDICTS], description: 'The human decision.' },
      subject: {
        type: 'object',
        description: 'What is being accepted.',
        properties: {
          kind: { type: 'string', description: 'e.g. "todo", "state", "commit".' },
          id: { type: 'string', description: 'ID of the accepted item.' },
          title: { type: 'string' },
          contentHash: { type: 'string', description: 'Optional hash of the accepted content/diff.' },
        },
      },
      operator: { type: 'string', description: 'WHO leapt — email/account. Falls back to $CONTINUUM_OPERATOR.' },
      rationale: { type: 'string', description: 'Optional human reasoning for the decision.' },
      basis: {
        type: 'object',
        description: 'The proof on the table at the boundary.',
        properties: {
          verifyCommand: { type: 'string' },
          exitCode: { type: 'number' },
          qualifierRef: { type: 'string', description: "The Conductor's assessment Observation ID." },
        },
      },
      refs: { type: 'array', items: { type: 'string' }, description: 'Observation IDs / commits this decision concerns.' },
    },
    required: ['verdict', 'subject'],
  },
};

export const handleRecordDecision: ToolHandler = async (args, storage) => {
  const input = (args ?? {}) as RecordDecisionArgs;
  const verdict = String(input.verdict ?? '').trim() as Verdict;
  if (!VERDICTS.includes(verdict)) {
    throw new Error(`verdict must be one of: ${VERDICTS.join(', ')}`);
  }
  const subject: Subject = input.subject ?? {};
  if (!subject.id && !subject.kind && !subject.title) {
    throw new Error('subject must identify what is being accepted (id, kind, or title)');
  }
  const operator = String(input.operator ?? process.env.CONTINUUM_OPERATOR ?? '').trim() || 'unknown';
  const rationale = input.rationale ? String(input.rationale).trim() : undefined;
  const basis: Basis | undefined = input.basis && typeof input.basis === 'object' ? input.basis : undefined;
  const refs = Array.isArray(input.refs) ? input.refs.map(String) : [];
  const timestamp = new Date().toISOString();

  // The canonical consent record — the exact bytes the contentHash commits to.
  const consent = { verdict, operator, subject, basis: basis ?? null, rationale: rationale ?? null, timestamp };
  const contentHash = 'sha256:' + createHash('sha256').update(canonical(consent)).digest('hex');

  // Idempotent source (genre 'export' — captured operator activity; the sourceId
  // 'authorship' is what marks it as the authorship ledger).
  storage.upsertSource(AUTHORSHIP_SOURCE_ID, 'export', { ledger: 'authorship', pillar: 'provenance-of-authorship' });

  const subjectLabel = subject.title || subject.id || subject.kind || '(unspecified)';
  const basisLine = basis?.verifyCommand
    ? `\nbasis: ${basis.verifyCommand}${basis.exitCode !== undefined ? ` → exit ${basis.exitCode}` : ''}`
    : '';
  const content =
    `${verdict.toUpperCase()} · ${subjectLabel} · by ${operator}` +
    basisLine +
    (rationale ? `\nrationale: ${rationale}` : '');

  const obs = storage.insertObservation({
    sourceId: AUTHORSHIP_SOURCE_ID,
    type: 'decision',
    content,
    timestamp,
    refs,
    metadata: { verdict, operator, subject, basis: basis ?? null, rationale: rationale ?? null, contentHash },
  });

  if (!obs) {
    throw new Error('decision record was dropped by the privacy filter');
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            recorded: true,
            id: obs.id,
            type: 'decision',
            verdict,
            operator,
            subject,
            contentHash,
            sealHint: 'stamp StateEntry.acceptedBy = { operator, decisionId: id, decisionHash: contentHash, at } then record_checkpoint to seal',
          },
          null,
          2,
        ),
      },
    ],
  };
};
