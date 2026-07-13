/**
 * truth-ledger-store.ts — persistence for the multi-signature Truth Ledger.
 *
 * The engine (truth-ledger.ts) is pure. This is where blocks and public keys land:
 * a public-key registry (`truth_identities`) and the append-only, hash-linked block
 * chain (`truth_blocks`). Private keys NEVER touch this store — H's stays off-repo.
 *
 * Append-only invariant, enforced here (not just hoped for): a new block's prevHash
 * MUST equal the current head's blockHash (or GENESIS for the first). You cannot
 * rewrite or fork history — you can only extend it, or supersede a claim with a new
 * signed CORRECTION block. The DB's UNIQUE(idx) is the belt to this suspenders.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type Database from 'better-sqlite3';
import { finalizeBlock, verifyEntry, GENESIS } from './truth-ledger.js';
import type { Identity, LedgerEntry, TruthBlock, Verdict } from './truth-ledger.js';

interface IdentityRow { key_id: string; role: Identity['role']; public_key: string }
interface BlockRow { block_hash: string; idx: number; prev_hash: string; task_ref: string; entries: string; verdict: string }

/** Register a public key (append-only; re-registering the same keyId is a no-op). */
export function registerIdentity(db: Database.Database, id: Identity): void {
  db.prepare(
    `INSERT INTO truth_identities (key_id, role, public_key, registered_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key_id) DO NOTHING`,
  ).run(id.keyId, id.role, id.publicKey);
}

/** The public-key registry — the identities verifyLedger/evaluateVerdict check against. */
export function listIdentities(db: Database.Database): Identity[] {
  const rows = db.prepare(`SELECT key_id, role, public_key FROM truth_identities`).all() as IdentityRow[];
  return rows.map(r => ({ keyId: r.key_id, role: r.role, publicKey: r.public_key }));
}

const toBlock = (r: BlockRow): TruthBlock => ({
  index: r.idx, prevHash: r.prev_hash, taskRef: r.task_ref,
  entries: JSON.parse(r.entries) as LedgerEntry[], verdict: r.verdict as Verdict, blockHash: r.block_hash,
});

/** The current chain head (highest index), or null on an empty ledger. */
export function latestTruthBlock(db: Database.Database): TruthBlock | null {
  const r = db.prepare(`SELECT * FROM truth_blocks ORDER BY idx DESC LIMIT 1`).get() as BlockRow | undefined;
  return r ? toBlock(r) : null;
}

/** All blocks in chain order — the whole ledger (for verifyLedger / audit). */
export function allTruthBlocks(db: Database.Database): TruthBlock[] {
  return (db.prepare(`SELECT * FROM truth_blocks ORDER BY idx ASC`).all() as BlockRow[]).map(toBlock);
}

/** The thread for one task, chain order. */
export function getTruthThread(db: Database.Database, taskRef: string): TruthBlock[] {
  return (db.prepare(`SELECT * FROM truth_blocks WHERE task_ref = ? ORDER BY idx ASC`).all(taskRef) as BlockRow[]).map(toBlock);
}

/** The most recent verdict recorded for a task, or null if the task has no block yet.
 *  This is what the Board gate consults: only 'PROVEN' opens the DONE column. */
export function verdictForTask(db: Database.Database, taskRef: string): Verdict | null {
  const r = db.prepare(`SELECT verdict FROM truth_blocks WHERE task_ref = ? ORDER BY idx DESC LIMIT 1`).get(taskRef) as { verdict: string } | undefined;
  return r ? (r.verdict as Verdict) : null;
}

/** Persist an already-finalized block, enforcing the append-only chain link. Throws on
 *  any attempt to fork/rewrite (prevHash ≠ head) or replay (duplicate blockHash/idx). */
export function appendTruthBlock(db: Database.Database, block: TruthBlock): TruthBlock {
  if (!block.blockHash) throw new Error('appendTruthBlock: block is not finalized (no blockHash)');
  const head = latestTruthBlock(db);
  const expectedPrev = head?.blockHash ?? GENESIS;
  if (block.prevHash !== expectedPrev) {
    throw new Error(`appendTruthBlock: append-only violation — prevHash ${block.prevHash.slice(0, 12)}… ≠ head ${expectedPrev.slice(0, 12)}…`);
  }
  const expectedIdx = head ? head.index + 1 : 0;
  if (block.index !== expectedIdx) throw new Error(`appendTruthBlock: index ${block.index} ≠ expected ${expectedIdx}`);
  db.prepare(
    `INSERT INTO truth_blocks (block_hash, idx, prev_hash, task_ref, entries, verdict, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(block.blockHash, block.index, block.prevHash, block.taskRef, JSON.stringify(block.entries), block.verdict);
  return block;
}

/** Submit ONE signed entry for a task and re-seal the thread. This is the over-the-wire
 *  entry point: the entry MUST already be signed by a registered key (verified here — a
 *  forged or unregistered signature is rejected, so an LLM cannot impersonate another actor).
 *  Entries accumulate one-per-kind (a newer entry of the same kind supersedes); the resulting
 *  block's verdict reflects the whole accumulated round. */
export function submitLedgerEntry(db: Database.Database, taskRef: string, entry: LedgerEntry): TruthBlock {
  if (entry.taskRef !== taskRef) throw new Error(`submitLedgerEntry: entry.taskRef (${entry.taskRef}) ≠ ${taskRef}`);
  const idById = new Map(listIdentities(db).map(i => [i.keyId, i]));
  if (!verifyEntry(entry, idById.get(entry.by))) {
    throw new Error(`submitLedgerEntry: rejected — ${entry.kind} by ${entry.by} has an unregistered key or an invalid signature`);
  }
  const thread = getTruthThread(db, taskRef);
  const latest = thread[thread.length - 1];
  const byKind = new Map<string, LedgerEntry>();
  for (const e of latest?.entries ?? []) byKind.set(e.kind, e);
  byKind.set(entry.kind, entry);       // newest of a kind wins (e.g. a re-validation)
  return sealAndAppend(db, { taskRef, entries: [...byKind.values()] });
}

/** Seal a set of entries into the next block on the chain and persist it. The verdict is
 *  DERIVED from the entries against the registered identities — never asserted. Returns the
 *  finalized block (inspect `.verdict`; only 'PROVEN' opens DONE). */
export function sealAndAppend(
  db: Database.Database,
  input: { taskRef: string; entries: LedgerEntry[] },
): TruthBlock {
  const identities = listIdentities(db);
  const head = latestTruthBlock(db);
  const block = finalizeBlock(
    { index: head ? head.index + 1 : 0, prevHash: head?.blockHash ?? GENESIS, taskRef: input.taskRef, entries: input.entries },
    identities,
  );
  return appendTruthBlock(db, block);
}
