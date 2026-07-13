/**
 * continuum_get_todos — list todos with optional status filter, each carrying its TRUE
 * Truth-Ledger verdict + board column so the console renders the real 6-state model
 * (DONE only for a PROVEN block) rather than a self-reported status.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { todoTaskRef, truthBoardColumn } from '@number7even/continuum-core';
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

  // Enrich each todo with its real ledger verdict + the gated board column. DONE is only
  // ever surfaced for a PROVEN TruthBlock — a self-reported status='done' with no proof
  // lands in SKIPPED, never DONE (the whole point of the ledger).
  const verdictById = new Map(todos.map(t => [t.id, storage.verdictForTask(todoTaskRef(t.id))]));
  const columnFor = (t: Todo): string => truthBoardColumn({
    status: t.status,
    verdict: verdictById.get(t.id) ?? null,
    upstreamAllDone: (t.blockedBy ?? []).every(bid => {
      const b = todos.find(x => x.id === bid);
      return b ? truthBoardColumn({ status: b.status, verdict: verdictById.get(bid) ?? null }) === 'DONE' : true;
    }),
  });
  const enriched = todos.map(t => ({ ...t, ledgerVerdict: verdictById.get(t.id) ?? null, boardColumn: columnFor(t) }));

  return {
    content: [
      { type: 'text', text: JSON.stringify({ count: enriched.length, todos: enriched }, null, 2) },
    ],
  };
};
