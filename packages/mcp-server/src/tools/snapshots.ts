/**
 * continuum_snapshots — the append-only, hash-sealed product_state ledger.
 *
 * The cryptographic chain of truth: each snapshot is a verified moment carrying
 * its SHA-256 canonical hash (tamper-evidence) + its active[] (verify-green in
 * production) / dormant[] (built, not the active path) / broken[] (known
 * failures) StateEntry arrays — each entry with its verifyCommand witness. This
 * is how CONTINUUM proves a state reached DONE only because a shell command
 * exited 0, not because anyone asserted it.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const snapshotsTool: ToolDefinition = {
  name: 'continuum_snapshots',
  description:
    'List the product_state ledger — the append-only, hash-sealed checkpoints (newest first). ' +
    'Each snapshot is a verified moment: its SHA-256 canonical hash (tamper-evidence), its reason, ' +
    'and its active[] / dormant[] / broken[] StateEntry arrays (each entry: name, where, verifyCommand, ' +
    'verifiedAt). active = verify-green in production; dormant = built but not the active path; broken = ' +
    'known failures with repro. This is the cryptographic chain of truth — proof that a state reached ' +
    'DONE only because its verifyCommand exited 0.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max snapshots to return (newest first). Default 20.' },
    },
  },
};

export const handleSnapshots: ToolHandler = async (args, storage) => {
  const { limit } = (args ?? {}) as { limit?: number };
  const snapshots = storage.listSnapshots(typeof limit === 'number' && limit > 0 ? limit : 20);
  return {
    content: [{ type: 'text', text: JSON.stringify({ count: snapshots.length, snapshots }, null, 2) }],
  };
};
