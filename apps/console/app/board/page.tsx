/**
 * /board — CONTINUUM's verifiable Kanban. The visible embodiment of
 * "PM that can't lie": tasks classified into the 6-state model, DONE gated on
 * a passing verifyCommand.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import Board from './Board';

export const dynamic = 'force-dynamic';

export default function BoardPage() {
  return <Board />;
}
