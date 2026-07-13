/**
 * continuum_validate — V (a SEPARATE LLM, the linesman) submits a signed VALIDATION, then
 * the server mechanically runs T (the referee).
 *
 * V checks SEMANTICS (scope, out-of-bounds impact, privacy leaks) and signs a `validation`
 * entry (confirm | dispute) with its OWN key — a different key than A's (enforced by the
 * ledger's distinct-key rule). On `confirm`, the server then runs the claim's verifyCommand
 * as cold mechanical execution (T), signs the `test` result with its server-held tester key,
 * and welds it in. V advises; V has no vote — only H (attest) can finalize.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { todoTaskRef } from '@number7even/continuum-core';
import type { LedgerEntry } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const validateTool: ToolDefinition = {
  name: 'continuum_validate',
  description:
    'V (an independent validator LLM) submits a signed VALIDATION of a claim — confirm or ' +
    'dispute, with reasoning on scope / out-of-bounds impact / privacy. Pass todoId and a ' +
    'signed `validation` LedgerEntry (role "validator", a DIFFERENT key than the claimant). ' +
    'On confirm, the server mechanically runs the claim\'s verifyCommand (T, the referee) and ' +
    'records the exit code. A disputed claim → CONTESTED; a failing test → REFUTED.',
  inputSchema: {
    type: 'object',
    properties: {
      todoId: { type: 'string' },
      entry: { type: 'object', description: 'A signed LedgerEntry of kind "validation" (role "validator").' },
    },
    required: ['todoId', 'entry'],
  },
};

export const handleValidate: ToolHandler = async (args, storage) => {
  const { todoId, entry } = (args ?? {}) as { todoId?: string; entry?: LedgerEntry };
  if (!todoId || !entry) throw new Error('todoId and a signed entry are required');
  if (entry.kind !== 'validation') throw new Error(`continuum_validate expects a "validation" entry, got "${entry.kind}"`);
  const taskRef = todoTaskRef(todoId);

  let block = storage.submitLedgerEntry(taskRef, entry);
  const confirmed = (entry.payload as { verdict?: string }).verdict === 'confirm';

  // T — mechanical referee. Only runs on a confirm; runs the CLAIM's verifyCommand.
  let test: { verifyCommand: string; exitCode: number } | null = null;
  if (confirmed) {
    const claim = storage.getTruthThread(taskRef).at(-1)?.entries.find(e => e.kind === 'claim');
    const cmd = (claim?.payload as { verifyCommand?: string } | undefined)?.verifyCommand;
    if (cmd) {
      let exitCode = 0; let out = '';
      try { out = execSync(cmd, { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (e) { const err = e as { status?: number; stdout?: string; stderr?: string }; exitCode = err.status ?? 1; out = (err.stdout ?? '') + (err.stderr ?? ''); }
      const outputHash = createHash('sha256').update(out).digest('hex');
      block = storage.submitTest(taskRef, { verifyCommand: cmd, exitCode, outputHash });
      test = { verifyCommand: cmd, exitCode };
    }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify({ taskRef, verdict: block.verdict, test, blockHash: block.blockHash }, null, 2) }],
  };
};
