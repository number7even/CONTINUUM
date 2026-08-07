/**
 * continuum_open_claim — A (the executor LLM) opens a signed CLAIM against a todo.
 *
 * The caller signs a `claim` LedgerEntry with its OWN key (client-side) and submits it. The
 * server verifies the signature against the registered public key — a forged or unregistered
 * key is rejected, so no caller can impersonate another actor. This is step 1 of the truth
 * round: A → V → T → H. A claim alone is never DONE (verdict UNVERIFIED until V + T + H).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { todoTaskRef } from '@number7even/continuum-core';
import type { LedgerEntry } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const openClaimTool: ToolDefinition = {
  name: 'continuum_open_claim',
  description:
    'A (the executor) opens a signed CLAIM that a todo is done. Pass todoId and a signed ' +
    '`claim` LedgerEntry (kind:"claim", role:"executor", signed by your registered key). The ' +
    'claim SHOULD carry verifyCommand — the shell command T will mechanically run. This alone ' +
    'does NOT complete the task: it must still be validated (V), tested (T, exit 0), and ' +
    'accepted (H) before the TruthBlock is PROVEN and the todo can enter DONE.',
  inputSchema: {
    type: 'object',
    properties: {
      todoId: { type: 'string', description: 'The todo this claim is about.' },
      entry: { type: 'object', description: 'A signed LedgerEntry of kind "claim" (role "executor").' },
    },
    required: ['todoId', 'entry'],
  },
};

export const handleOpenClaim: ToolHandler = async (args, storage) => {
  const { todoId, entry } = (args ?? {}) as { todoId?: string; entry?: LedgerEntry };
  if (!todoId || !entry) throw new Error('todoId and a signed entry are required');
  if (entry.kind !== 'claim') throw new Error(`continuum_open_claim expects a "claim" entry, got "${entry.kind}"`);
  const taskRef = todoTaskRef(todoId);
  const block = storage.submitLedgerEntry(taskRef, entry);
  return {
    content: [{ type: 'text', text: JSON.stringify({ taskRef, verdict: block.verdict, blockHash: block.blockHash }, null, 2) }],
  };
};
