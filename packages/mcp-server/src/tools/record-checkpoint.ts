/**
 * continuum_record_checkpoint — write an immutable StateSnapshot.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { CheckpointInput } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const recordCheckpointTool: ToolDefinition = {
  name: 'continuum_record_checkpoint',
  description:
    'Write an immutable state snapshot. Provide active/dormant/broken entries and a reason. ' +
    'Returns the persisted snapshot with hash. Use this at session end, after significant ' +
    'commits, or when state has materially changed.',
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Why this checkpoint — manual reason or auto-trigger label.',
      },
      active: {
        type: 'array',
        description: 'Entries currently active in production.',
        items: { $ref: '#/definitions/StateEntry' },
      },
      dormant: {
        type: 'array',
        description: 'Entries built but not the active path.',
        items: { $ref: '#/definitions/StateEntry' },
      },
      broken: {
        type: 'array',
        description: 'Known failures with repro.',
        items: { $ref: '#/definitions/StateEntry' },
      },
    },
    required: ['reason', 'active'],
    definitions: {
      StateEntry: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          where: { type: 'string' },
          verifyCommand: { type: 'string' },
          landedAt: { type: 'string' },
          verifiedAt: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'where', 'verifyCommand', 'verifiedAt'],
      },
    },
  },
};

export const handleRecordCheckpoint: ToolHandler = async (args, storage) => {
  const input = args as unknown as CheckpointInput;
  if (!input?.reason || !Array.isArray(input?.active)) {
    throw new Error('reason and active[] are required');
  }
  const snapshot = storage.recordCheckpoint(input);
  return {
    content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }],
  };
};
