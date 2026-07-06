/**
 * kaizen.test.ts — the Kaizen grader refuses to pass a plan on a claim.
 * Run via: node --test packages/core/dist/kaizen.test.js (after `tsc -b`).
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KAIZEN_POINTS, blankLedgerEntry, gradeLedgerEntry } from './kaizen.js';
import type { KaizenLedgerEntry } from './kaizen.js';

/** A fully-passing entry: all 8 graded with evidence, adversarial held, blind run clean. */
function readyEntry(): KaizenLedgerEntry {
  const e = blankLedgerEntry('01 build website', 'sonnet');
  e.draftPath = 'tasks/01/draft.md';
  e.grades = e.grades.map((g) => ({ ...g, pass: true, evidence: `point ${g.point} satisfied` }));
  e.adversarial = [{ attack: 'ambiguous fork at step 3', result: 'held', }];
  e.blindRun = { ran: true, executor: 'sonnet', completedWithoutQuestions: true, transcriptRef: 'obs:abc' };
  return e;
}

test('a fully-satisfied entry is kaizen-ready (8/8)', () => {
  const v = gradeLedgerEntry(readyEntry());
  assert.equal(v.ready, true);
  assert.equal(v.score, `${KAIZEN_POINTS}/${KAIZEN_POINTS}`);
  assert.deepEqual(v.failing, []);
});

test('point 8 is a RUN, not a claim — no blind run => not ready', () => {
  const e = readyEntry();
  delete e.blindRun; // claimed-ready but never executed
  const v = gradeLedgerEntry(e);
  assert.equal(v.ready, false);
  assert.ok(v.failing.includes(8));
  assert.ok(v.reasons.some((r) => /claim is not a run/.test(r)));
});

test('a pass without evidence does not count', () => {
  const e = readyEntry();
  e.grades[2] = { point: 3, pass: true, evidence: '' };
  const v = gradeLedgerEntry(e);
  assert.equal(v.ready, false);
  assert.ok(v.failing.includes(3));
});

test('an adversarial attack that broke it needs a patch (point 7)', () => {
  const e = readyEntry();
  e.adversarial = [{ attack: 'race at step 5', result: 'broke' }]; // no patch
  const v = gradeLedgerEntry(e);
  assert.equal(v.ready, false);
  assert.ok(v.failing.includes(7));
});

test('the executor tier must be named', () => {
  const e = readyEntry();
  e.executor = '';
  const v = gradeLedgerEntry(e);
  assert.equal(v.ready, false);
  assert.ok(v.reasons.some((r) => /named model/.test(r)));
});

test('blank template starts 0/8 and fails every point', () => {
  const v = gradeLedgerEntry(blankLedgerEntry('m', 'haiku'));
  assert.equal(v.ready, false);
  assert.equal(v.failing.length, KAIZEN_POINTS);
});
