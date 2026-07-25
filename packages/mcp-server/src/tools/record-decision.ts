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
import { sealDecision, DECISION_VERDICTS, AUTHORSHIP_SOURCE_ID } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export { AUTHORSHIP_SOURCE_ID };
const VERDICTS = DECISION_VERDICTS;

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
  // The cryptographic seal (scrub → hash → store) is the shared core primitive — one implementation
  // for this tool AND the AMF review.mjs P9 gate, so the hash-verified ledger cannot drift.
  const sealed = sealDecision(storage, {
    verdict: String(input.verdict ?? '').trim(),
    subject: input.subject ?? {},
    operator: input.operator,
    rationale: input.rationale,
    basis: input.basis,
    refs: input.refs,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            recorded: true,
            id: sealed.id,
            type: 'decision',
            verdict: sealed.verdict,
            operator: sealed.operator,
            subject: sealed.subject,
            contentHash: sealed.contentHash,
            sealHint: 'stamp StateEntry.acceptedBy = { operator, decisionId: id, decisionHash: contentHash, at } then record_checkpoint to seal',
          },
          null,
          2,
        ),
      },
    ],
  };
};
