/**
 * continuum_create_todo — create a new todo with optional verifyCommand.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { CreateTodoInput } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const createTodoTool: ToolDefinition = {
  name: 'continuum_create_todo',
  description:
    'Create a new todo in the pipeline. Use this when a discussion produces a commitment that ' +
    'should be tracked through to verification. refs[] links to observation IDs that motivated ' +
    'the todo; verifyCommand is a shell command that proves the todo is satisfied when it returns 0. ' +
    'IMPORTANT: for deployment, release, migration, or "ship" todos, you MUST populate verifyCommand — ' +
    'it is the gate that proves the change actually landed (e.g. health-check curl, smoke test, ' +
    'grep for the deployed artifact). Todos without verifyCommand cannot be auto-resolved by ' +
    'scheduled clients (e.g. cron-driven Hermes) and must be closed manually.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Observation IDs that motivated this todo.',
      },
      verifyCommand: {
        type: 'string',
        description:
          'Shell command that exits 0 when satisfied. REQUIRED for any deploy/release/migration ' +
          'todo so the verify-then-dissolve loop can close it without human approval.',
      },
      blockedBy: {
        type: 'array',
        items: { type: 'string' },
        description: 'Other Todo IDs that must complete first.',
      },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'blocked', 'done'],
        description: 'Initial status. Default "open".',
      },
    },
    required: ['title'],
  },
};

export const handleCreateTodo: ToolHandler = async (args, storage) => {
  const input = args as unknown as CreateTodoInput;
  if (!input?.title?.trim()) {
    throw new Error('title is required');
  }
  const todo = storage.createTodo(input);
  return {
    content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
  };
};
