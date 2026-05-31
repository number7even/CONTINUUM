/**
 * continuum_get_state — fetch the StateSnapshot in effect at a timestamp.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const getStateTool: ToolDefinition = {
  name: 'continuum_get_state',
  description:
    'Fetch the StateSnapshot in effect at the given ISO-8601 timestamp (or now if omitted). ' +
    'Answers "what was true on May 14?" — returns the most recent snapshot at or before ' +
    'the requested time. Returns null if no snapshots exist yet.',
  inputSchema: {
    type: 'object',
    properties: {
      at: {
        type: 'string',
        description: 'ISO-8601 timestamp. Defaults to now.',
      },
    },
  },
};

export const handleGetState: ToolHandler = async (args, storage) => {
  const at = (args as { at?: string })?.at;
  const snapshot = storage.getStateAt(at);
  if (!snapshot) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message:
              'No checkpoints recorded yet. Use continuum_record_checkpoint to create the first one.',
          }),
        },
      ],
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }],
  };
};
