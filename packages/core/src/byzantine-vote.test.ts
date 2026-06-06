/**
 * byzantine-vote.test.ts — property tests for the W26-4 BFT primitive.
 *
 * Coverage:
 *   - empty input edge case
 *   - single-candidate trivial case
 *   - unanimous agreement
 *   - majority with one dissent
 *   - tie-break determinism (lowest agentId)
 *   - BFT bound: f < ⌈N/3⌉ canonical wins under random faulty injection
 *   - BFT bound: f >= ⌈N/3⌉ may fail (documented, not asserted as bug)
 *   - independent voting per inputId
 *   - custom canonicalize handles semantically-equivalent values
 *
 * Run via:
 *   node --test packages/core/dist/byzantine-vote.test.js
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byzantineVote, type BFTCandidate } from './byzantine-vote.js';

// ── Edge cases ────────────────────────────────────────────────────────────────

test('byzantineVote: empty candidates → empty result', () => {
  const r = byzantineVote<string>([]);
  assert.deepEqual(r.winners, []);
  assert.deepEqual(r.dissents, []);
  assert.deepEqual(r.noQuorum, []);
});

test('byzantineVote: single candidate per inputId is its own winner', () => {
  const r = byzantineVote<string>([
    { inputId: 'A', agentId: 'a1', value: 'x' },
  ]);
  assert.equal(r.winners.length, 1);
  assert.equal(r.winners[0]!.value, 'x');
  assert.equal(r.winners[0]!.agentId, 'a1');
  assert.equal(r.winners[0]!.quorum, 1);
  assert.equal(r.winners[0]!.total, 1);
  assert.equal(r.dissents.length, 0);
});

// ── Basic majority ────────────────────────────────────────────────────────────

test('byzantineVote: unanimous 3-of-3 agreement', () => {
  const r = byzantineVote<string>([
    { inputId: 'A', agentId: 'a3', value: 'good' },
    { inputId: 'A', agentId: 'a1', value: 'good' },
    { inputId: 'A', agentId: 'a2', value: 'good' },
  ]);
  assert.equal(r.winners.length, 1);
  assert.equal(r.winners[0]!.value, 'good');
  assert.equal(r.winners[0]!.quorum, 3);
  assert.equal(r.winners[0]!.agentId, 'a1', 'tiebreaker should pick lowest agentId');
  assert.equal(r.dissents.length, 0);
});

test('byzantineVote: 2-of-3 majority defeats 1 dissenter', () => {
  const r = byzantineVote<string>([
    { inputId: 'A', agentId: 'a1', value: 'majority' },
    { inputId: 'A', agentId: 'a2', value: 'majority' },
    { inputId: 'A', agentId: 'a3', value: 'rogue' },
  ]);
  assert.equal(r.winners.length, 1);
  assert.equal(r.winners[0]!.value, 'majority');
  assert.equal(r.winners[0]!.quorum, 2);
  assert.equal(r.dissents.length, 1);
  assert.equal(r.dissents[0]!.value, 'rogue');
  assert.equal(r.dissents[0]!.agentId, 'a3');
  assert.equal(r.dissents[0]!.winnerAgentId, 'a1');
});

// ── Tie-break determinism ─────────────────────────────────────────────────────

test('byzantineVote: even 2-2 split → noQuorum (not a strict majority)', () => {
  // 2-of-4 is plurality, NOT strict majority (need ≥3 of 4). This is
  // outside the f<N/3 BFT bound (f=2, N=4 → 50% >> 33%). Honest answer:
  // noQuorum. The lexicographic tiebreaker only resolves which bucket
  // gets considered FIRST; it doesn't bypass the majority gate.
  const r = byzantineVote<string>([
    { inputId: 'A', agentId: 'a4', value: 'right' },
    { inputId: 'A', agentId: 'a3', value: 'right' },
    { inputId: 'A', agentId: 'a2', value: 'left' },
    { inputId: 'A', agentId: 'a1', value: 'left' },
  ]);
  assert.equal(r.winners.length, 0);
  assert.deepEqual(r.noQuorum, ['A']);
});

test('byzantineVote: 5-of-5 unanimous is reproducible across input permutations', () => {
  // Permutation invariance — the same candidate set in different orders
  // must produce identical winners (the tiebreaker IS the determinism
  // guarantee, even when there's no actual tie).
  const base: BFTCandidate<string>[] = [
    { inputId: 'A', agentId: 'a1', value: 'same' },
    { inputId: 'A', agentId: 'a2', value: 'same' },
    { inputId: 'A', agentId: 'a3', value: 'same' },
    { inputId: 'A', agentId: 'a4', value: 'same' },
    { inputId: 'A', agentId: 'a5', value: 'same' },
  ];
  const r1 = byzantineVote<string>(base);
  const r2 = byzantineVote<string>([base[4]!, base[1]!, base[3]!, base[0]!, base[2]!]);
  assert.deepEqual(r1.winners, r2.winners);
  // Same-bucket tiebreaker picks lowest agentId.
  assert.equal(r1.winners[0]!.agentId, 'a1');
});

// ── BFT bound: f < ⌈N/3⌉ should always resolve to canonical ────────────────

test('byzantineVote: BFT bound — N=7, f=2 garbage, canonical wins', () => {
  // 7 candidates: 5 honest with value "canonical", 2 with random noise.
  // ⌈7/3⌉ = 3, so f=2 < 3 — canonical MUST win.
  const trials = 200;
  let canonicalWins = 0;
  for (let t = 0; t < trials; t++) {
    const candidates: BFTCandidate<string>[] = [];
    for (let i = 0; i < 5; i++) {
      candidates.push({
        inputId: 'A',
        agentId: `honest-${String(i).padStart(2, '0')}`,
        value: 'canonical',
      });
    }
    for (let i = 0; i < 2; i++) {
      candidates.push({
        inputId: 'A',
        agentId: `faulty-${String(i).padStart(2, '0')}`,
        value: `garbage-${Math.random().toString(36).slice(2)}`,
      });
    }
    // Shuffle so insertion order can't leak into the result.
    candidates.sort(() => Math.random() - 0.5);
    const r = byzantineVote<string>(candidates);
    if (r.winners[0]?.value === 'canonical') canonicalWins++;
  }
  assert.equal(canonicalWins, trials, `canonical should win all ${trials} trials at f=2/N=7`);
});

test('byzantineVote: BFT bound — N=10, f=3 garbage, canonical wins (f<N/3=3.33)', () => {
  const trials = 200;
  let canonicalWins = 0;
  for (let t = 0; t < trials; t++) {
    const candidates: BFTCandidate<string>[] = [];
    for (let i = 0; i < 7; i++) {
      candidates.push({
        inputId: 'A',
        agentId: `honest-${String(i).padStart(2, '0')}`,
        value: 'canonical',
      });
    }
    for (let i = 0; i < 3; i++) {
      candidates.push({
        inputId: 'A',
        agentId: `faulty-${String(i).padStart(2, '0')}`,
        value: `garbage-${Math.random().toString(36).slice(2)}`,
      });
    }
    candidates.sort(() => Math.random() - 0.5);
    const r = byzantineVote<string>(candidates);
    if (r.winners[0]?.value === 'canonical') canonicalWins++;
  }
  assert.equal(canonicalWins, trials, `canonical should win all ${trials} trials at f=3/N=10`);
});

// ── Independent voting per inputId ────────────────────────────────────────────

test('byzantineVote: distinct inputIds vote independently', () => {
  const r = byzantineVote<string>([
    { inputId: 'A', agentId: 'a1', value: 'A-value' },
    { inputId: 'A', agentId: 'a2', value: 'A-value' },
    { inputId: 'B', agentId: 'b1', value: 'B-value' },
    { inputId: 'B', agentId: 'b2', value: 'B-value' },
  ]);
  assert.equal(r.winners.length, 2);
  const wByInput = new Map(r.winners.map(w => [w.inputId, w.value]));
  assert.equal(wByInput.get('A'), 'A-value');
  assert.equal(wByInput.get('B'), 'B-value');
});

// ── Custom canonicalize ────────────────────────────────────────────────────────

test('byzantineVote: custom canonicalize collapses semantically-equal values', () => {
  // Two objects with the same content but different key order. Default
  // JSON.stringify treats them as different (key order matters). A
  // canonicalize that sorts keys treats them as equal.
  const canonicalize = (v: Record<string, unknown>) =>
    JSON.stringify(v, Object.keys(v).sort());
  const r = byzantineVote<Record<string, string>>(
    [
      { inputId: 'A', agentId: 'a1', value: { x: '1', y: '2' } },
      { inputId: 'A', agentId: 'a2', value: { y: '2', x: '1' } }, // same content
      { inputId: 'A', agentId: 'a3', value: { x: '1', y: '2', z: '3' } }, // different
    ],
    canonicalize,
  );
  // a1 and a2 agree; that's 2-of-3 → majority over a3.
  assert.equal(r.winners.length, 1);
  assert.equal(r.winners[0]!.quorum, 2);
  assert.equal(r.dissents.length, 1);
  assert.equal(r.dissents[0]!.agentId, 'a3');
});

// ── No quorum case ────────────────────────────────────────────────────────────

test('byzantineVote: 3-way split (no majority) → noQuorum', () => {
  const r = byzantineVote<string>([
    { inputId: 'A', agentId: 'a1', value: 'one' },
    { inputId: 'A', agentId: 'a2', value: 'two' },
    { inputId: 'A', agentId: 'a3', value: 'three' },
  ]);
  // No bucket has 2-of-3 majority (1+1+1).
  assert.equal(r.winners.length, 0);
  assert.deepEqual(r.noQuorum, ['A']);
});
