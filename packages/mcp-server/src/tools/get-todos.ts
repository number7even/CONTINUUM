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

/** The ledger evidence a board card needs: the verdict + the verifyCommand T ran + the
 *  exact commit hashes the claim landed + the test's exit code. Pulled from the latest
 *  TruthBlock so the card can tie a task to its git reality. */
interface LedgerSummary { verdict: string | null; verifyCommand: string | null; commitShas: string[]; testExitCode: number | null }

export const handleGetTodos: ToolHandler = async (args, storage) => {
  const { status, limit } = (args ?? {}) as { status?: Todo['status']; limit?: number };
  const todos = storage.listTodos({ status, limit });

  // Enrich each todo with its real ledger verdict + evidence + the gated board column. DONE
  // is only ever surfaced for a PROVEN TruthBlock — a self-reported status='done' with no
  // proof lands in SKIPPED, never DONE (the whole point of the ledger).
  const ledgerById = new Map<string, LedgerSummary>(todos.map(t => {
    const latest = storage.getTruthThread(todoTaskRef(t.id)).at(-1);
    if (!latest) return [t.id, { verdict: null, verifyCommand: null, commitShas: [], testExitCode: null }];
    const claim = latest.entries.find(e => e.kind === 'claim')?.payload as { verifyCommand?: string; commitShas?: string[] } | undefined;
    const test = latest.entries.find(e => e.kind === 'test')?.payload as { exitCode?: number } | undefined;
    return [t.id, { verdict: latest.verdict, verifyCommand: claim?.verifyCommand ?? null, commitShas: claim?.commitShas ?? [], testExitCode: test?.exitCode ?? null }];
  }));
  const columnFor = (t: Todo): string => truthBoardColumn({
    status: t.status,
    verdict: (ledgerById.get(t.id)?.verdict ?? null) as never,
    upstreamAllDone: (t.blockedBy ?? []).every(bid => {
      const b = todos.find(x => x.id === bid);
      return b ? truthBoardColumn({ status: b.status, verdict: (ledgerById.get(bid)?.verdict ?? null) as never }) === 'DONE' : true;
    }),
  });
  const enriched = todos.map(t => {
    const l = ledgerById.get(t.id)!;
    return { ...t, ledgerVerdict: l.verdict, boardColumn: columnFor(t), verifyCommand: l.verifyCommand ?? t.verifyCommand ?? null, commitShas: l.commitShas, testExitCode: l.testExitCode };
  });

  return {
    content: [
      { type: 'text', text: JSON.stringify({ count: enriched.length, todos: enriched }, null, 2) },
    ],
  };
};
