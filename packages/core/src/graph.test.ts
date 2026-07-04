/**
 * graph.test.ts — property tests for the observation provenance graph builder.
 *
 * Run via: node --test packages/core/dist/graph.test.js (after `tsc -b`).
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildObservationGraph, sourceOf } from './graph.js';
import type { Observation } from './types.js';

const obs = (id: string, refs: string[] = [], over: Partial<Observation> = {}): Observation => ({
  id,
  sourceId: over.sourceId ?? 'git:repo',
  type: over.type ?? 'commit',
  content: over.content ?? `content for ${id}`,
  timestamp: over.timestamp ?? '2026-07-04T00:00:00Z',
  refs,
  metadata: undefined,
});

test('nodes + directed edges + bidirectional degree from refs', () => {
  const g = buildObservationGraph([obs('a', ['b']), obs('b', []), obs('c', ['a', 'b'])]);
  assert.equal(g.nodes.length, 3);
  assert.equal(g.edges.length, 3); // a->b, c->a, c->b
  const deg = Object.fromEntries(g.nodes.map((n) => [n.id, n.degree]));
  assert.equal(deg.a, 2); // out a->b + in c->a
  assert.equal(deg.b, 2); // in a->b + in c->b
  assert.equal(deg.c, 2); // out c->a + c->b
});

test('dangling refs and self-loops are dropped, not rendered', () => {
  const g = buildObservationGraph([obs('a', ['missing', 'a'])]);
  assert.equal(g.nodes.length, 1);
  assert.equal(g.edges.length, 0);
  assert.equal(g.nodes[0]!.degree, 0);
});

test('duplicate directed edges are deduped', () => {
  const g = buildObservationGraph([obs('a', ['b', 'b', 'b']), obs('b')]);
  assert.equal(g.edges.length, 1);
});

test('source color + bySource stats + topHubs', () => {
  const g = buildObservationGraph([obs('a', ['b'], { sourceId: 'docs:x' }), obs('b', [], { sourceId: 'git:y' })]);
  assert.equal(g.nodes.find((n) => n.id === 'a')!.source, 'docs');
  assert.equal(g.stats.bySource.docs, 1);
  assert.equal(g.stats.bySource.git, 1);
  assert.equal(g.stats.topHubs[0]!.degree, 1);
});

test('limit caps nodes and edges follow the surviving set', () => {
  const many = Array.from({ length: 10 }, (_, i) => obs('n' + i, i > 0 ? ['n' + (i - 1)] : []));
  const g = buildObservationGraph(many, { limit: 3 });
  assert.equal(g.nodes.length, 3);
  for (const e of g.edges) {
    assert.ok(g.nodes.some((n) => n.id === e.source));
    assert.ok(g.nodes.some((n) => n.id === e.target));
  }
});

test('label is a trimmed 60-char excerpt; sourceOf reads the ID prefix', () => {
  const long = 'x'.repeat(200);
  const g = buildObservationGraph([obs('a', [], { content: long })]);
  assert.equal(g.nodes[0]!.label.length, 60);
  assert.equal(sourceOf('docs:path/to/file'), 'docs' as unknown);
  assert.equal(sourceOf('git:abc123'), 'git' as unknown);
});
