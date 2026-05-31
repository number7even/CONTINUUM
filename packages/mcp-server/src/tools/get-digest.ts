/**
 * continuum_get_digest — composed narrative for a time window.
 * V0 returns template-based digests; V0.5+ adds ruvllm/ruv-FANN narratives.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { templateDigest } from '../briefing.js';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const getDigestTool: ToolDefinition = {
  name: 'continuum_get_digest',
  description:
    'Fetch a composed narrative for a time window. V0 returns template-based digests ' +
    'derived from recent checkpoints + observations. V0.5+ adds ruvllm/ruv-FANN local-AI ' +
    'narrative generation.',
  inputSchema: {
    type: 'object',
    properties: {
      window: {
        type: 'string',
        enum: ['24h', '7d', 'session'],
        description: 'Time window. Default 24h.',
      },
    },
  },
};

export const handleGetDigest: ToolHandler = async (args, storage) => {
  const window = (args as { window?: string })?.window ?? '24h';
  const snapshots = storage.listSnapshots(10);
  const hoursWindow = window === '7d' ? 168 : window === 'session' ? 8 : 24;
  const cutoff = new Date(Date.now() - hoursWindow * 3600 * 1000).toISOString();
  const recent = snapshots.filter(s => s.timestamp >= cutoff);

  const narrative = templateDigest(recent, window);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            window,
            windowStart: cutoff,
            windowEnd: new Date().toISOString(),
            narrative,
            snapshotsInWindow: recent.length,
          },
          null,
          2,
        ),
      },
    ],
  };
};
