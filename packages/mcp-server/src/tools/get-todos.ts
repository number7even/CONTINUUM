/**
 * continuum_get_todos — list todos with optional status filter.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { Todo } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const getTodosTool: ToolDefinition = {
  name: 'continuum_get_todos',
  description:
    'List todos in the live pipeline. Pass status="open" (or "in_progress" / "blocked" / "done") ' +
    'to filter, or omit to return all. Newest first. The continuum://todos/open resource is ' +
    'the cheap polling surface; this tool is for filtered lookups.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'blocked', 'done'],
        description: 'Filter by status. Omit for all statuses.',
      },
      limit: {
        type: 'number',
        description: 'Max results. Default 100.',
      },
    },
  },
};

export const handleGetTodos: ToolHandler = async (args, storage) => {
  const { status, limit } = (args ?? {}) as { status?: Todo['status']; limit?: number };
  const todos = storage.listTodos({ status, limit });
  return {
    content: [
      { type: 'text', text: JSON.stringify({ count: todos.length, todos }, null, 2) },
    ],
  };
};
