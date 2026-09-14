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
  const k = limit ?? 10;

  // Keyword (FTS5) — exact tokens, room codes, confirmation numbers.
  const keyword = storage.searchObservations(query, k);

  // Vector — the fuzzy half. Only HybridStorageBackend implements it; on a
  // SQLite backend it is undefined and we degrade to keyword alone.
  //
  // UNION, not replacement. Vector-only regresses precise lookups: 'dogs'
  // resolves today via FTS, and embedding retrieval can miss exact tokens like
  // penthouse_suite or a confirmation number. Fixing the fuzzy case by breaking
  // the literal one is a worse search, discovered later.
  //
  // Measured before this change: 'golden retriever' → 0 hits, 'dogs' → 1, on a
  // tenant whose pets FAQ was present the whole time. ruvector.db was written at
  // ingest and read by nothing — embeddings on disk that no path consumed.
  const vectorFn = (storage as { vectorSearch?: (q: string, k?: number) => Promise<typeof keyword> })
    .vectorSearch;
  let vector: typeof keyword = [];
  if (typeof vectorFn === 'function') {
    // Swallow failures deliberately: vectorSearch awaits embed(), which loads
    // MiniLM. A missing model or an under-provisioned VM must degrade search to
    // keyword, never 500 it. Wiring this seam must not make search LESS reliable.
    vector = await vectorFn.call(storage, query, k).catch(() => []);
  }

  // Dedupe by observation id, keyword first so exact matches rank above fuzzy.
  // A deduped union, not RRF — do not ship a ranking formula nobody has measured.
  const hits = [...new Map([...keyword, ...vector].map((h) => [h.id, h])).values()].slice(0, k);
  return {
    content: [
      { type: 'text', text: JSON.stringify({ query, count: hits.length, hits }, null, 2) },
    ],
  };
};
