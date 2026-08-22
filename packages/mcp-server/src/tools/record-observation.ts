/**
 * continuum_record_observation — the generic event-ingest verb (post-Wave-1 build #1,
 * todo bdf16eca). Writes a schema-free payload through the ONE choke-point
 * (storage.upsertObservation → privacy scrub → tenant store). Fills the gap where
 * runtime event hooks previously had to wrap events in document envelopes.
 *
 * SECURITY INVARIANT: type='decision' is REFUSED here, always — decision seals are
 * minted ONLY via the sealing path (record_decision / sealDecision), which binds
 * verdict + operator + subject.contentHash. A generic writer that could emit
 * type='decision' would be a seal-forgery primitive. Fail closed on it.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { randomUUID } from 'node:crypto';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

const RESERVED_TYPES = new Set(['decision']);
const DEFAULT_TYPE = 'event';
const DEFAULT_SOURCE = 'events';

export const recordObservationTool: ToolDefinition = {
  name: 'continuum_record_observation',
  description:
    'Record a generic operational event/observation into the tenant brain through the privacy ' +
    'choke-point. Use for runtime activity (bookings, calls, escalations, interactions) that is ' +
    "not a todo, document, or decision. content is scrubbed before storage (secrets always; guest " +
    "PII when CONTINUUM_PRIVACY_PII=1). Provide a stable `id` for idempotent re-emission (same id " +
    'upserts in place); omit it for a fresh UUID. type defaults to "event"; type="decision" is ' +
    'REFUSED — seals are minted only via continuum_record_decision. refs[] should carry related ' +
    'Observation IDs (e.g. a decisionId/signalId chain) — never invent ids.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The event payload/text. Scrubbed at the choke-point.' },
      type: {
        type: 'string',
        description: 'Observation type. Default "event". "decision" is refused (seal-forgery guard).',
      },
      id: {
        type: 'string',
        description: 'Optional stable id for idempotent re-emission. Omit for a generated UUID.',
      },
      refs: { type: 'array', items: { type: 'string' }, description: 'Related Observation IDs.' },
      metadata: { type: 'object', description: 'Structured fields (scrubbed like content).' },
      sourceId: { type: 'string', description: 'Logical source. Default "events".' },
    },
    required: ['content'],
  },
};

interface RecordObservationArgs {
  content?: string;
  type?: string;
  id?: string;
  refs?: string[];
  metadata?: Record<string, unknown>;
  sourceId?: string;
}

export const handleRecordObservation: ToolHandler = async (rawArgs, storage) => {
  const args = (rawArgs ?? {}) as RecordObservationArgs;
  const content = typeof args?.content === 'string' ? args.content : '';
  if (!content.trim()) throw new Error('content is required');

  const type = typeof args?.type === 'string' && args.type.trim() ? args.type.trim() : DEFAULT_TYPE;
  if (RESERVED_TYPES.has(type)) {
    throw new Error(
      `type='${type}' is refused: decision seals are minted only via the sealing path ` +
        '(continuum_record_decision) — a generic writer emitting decisions would forge seals.',
    );
  }

  const sourceId =
    typeof args?.sourceId === 'string' && args.sourceId.trim() ? args.sourceId.trim() : DEFAULT_SOURCE;
  storage.upsertSource(sourceId, 'docs', { tool: 'record_observation' });

  const id = typeof args?.id === 'string' && args.id.trim() ? args.id.trim() : randomUUID();
  const saved = storage.upsertObservation({
    id,
    sourceId,
    type,
    content,
    timestamp: new Date().toISOString(),
    refs: Array.isArray(args?.refs) ? (args.refs as string[]) : [],
    metadata: (args?.metadata as Record<string, unknown>) ?? {},
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          saved
            ? { ok: true, id, type, sourceId }
            : { ok: false, id, reason: 'refused at the choke-point (privacy filter rejected the record)' },
          null,
          2,
        ),
      },
    ],
  };
};
