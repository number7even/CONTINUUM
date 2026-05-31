/**
 * continuum_get_observations — Progressive Disclosure Layer-3.
 * Batch full-text fetch by narrowed Observation IDs.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const getObservationsTool: ToolDefinition = {
  name: 'continuum_get_observations',
  description:
    'Progressive Disclosure Layer-3: batch full-text fetch for specifically-narrowed ' +
    'Observation IDs. This is the EXPENSIVE step — ~500-2000 tokens per observation ' +
    'depending on content. You MUST have narrowed via Layer-1 (continuum_search_docs) or ' +
    'Layer-2 (continuum_timeline) first; do NOT paginate-via-this-tool. Caps at 50 IDs per ' +
    'call; extras silently dropped — batch into multiple calls if you genuinely need more. ' +
    'Returns full Observation records with content + metadata + refs.',
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Observation IDs to fetch full content for. Max 50.',
      },
    },
    required: ['ids'],
  },
};

export const handleGetObservations: ToolHandler = async (args, storage) => {
  const { ids } = (args ?? {}) as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array');
  }
  const observations = storage.getObservations(ids);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { requested: ids.length, returned: observations.length, observations },
          null,
          2,
        ),
      },
    ],
  };
};
