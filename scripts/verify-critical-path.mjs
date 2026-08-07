#!/usr/bin/env node
// verify-critical-path.mjs — proof-gate for the board's Visual DAG critical path (Workspace D1).
//
// The board already shows LEVERAGE (breadth — how many tasks one unblocks). This gate proves
// the new DEPTH axis: computeCriticalPath finds the longest chain of `blockedBy` dependencies —
// the chain that gates time-to-DONE — and marks exactly the tasks on it. The board renders this
// as the visible ribbon: a downstream task cannot reach the proof-gated DONE column until every
// upstream link in the chain is itself PROVEN.
//
// Asserts: a linear chain is found end-to-end; a shorter parallel branch is NOT the path; a
// diamond picks the deeper arm; dangling blockers are dropped (no fabricated node, P4); a cycle
// terminates instead of hanging; depth is monotonic along the path.
//
//   node scripts/verify-critical-path.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { computeCriticalPath } from '../apps/console/lib/board-model.mjs';

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const T = (id, ...blockedBy) => ({ id, blockedBy });

// ── 1. Linear chain A ← B ← C ← D (each blockedBy the previous) ─────────────
{
  const r = computeCriticalPath([T('A'), T('B', 'A'), T('C', 'B'), T('D', 'C')]);
  check('linear chain: path is A→B→C→D, root to sink', JSON.stringify(r.path) === JSON.stringify(['A', 'B', 'C', 'D']), r.path.join('→'));
  check('linear chain: length 4', r.length === 4, String(r.length));
  check('every node on a single chain is on the path', ['A', 'B', 'C', 'D'].every(id => r.onPath.has(id)));
  check('depth is monotonic along the path', r.depth.get('A') === 1 && r.depth.get('B') === 2 && r.depth.get('C') === 3 && r.depth.get('D') === 4);
}

// ── 2. A short parallel branch is NOT the critical path ─────────────────────
{
  // Long arm: A←B←C←D (4). Short arm: X←Y (2), independent. Critical = the long arm.
  const r = computeCriticalPath([T('A'), T('B', 'A'), T('C', 'B'), T('D', 'C'), T('X'), T('Y', 'X')]);
  check('the long arm wins over the short branch', r.length === 4 && !r.onPath.has('X') && !r.onPath.has('Y'), `path=${r.path.join('→')}`);
}

// ── 3. Diamond — the DEEPER arm is chosen ───────────────────────────────────
{
  // D blockedBy B and C; B blockedBy A; C blockedBy E blockedBy A → the C arm is deeper.
  const r = computeCriticalPath([T('A'), T('B', 'A'), T('E', 'A'), T('C', 'E'), T('D', 'B', 'C')]);
  check('diamond: the deeper arm (A→E→C→D) is the critical path', JSON.stringify(r.path) === JSON.stringify(['A', 'E', 'C', 'D']), r.path.join('→'));
  check('the shallow arm node B is off-path', !r.onPath.has('B'));
}

// ── 4. Dangling blocker → dropped, never a fabricated node (P4) ─────────────
{
  const r = computeCriticalPath([T('A', 'GHOST'), T('B', 'A')]);
  check('a blocker no task carries is dropped, not invented', !r.onPath.has('GHOST') && !r.path.includes('GHOST') && r.length === 2, r.path.join('→'));
}

// ── 5. A cycle must terminate, not hang the board ───────────────────────────
{
  let finished = false;
  const r = computeCriticalPath([T('A', 'B'), T('B', 'A'), T('C', 'B')]);   // A↔B cycle + C
  finished = true;
  check('a cycle terminates (guarded), still returns a path', finished && Array.isArray(r.path));
}

// ── 6. Empty / no-edge inputs are safe ──────────────────────────────────────
{
  const empty = computeCriticalPath([]);
  const flat = computeCriticalPath([T('A'), T('B'), T('C')]);   // no dependencies
  check('empty graph → empty path, length 0', empty.length === 0 && empty.path.length === 0);
  check('no-edge graph → every node depth 1, a single-node path', flat.length === 1 && [...flat.depth.values()].every(d => d === 1));
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('CRITICAL_PATH_VERIFY: GREEN — the board finds the longest blocker chain (depth),');
  console.log('drops dangling blockers, survives cycles, and marks exactly the tasks that gate DONE.');
  process.exit(0);
} else { console.log('CRITICAL_PATH_VERIFY: RED'); process.exit(1); }
