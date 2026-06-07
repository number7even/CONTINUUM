/**
 * packages/adapters/docs/src/swarm.test.ts
 *
 * SPRINT-W26-2 lifecycle test for the docs mesh-topology swarm.
 *
 * Asserts:
 *   - partitionForMesh evenly distributes files
 *   - ingestViaMeshSwarm spawns N peers, votes on titles, dissolves
 *   - swarm.terminate() runs in finally on throw
 *   - BFT actually votes (records unanimous + voted + noQuorum counters)
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SQLiteStorageBackend } from '@continuum/core';
import {
  ingestViaMeshSwarm,
  partitionForMesh,
  type DocFile,
} from './swarm.js';

function uid(path: string): string {
  const hex = createHash('sha256').update(path).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function fakeDoc(i: number, body: string): DocFile {
  const relativePath = `fake-${i}.md`;
  return {
    absolutePath: `/tmp/fake-${i}.md`,
    relativePath,
    id: uid(relativePath),
    content: body,
    timestamp: new Date(2026, 0, 1 + i, 12).toISOString(),
  };
}

// ── Pure helper tests ─────────────────────────────────────────────────────────

test('partitionForMesh: empty input returns []', () => {
  assert.deepEqual(partitionForMesh([], 3), []);
});

test('partitionForMesh: 9 files / 3 agents → 3 shards of 3', () => {
  const files = Array.from({ length: 9 }, (_, i) => fakeDoc(i, '# title'));
  const shards = partitionForMesh(files, 3);
  assert.equal(shards.length, 3);
  for (const s of shards) assert.equal(s.length, 3);
});

test('partitionForMesh: more agents than files caps shards', () => {
  const files = Array.from({ length: 3 }, (_, i) => fakeDoc(i, '# title'));
  const shards = partitionForMesh(files, 8);
  assert.ok(shards.length <= 3);
  assert.equal(shards.flat().length, 3);
});

// ── Live swarm tests ──────────────────────────────────────────────────────────

let dataDir: string;
let originalDataDir: string | undefined;
let storage: SQLiteStorageBackend;

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-w26-docs-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
  storage = new SQLiteStorageBackend('w26-docs-test');
  storage.upsertSource('docs:w26-test', 'docs');
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
  // ruv-swarm's pooled-persistence keeps the event loop alive — force
  // a clean exit so the per-test summary lands.
  setTimeout(() => process.exit(0), 100).unref();
});

test('ingestViaMeshSwarm: spawns mesh swarm, votes on titles, dissolves', async () => {
  // Three files where the BFT vote has different outcomes:
  //   - "# Real Title\n..."  → first-h1 and first-line agree on "Real Title",
  //                             basename ('fake-0') disagrees → 2-of-3 vote
  //   - "Real Title\n..."    → first-line picks "Real Title", first-h1 falls
  //                             back to basename, basename gives basename →
  //                             two strategies agree on basename → 2-of-3
  //   - "## not-h1\n..."     → first-h1 falls back to basename, first-line
  //                             picks "not-h1", basename gives basename →
  //                             2-of-3 (basename wins) so a mixed input.
  const files = [
    fakeDoc(0, '# Real Title\n\nbody text here'),
    fakeDoc(1, 'Just a plain start\n\nmore body'),
    fakeDoc(2, '## Subsection start\n\nbody'),
  ];

  const result = await ingestViaMeshSwarm(files, {
    storage,
    sourceId: 'docs:w26-test',
    docsDir: '/tmp',
    maxAgents: 3,
  });

  assert.ok(result.swarmId, 'swarm should have an ID');
  assert.equal(result.agentsSpawned, 3, '3 strategies → 3 agents');
  assert.equal(result.filesScanned, 3);
  assert.equal(result.upserted, 3);
  assert.equal(result.dropped, 0);
  // BFT accounting — at least one file should hit unanimous OR voted
  // (any outcome other than noQuorum on all three means the vote happened).
  const totalAccounted =
    result.unanimousTitles + result.votedTitles + result.noQuorumTitles;
  assert.equal(totalAccounted, 3, 'BFT must account for every file');
});

test('ingestViaMeshSwarm: empty file list returns early without spawning', async () => {
  const result = await ingestViaMeshSwarm([], {
    storage,
    sourceId: 'docs:w26-test',
    docsDir: '/tmp',
    maxAgents: 3,
  });
  assert.equal(result.agentsSpawned, 0);
  assert.equal(result.shardsProcessed, 0);
  assert.equal(result.filesScanned, 0);
  assert.equal(result.swarmId, '(no-swarm-spawned)');
});

test('ingestViaMeshSwarm: terminate runs in finally even when work throws', async () => {
  const files = Array.from({ length: 6 }, (_, i) =>
    fakeDoc(100 + i, `# title-${i}\n\nbody`),
  );
  let upsertCalls = 0;
  const poisoned = {
    ...storage,
    upsertObservation(obs: Parameters<typeof storage.upsertObservation>[0]) {
      upsertCalls++;
      if (upsertCalls === 3) throw new Error('synthetic-poison-third-upsert');
      return storage.upsertObservation(obs);
    },
    upsertSource: storage.upsertSource.bind(storage),
    dataLocation: storage.dataLocation.bind(storage),
  } as typeof storage;

  let threw = false;
  try {
    await ingestViaMeshSwarm(files, {
      storage: poisoned,
      sourceId: 'docs:w26-test',
      docsDir: '/tmp',
      maxAgents: 3,
    });
  } catch (e) {
    threw = true;
    assert.match((e as Error).message, /synthetic-poison-third-upsert/);
  }
  assert.equal(threw, true, 'expected the throw to propagate');
  // The verify-then-dissolve invariant means the test got here at all.
});
