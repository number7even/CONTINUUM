/**
 * continuum_record_brand_dna — record a Brand Kernel (Layer-0) primitive.
 *
 * The write side of the Brand DNA Engine. Captures the four kinds of brand
 * identity primitive as privacy-filtered Observations under the `brand` source,
 * so they are FTS5-searchable, append-only, and citable by Observation ID:
 *
 *   • promise   — a public commitment ("I will never recommend X to a client").
 *                 These + positions are what the Publish Identity Gate checks a
 *                 draft against (continuum_check_brand).
 *   • position  — a stance on a topic ("avatar video beats faceless for trust").
 *   • framework — owned IP: a model / acronym / mental map, with usage notes.
 *   • persona   — an audience the brand serves.
 *
 * Nested brand architecture (decided 2026-06-29): one tenant holds the Master
 * brand DNA; sub-brands (`voicecosmos`, `zoro`, `consulting`) are a `subBrand`
 * tag, NOT separate tenants — they DERIVE from and inherit the Master DNA.
 * `subBrand` defaults to `master` (applies to every sub-brand).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

/** The Brand Kernel source instance. type='docs' (a valid SourceType — brand
 *  DNA is curated documents) while the source id `brand` gives search hits a
 *  clean `source: 'brand'` label. No schema migration required. */
const BRAND_SOURCE_ID = 'brand';

const KINDS = ['promise', 'position', 'framework', 'persona'] as const;
type BrandKind = (typeof KINDS)[number];

interface RecordBrandDnaArgs {
  kind?: string;
  statement?: string;
  subBrand?: string;
  topic?: string;
  refs?: string[];
}

export const recordBrandDnaTool: ToolDefinition = {
  name: 'continuum_record_brand_dna',
  description:
    'Record a Brand Kernel (Layer-0) identity primitive so AMF/L3 scripting stays on-brand and ' +
    'the Publish Identity Gate has something to check against. kind is one of: ' +
    '"promise" (a public commitment — these get contradiction-checked), "position" (a stance on a topic), ' +
    '"framework" (owned IP: a model/acronym/mental-map), "persona" (an audience the brand serves). ' +
    'statement is the primitive itself in plain language. subBrand tags which brand it belongs to: ' +
    '"master" (the default — your personal brand, inherited by every sub-brand) or a derived sub-brand ' +
    'like "voicecosmos" / "zoro" / "consulting". topic is an optional pillar label for filtering. ' +
    'Stored as a privacy-filtered, append-only Observation citable by its returned ID.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: [...KINDS], description: 'promise | position | framework | persona' },
      statement: { type: 'string', description: 'The brand primitive in plain language.' },
      subBrand: {
        type: 'string',
        description: 'Brand this belongs to. "master" (default, inherited by all sub-brands) or a sub-brand id.',
      },
      topic: { type: 'string', description: 'Optional pillar/topic label, e.g. "ai-security".' },
      refs: { type: 'array', items: { type: 'string' }, description: 'Observation IDs this primitive derives from.' },
    },
    required: ['kind', 'statement'],
  },
};

export const handleRecordBrandDna: ToolHandler = async (args, storage) => {
  const input = (args ?? {}) as RecordBrandDnaArgs;
  const kind = String(input.kind ?? '').trim() as BrandKind;
  const statement = String(input.statement ?? '').trim();
  if (!KINDS.includes(kind)) {
    throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
  }
  if (!statement) {
    throw new Error('statement is required');
  }
  const subBrand = String(input.subBrand ?? 'master').trim().toLowerCase() || 'master';
  const topic = input.topic ? String(input.topic).trim() : undefined;

  // Ensure the brand source exists (idempotent) before the FK insert.
  storage.upsertSource(BRAND_SOURCE_ID, 'docs', { kernel: 'brand', layer: 0 });

  const obs = storage.insertObservation({
    sourceId: BRAND_SOURCE_ID,
    type: `brand_${kind}`,
    content: statement,
    timestamp: new Date().toISOString(),
    refs: Array.isArray(input.refs) ? input.refs : [],
    metadata: { kind, subBrand, ...(topic ? { topic } : {}) },
  });

  if (!obs) {
    // The privacy filter scrubbed the entire statement — refuse silently-empty writes.
    throw new Error('statement was dropped by the privacy filter (it appears to be entirely sensitive)');
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { recorded: true, id: obs.id, kind, subBrand, topic: topic ?? null, statement: obs.content },
          null,
          2,
        ),
      },
    ],
  };
};
