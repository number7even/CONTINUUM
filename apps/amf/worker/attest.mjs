#!/usr/bin/env node
/**
 * attest.mjs — the H-attest half of the unified Approve click (Rank-2 lack).
 *
 * The dashboard's Approve previously moved the queue + fired publish but skipped the
 * cryptographic H signature — losing the proof that the human owns the IP. This module
 * mints it: given a brief id, find its welded board todo (refs `amf-artifact:<id>`),
 * sign a `decision: accept` with the OPERATOR'S LOCAL human key (the same key the console
 * board uses — one identity, one signature, wherever you click), and weld it into the
 * Truth Ledger. PROVEN is only reachable when A+V+T are already green (the ledger's law —
 * this module cannot shortcut it).
 *
 * Honest failure modes (P4, all loud, none blocking the queue-approve itself):
 *   no human key       → 'no-human-key'   (run scripts/setup-human-key.mjs once)
 *   no welded todo     → 'not-welded'     (the artifact never entered the ledger)
 *   T failed / V dispute → the ledger verdict stands (REFUTED/CONTESTED — attest can't fix it)
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage, todoTaskRef } from '@number7even/continuum-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNER = resolve(HERE, '..', '..', 'console', 'lib', 'truth-sign.mjs');

/** Mint the operator's H-attest for an intaken/welded artifact brief. */
export async function attestArtifact(briefId, { project = process.env.CONTINUUM_PROJECT_ID || 'graph-demo' } = {}) {
  const { loadHumanKey, signDecision } = await import(SIGNER);
  const kp = loadHumanKey();
  if (!kp) return { ok: false, why: 'no-human-key', note: 'run: node scripts/setup-human-key.mjs (once, out-of-band)' };

  const storage = await openStorage(project);
  const ref = `amf-artifact:${briefId}`;
  const todo = storage.listTodos().find(t => (t.refs ?? []).includes(ref));
  if (!todo) return { ok: false, why: 'not-welded', note: `no board todo carries ${ref} — the artifact never entered the ledger (run weld-artifact/intake first)` };

  const before = storage.verdictForTask(todoTaskRef(todo.id));
  const entry = signDecision(kp, todo.id, 'accept');
  let block;
  try { block = storage.submitLedgerEntry(todoTaskRef(todo.id), entry); }
  catch (e) { return { ok: false, why: 'ledger-refused', note: String(e.message) }; }
  return { ok: block.verdict === 'PROVEN', verdict: block.verdict, before, todoId: todo.id, blockHash: block.blockHash };
}

// CLI:  node attest.mjs <briefId> [--project graph-demo]
if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  const pi = process.argv.indexOf('--project');
  if (!id) { console.error('usage: node attest.mjs <briefId> [--project <id>]'); process.exit(2); }
  const res = await attestArtifact(id, pi > 0 ? { project: process.argv[pi + 1] } : {});
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}
