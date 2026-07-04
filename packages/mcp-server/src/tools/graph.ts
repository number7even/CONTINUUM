/**
 * continuum_graph — the observation provenance graph as {nodes, edges, stats}.
 *
 * The data behind the 3D "brain" visualization (JARVIS-style): nodes are
 * observations (color by source, size by degree), edges are refs[] provenance
 * links. This is a whole-graph read for exploration/rendering — NOT
 * Progressive-Disclosure reading (use continuum_search / _timeline /
 * _get_observations for token-efficient retrieval).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const graphTool: ToolDefinition = {
  name: 'continuum_graph',
  description:
    'Return the observation provenance graph as {nodes, edges, stats} — the data behind the ' +
    '3D "brain" visualization. Nodes are observations (each carries source, type, a short label, ' +
    'timestamp, and degree); edges are refs[] links between them. stats gives nodeCount, ' +
    'edgeCount, bySource counts (for filter panels) and topHubs (highest-degree observations). ' +
    'This is a whole-graph read for visualization/traversal — for token-efficient reading of ' +
    'specific observations use continuum_search / continuum_timeline / continuum_get_observations. ' +
    'Optional `limit` caps nodes most-recent-first (default 2000, max 10000).',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max nodes, most-recent-first. Default 2000, max 10000.',
      },
    },
  },
};

export const handleGraph: ToolHandler = async (args, storage) => {
  const opts = (args ?? {}) as { limit?: number };
  const graph = storage.getObservationGraph(opts);
  return { content: [{ type: 'text', text: JSON.stringify(graph) }] };
};
