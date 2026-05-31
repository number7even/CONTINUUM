/**
 * continuum_update_todo — mutate status/title/etc. on a todo.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { UpdateTodoInput } from '@continuum/core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const updateTodoTool: ToolDefinition = {
  name: 'continuum_update_todo',
  description:
    'Update mutable fields on a todo — status transitions, title edits, verifyCommand changes, ' +
    'blockedBy dependencies. Transitioning to status="done" stamps completedAt automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'blocked', 'done'],
      },
      title: { type: 'string' },
      verifyCommand: { type: ['string', 'null'] },
      blockedBy: { type: 'array', items: { type: 'string' } },
      refs: { type: 'array', items: { type: 'string' } },
    },
    required: ['id'],
  },
};

export const handleUpdateTodo: ToolHandler = async (args, storage) => {
  const input = args as unknown as UpdateTodoInput;
  if (!input?.id) {
    throw new Error('id is required');
  }
  const todo = storage.updateTodo(input);
  return {
    content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
  };
};
