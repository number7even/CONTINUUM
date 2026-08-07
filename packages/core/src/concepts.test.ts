/**
 * concepts.test.ts — the deterministic concept extractor.
 * Run via: node --test packages/core/dist/concepts.test.js (after `tsc -b`).
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractConcepts, isConceptTerm } from './concepts.js';
import { buildObservationGraph } from './graph.js';
import type { Observation } from './types.js';

const obs = (id: string, content: string): Observation => ({
  id, sourceId: 'docs:' + id, type: 'doc', content, timestamp: '2026-07-05T00:00:00Z', refs: [], metadata: undefined,
});

test('isConceptTerm accepts identifiers, rejects prose/flags', () => {
  for (const t of ['vault-guard.mjs', 'StorageBackend', 'continuum_graph', 'RuVector', 'API'])
    assert.equal(isConceptTerm(t), true, `should accept ${t}`);
  for (const t of ['the', 'a', 'npm run build', '--smoke', '/abs/path', '   '])
    assert.equal(isConceptTerm(t), false, `should reject ${t}`);
});

test('a concept must span >= minDocs to be kept (drops one-offs)', () => {
  const { nodes, edges } = extractConcepts([
    obs('a', 'we use `RuVector` and `StorageBackend` here'),
    obs('b', '`RuVector` again, plus a `oneOffThing`'),
  ], { minDocs: 2 });
  const labels = nodes.map((n) => n.label).sort();
  assert.deepEqual(labels, ['RuVector']);          // StorageBackend (1 doc) + oneOffThing (1 doc) dropped
  const rv = nodes.find((n) => n.label === 'RuVector')!;
  assert.equal(rv.source, 'concept');
  assert.equal(rv.degree, 2);                      // mentioned in 2 docs
  assert.equal(edges.filter((e) => e.source === rv.id).length, 2); // one edge per mentioning doc
});

test('each doc counted once per concept even if repeated', () => {
  const { nodes } = extractConcepts([
    obs('a', '`vault-guard` `vault-guard` `vault-guard`'),
    obs('b', '`vault-guard`'),
  ], { minDocs: 2 });
  assert.equal(nodes[0]!.degree, 2); // 2 docs, not 4 mentions
});

test('buildObservationGraph folds concepts in and bumps doc degree', () => {
  const g = buildObservationGraph([
    obs('a', 'the `SharedThing` lives here'),
    obs('b', 'also `SharedThing` over here'),
  ], { includeConcepts: true, minConceptDocs: 2 });
  const concept = g.nodes.find((n) => n.source === 'concept');
  assert.ok(concept, 'a concept node was added');
  assert.equal(g.stats.bySource.concept, 1);
  // both docs mention it → each doc degree bumped to 1
  assert.equal(g.nodes.find((n) => n.id === 'a')!.degree, 1);
  assert.equal(g.nodes.find((n) => n.id === 'b')!.degree, 1);
});

test('concepts are opt-in — default graph is docs-only', () => {
  const g = buildObservationGraph([obs('a', '`SharedThing`'), obs('b', '`SharedThing`')]);
  assert.equal(g.nodes.every((n) => n.source !== 'concept'), true);
});
