/**
 * continuum_next_tasks — the PM brain. Answer "what's next?" from the plan.
 *
 * Reads the todo dependency DAG and returns the ACTIONABLE set: tasks that are
 * not done and not blocked (every blockedBy is done), ordered by downstream
 * leverage. Each carries its derived state, its verifyCommand (proof gate), and
 * its dossier refs. A connected AI client calls this to pull verifiable work.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { computeNextTasks } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const nextTasksTool: ToolDefinition = {
  name: 'continuum_next_tasks',
  description:
    'The PM brain — answer "what should I work on next?" from the verifiable plan. Reads the ' +
    'todo dependency DAG and returns the ACTIONABLE set: tasks that are not done and not blocked ' +
    '(every blockedBy is DONE), ordered by downstream leverage (completing them unblocks the most ' +
    'other work). Each task carries: its derived state (READY / RUNNING / BLOCKED / DONE), its ' +
    'verifyCommand (the proof gate — run continuum_update_todo to done only after it passes), and ' +
    'its refs (Observation IDs = the task dossier). Also returns the currently-blocked tasks so you ' +
    'see the critical path. Pull work from here instead of guessing.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Max actionable tasks to return. Default 20.',
      },
    },
  },
};

export const handleNextTasks: ToolHandler = async (args, storage) => {
  const { limit } = (args ?? {}) as { limit?: number };
  const cap = typeof limit === 'number' && limit > 0 ? limit : 20;
  const result = computeNextTasks(storage.listTodos());
  const payload = {
    ...result,
    actionable: result.actionable.slice(0, cap),
    blocked: result.blocked.slice(0, cap),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
};
