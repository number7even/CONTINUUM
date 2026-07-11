/**
 * continuum_ask_context — the Ask retrieval in one call: search → fetch → a cited,
 * TRUST-TIERED bundle. This is Phase 1 of the Ask: it hands a model (or the UI) the
 * grounded, tier-aware context to answer over — every node carrying its epistemic
 * standing (proven · authored · reference · external · claimed), so an answer can
 * never launder a claim into a fact (§5 trust gradient · P4).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { retrieveContext } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const askContextTool: ToolDefinition = {
  name: 'continuum_ask_context',
  description:
    'Ask-retrieval in one call: FTS5 search (→ +vector fusion later) then fetch, returning ' +
    'a cited, trust-tiered context bundle (each node: id · title · source · type · TIER · ' +
    'excerpt). Use to ground an answer — the tier tells you how much each cited node can be ' +
    'trusted (proven/authored/reference/external/claimed).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to retrieve context for.' },
      limit: { type: 'number', description: 'Max nodes (default 12).' },
    },
    required: ['query'],
  },
};

export const handleAskContext: ToolHandler = async (args, storage) => {
  const { query, limit } = (args ?? {}) as { query?: string; limit?: number };
  if (!query?.trim()) throw new Error('query is required');
  const result = retrieveContext(storage, query, { limit });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
};
