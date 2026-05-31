/**
 * continuum_timeline — Progressive Disclosure Layer-2.
 * Chronological context around an observation ID or ISO timestamp.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const timelineTool: ToolDefinition = {
  name: 'continuum_timeline',
  description:
    'Progressive Disclosure Layer-2: observations in chronological order around a reference ' +
    'point. After Layer-1 (continuum_search_docs) narrows hits by keywords, use this to read ' +
    'causal context — what happened just before/after the moment of interest. Returns ' +
    'compact hits (~80-150 tokens each) with an `offsetSec` field so the AI sees relative ' +
    'timing without having to compute it. Anchor by observation ID (uses that observation\'s ' +
    'timestamp) OR by ISO-8601 timestamp; if neither given, anchors at now.',
  inputSchema: {
    type: 'object',
    properties: {
      aroundId: {
        type: 'string',
        description:
          'Observation ID to anchor the timeline window on. Preferred when you ' +
          'have an ID from Layer-1 search. Mutually exclusive with `at`.',
      },
      at: {
        type: 'string',
        description:
          'ISO-8601 timestamp to anchor on (e.g. "2026-05-15T12:13:41Z"). Use ' +
          'when querying time-of-day not tied to a specific observation. Defaults to now.',
      },
      beforeHours: {
        type: 'number',
        description: 'Hours of context before the anchor. Default 1.',
      },
      afterHours: {
        type: 'number',
        description: 'Hours of context after the anchor. Default 1.',
      },
      limit: {
        type: 'number',
        description: 'Max results. Default 50, max 200.',
      },
    },
  },
};

export const handleTimeline: ToolHandler = async (args, storage) => {
  const opts = (args ?? {}) as {
    aroundId?: string;
    at?: string;
    beforeHours?: number;
    afterHours?: number;
    limit?: number;
  };
  const hits = storage.listObservationsAround(opts);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            anchor: opts.aroundId ?? opts.at ?? 'now',
            beforeHours: opts.beforeHours ?? 1,
            afterHours: opts.afterHours ?? 1,
            count: hits.length,
            hits,
          },
          null,
          2,
        ),
      },
    ],
  };
};
