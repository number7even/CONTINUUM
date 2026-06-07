/**
 * packages/adapters/export/src/swarm.test.ts
 *
 * SPRINT-W26-3-export lifecycle test for the export hierarchical-topology
 * swarm.
 *
 * Asserts:
 *   - hierarchicalShards partitions across N-1 children
 *   - ingestViaHierarchicalSwarm spawns root+children, BFT-votes
 *     significance, dissolves
 *   - swarm.terminate() runs in finally on throw
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteStorageBackend, type Observation } from '@continuum/core';
import {
  hierarchicalShards,
  ingestViaHierarchicalSwarm,
  type TurnInput,
} from './swarm.js';

function fakeTurn(
  i: number,
  body: string,
  flags: Partial<TurnInput['features']> = {},
): TurnInput {
  const observation: Omit<Observation, 'id'> = {
    sourceId: 'export:w26-test',
    type: 'session-turn',
    content: body,
    timestamp: new Date(2026, 0, 1 + i, 12).toISOString(),
    refs: [],
    metadata: { adapter: '@continuum/adapter-export' },
  };
  return {
    id: `turn-${String(i).padStart(4, '0')}`,
    fileBasename: 'session-1.jsonl',
    observation,
    features: {
      bodyLength: body.trim().length,
      isToolAcknowledgement: flags.isToolAcknowledgement ?? false,
      isMetaOnly: flags.isMetaOnly ?? body.trim().length < 4,
    },
  };
}

// ── Pure helper tests ─────────────────────────────────────────────────────────

test('hierarchicalShards: empty input returns []', () => {
  assert.deepEqual(hierarchicalShards([], 4), []);
});

test('hierarchicalShards: N=4 (1 root + 3 children) on 9 turns → 3 shards', () => {
  const turns = Array.from({ length: 9 }, (_, i) => fakeTurn(i, `body ${i}`));
  const shards = hierarchicalShards(turns, 4);
  assert.equal(shards.length, 3, 'children = N-1 = 3');
  assert.equal(shards.flat().length, 9);
});

test('hierarchicalShards: preserves order within shards', () => {
  const turns = Array.from({ length: 12 }, (_, i) => fakeTurn(i, `body ${i}`));
  const shards = hierarchicalShards(turns, 4);
  for (const shard of shards) {
    for (let i = 1; i < shard.length; i++) {
      assert.ok(
        shard[i - 1]!.id < shard[i]!.id,
        'within-shard order must be preserved',
      );
    }
  }
});

// ── Live swarm tests ──────────────────────────────────────────────────────────

let dataDir: string;
let originalDataDir: string | undefined;
let storage: SQLiteStorageBackend;

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-w26-export-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
  storage = new SQLiteStorageBackend('w26-export-test');
  storage.upsertSource('export:w26-test', 'export');
});

after(() => {
  try {
    storage?.close();
  } finally {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.CONTINUUM_DATA_DIR;
    else process.env.CONTINUUM_DATA_DIR = originalDataDir;
    delete process.env.CONTINUUM_STORAGE_BACKEND;
  }
  setTimeout(() => process.exit(0), 100).unref();
});

test('ingestViaHierarchicalSwarm: spawns hierarchy, BFT-votes significance, dissolves', async () => {
  // Mix of turn types so the BFT vote produces a mix of include/filter:
  //   - long body (~50 chars): all 3 strategies → include (unanimous)
  //   - 1-char body:           length-floor + meta-filter → filter,
  //                            permissive → include → 2-of-3 majority filter
  //   - "ok." (tool ack):      meta-filter → filter,
  //                            length-floor + permissive → include →
  //                            2-of-3 majority include
  const turns = [
    fakeTurn(0, 'This is a substantial response with real content for ingest.'),
    fakeTurn(1, 'x'),
    fakeTurn(2, 'ok.', { isToolAcknowledgement: true }),
    fakeTurn(3, 'Another real response with body text and substance.'),
  ];

  const result = await ingestViaHierarchicalSwarm(turns, {
    storage,
    sourceId: 'export:w26-test',
    maxAgents: 4,
  });

  assert.ok(result.swarmId);
  assert.equal(result.agentsSpawned, 4, '1 root + 3 children');
  assert.equal(result.turnsScanned, 4);
  // The vote should produce at least one filter (the "x" turn) and at
  // least three includes (long content + ok. + long content).
  assert.ok(result.upserted >= 2, `expected ≥2 upserts, got ${result.upserted}`);
  assert.ok(result.voteFiltered >= 1, `expected ≥1 filter, got ${result.voteFiltered}`);
  const accounted =
    result.unanimousIngest + result.votedIngest + result.noQuorumIngest;
  assert.equal(accounted, 4, 'BFT must account for every turn');
});

test('ingestViaHierarchicalSwarm: empty turn list returns early without spawning', async () => {
  const result = await ingestViaHierarchicalSwarm([], {
    storage,
    sourceId: 'export:w26-test',
    maxAgents: 4,
  });
  assert.equal(result.agentsSpawned, 0);
  assert.equal(result.turnsScanned, 0);
  assert.equal(result.swarmId, '(no-swarm-spawned)');
});

test('ingestViaHierarchicalSwarm: terminate runs in finally even when work throws', async () => {
  const turns = Array.from({ length: 6 }, (_, i) =>
    fakeTurn(i + 100, `substantial body content for turn ${i + 100}`),
  );
  let insertCalls = 0;
  const poisoned = {
    ...storage,
    insertObservationsBulk(observations: Omit<Observation, 'id'>[]) {
      insertCalls++;
      if (insertCalls === 1) throw new Error('synthetic-poison-bulk-insert');
      return storage.insertObservationsBulk(observations);
    },
    upsertSource: storage.upsertSource.bind(storage),
    dataLocation: storage.dataLocation.bind(storage),
  } as typeof storage;

  let threw = false;
  try {
    await ingestViaHierarchicalSwarm(turns, {
      storage: poisoned,
      sourceId: 'export:w26-test',
      maxAgents: 4,
    });
  } catch (e) {
    threw = true;
    assert.match((e as Error).message, /synthetic-poison-bulk-insert/);
  }
  assert.equal(threw, true, 'expected the throw to propagate');
});
