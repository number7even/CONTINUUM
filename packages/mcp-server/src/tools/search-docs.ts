/**
 * continuum_search_docs — Progressive Disclosure Layer-1.
 * FTS5 keyword search returning compact ID + title hits.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const searchDocsTool: ToolDefinition = {
  name: 'continuum_search_docs',
  description:
    'Progressive Disclosure Layer-1: full-text keyword search across indexed observations. ' +
    'V0 uses SQLite FTS5 for high-precision exact/code-snippet matching. V0.5+ adds semantic ' +
    'vector fusion (RuVector). Returns compact hits — id + 1-line title + ~50-100 tokens ' +
    'per result. After narrowing here, drill via continuum_timeline (Layer 2) and ' +
    'continuum_get_observations (Layer 3); do NOT use this as the only step.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms. FTS5 syntax supported (e.g., "voice AND cutoff").',
      },
      limit: {
        type: 'number',
        description: 'Max results. Default 20.',
      },
    },
    required: ['query'],
  },
};

export const handleSearchDocs: ToolHandler = async (args, storage) => {
  const { query, limit } = args as { query: string; limit?: number };
  if (!query?.trim()) throw new Error('query is required');
  const hits = storage.searchObservations(query, limit);
  return {
    content: [
      { type: 'text', text: JSON.stringify({ query, count: hits.length, hits }, null, 2) },
    ],
  };
};
