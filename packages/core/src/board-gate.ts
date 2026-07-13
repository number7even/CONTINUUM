/**
 * board-gate.ts — the Truth-Ledger board classifier. Pure, no I/O.
 *
 * Upgrades the board's proof gate from single-signature (a green verifyCommand = just T,
 * the mechanical test) to the FULL multi-signature TruthBlock: a task reaches the DONE
 * column ONLY when its ledger verdict is PROVEN — i.e. distinct-key signatures from
 * A (executor), V (validator), T (tester, exit 0), and H (human accept). Anything less
 * is REVIEW (proof green, awaiting the human leap), SKIPPED (unproven "done"), or FAILED
 * (disputed / refuted / collusion). "Done is not a button" — now it's four signatures.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { Verdict } from './truth-ledger.js';

export type BoardColumn = 'RUNNING' | 'REVIEW' | 'DONE' | 'SKIPPED' | 'BLOCKED' | 'FAILED';

/** The canonical ledger taskRef for a todo. One convention, everywhere, so a todo and its
 *  TruthBlock thread always link. */
export const todoTaskRef = (todoId: string): string => `todo:${todoId}`;

export interface BoardClassifyInput {
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  /** The latest ledger verdict for this task, or null if it has no TruthBlock yet. */
  verdict: Verdict | null;
  /** False when a `blockedBy` upstream is not itself DONE. Defaults true. */
  upstreamAllDone?: boolean;
}

/** Map (todo status + ledger verdict) → board column. The DONE column is gated: only a
 *  PROVEN verdict opens it — never the raw `status='done'` flag. This is the mechanical
 *  boundary the whole ledger exists to enforce (P4 · P9). */
export function truthBoardColumn(input: BoardClassifyInput): BoardColumn {
  const { status, verdict, upstreamAllDone = true } = input;

  // A disputed / refuted / structurally-invalid claim is a caught lie — never DONE, never hidden.
  if (verdict === 'REFUTED' || verdict === 'CONTESTED' || verdict === 'INVALID') return 'FAILED';

  // The only door to DONE: a full, distinct-key, human-accepted, mechanically-tested block.
  if (verdict === 'PROVEN') return 'DONE';

  // Proof is green (A+V+T) but H has not made the leap — awaiting the human signature (P9).
  if (verdict === 'PENDING_HUMAN') return 'REVIEW';

  // Upstream dependency not satisfied.
  if (!upstreamAllDone || status === 'blocked') return 'BLOCKED';

  // Marked done, but with no PROVEN block behind it → unproven "done" never reaches DONE.
  if (status === 'done') return 'SKIPPED';

  // Otherwise it's live work.
  return 'RUNNING';
}
