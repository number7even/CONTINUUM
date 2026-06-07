/**
 * tenant-isolation.test.ts — W27-4 mechanical cross-tenant isolation proof.
 *
 * Proof #3 of the five layered W27 isolation proofs (the in-process
 * boundary). Asserts:
 *
 *   1. Two `openStorage(tenantId)` calls with different tenantIds
 *      produce StorageBackend instances bound to DIFFERENT filesystem
 *      paths (Path A structural isolation, observable from the API).
 *
 *   2. Tenant-A's writes are INVISIBLE to Tenant-B reads:
 *      - getObservations([sentinel-A-id]) on tenant-B returns empty
 *      - searchObservations('SENTINEL_A_TOKEN') on tenant-B returns 0 hits
 *      - getStateAt() on tenant-B returns the LAST snapshot tenant-B
 *        recorded (or null) — never tenant-A's
 *      - listSnapshots() on tenant-B includes 0 of tenant-A's snapshots
 *      - listTodos() on tenant-B includes 0 of tenant-A's todos
 *
 *   3. The relation is symmetric — tenant-B's writes are also invisible
 *      to tenant-A reads.
 *
 *   4. Case-folded tenant IDs ('Alpha' vs 'alpha') map to the SAME
 *      isolated workspace — sanitisation guarantees a single canonical
 *      identity per intended workspace, eliminating a class of
 *      header-tampering attacks that try to evade isolation by tweaking
 *      case.
 *
 * NO honor system: every assertion is a direct API call or filesystem
 * path inspection. If isolation breaks at the storage layer, this test
 * fails immediately.
 *
 * Run after build:
 *   node --test packages/core/dist/tenant-isolation.test.js
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from './factory.js';
import type { StorageBackend } from './storage.js';

// ── Hermetic tmpdir setup ─────────────────────────────────────────────────────

let dataDir: string;
let originalDataDir: string | undefined;
let originalBackend: string | undefined;

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  originalBackend = process.env.CONTINUUM_STORAGE_BACKEND;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-w27-iso-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  // SQLite-only path — fast, no embedder warm-up cost, and the
  // assertions are about RELATIONAL isolation (the SQLite layer).
  // The hybrid backend's vector layer inherits the same per-tenant
  // ruvector.db path so isolation also holds there; testing the
  // RELATIONAL layer is sufficient for the W27 invariant.
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
});

after(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.CONTINUUM_DATA_DIR;
  else process.env.CONTINUUM_DATA_DIR = originalDataDir;
  if (originalBackend === undefined) delete process.env.CONTINUUM_STORAGE_BACKEND;
  else process.env.CONTINUUM_STORAGE_BACKEND = originalBackend;
});

// ── Test fixture helpers ──────────────────────────────────────────────────────

/** Insert a sentinel observation into a tenant and return its ID. */
function seedSentinel(
  storage: StorageBackend,
  tenantId: string,
  token: string,
): string {
  const sourceId = `mem:${tenantId}`;
  storage.upsertSource(sourceId, 'mem');
  const obs = storage.insertObservation({
    sourceId,
    type: 'note',
    content: `Sentinel ${token} for tenant ${tenantId} — should be invisible to others.`,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: { tenant: tenantId, sentinelToken: token },
  });
  assert.ok(obs, `seedSentinel: insert returned null for ${tenantId}`);
  return obs!.id;
}

// ── Proof 1 · structural isolation observable from the API ────────────────────

test('W27-4 Proof: openStorage(tenantA) and openStorage(tenantB) have DIFFERENT paths', () => {
  const tA = openStorage('alpha');
  const tB = openStorage('bravo');
  try {
    const pa = tA.dataLocation();
    const pb = tB.dataLocation();
    assert.notEqual(pa, pb, 'data locations must differ');
    assert.match(pa, /\/alpha\//);
    assert.match(pb, /\/bravo\//);
    // Both must be under the test tmpdir — never escape via path traversal
    assert.ok(pa.startsWith(dataDir), `alpha path escaped tmpdir: ${pa}`);
    assert.ok(pb.startsWith(dataDir), `bravo path escaped tmpdir: ${pb}`);
  } finally {
    tA.close();
    tB.close();
  }
});

// ── Proof 2 · tenant-A writes are INVISIBLE to tenant-B reads ────────────────

test('W27-4 Proof: tenant-A sentinel observation is invisible to tenant-B (search + getObservations)', () => {
  const tA = openStorage('alpha');
  const tB = openStorage('bravo');
  try {
    const aSentinelId = seedSentinel(tA, 'alpha', 'SENTINEL_A_XYZ123');

    // Direct ID lookup — tenant-B must have NO record of tenant-A's ID.
    const fetched = tB.getObservations([aSentinelId]);
    assert.deepEqual(fetched, [], 'tenant-B getObservations should not find tenant-A\'s ID');

    // FTS5 search by sentinel token — tenant-B must return zero hits.
    const hits = tB.searchObservations('SENTINEL_A_XYZ123');
    assert.equal(hits.length, 0, 'tenant-B search should not find tenant-A\'s sentinel');
  } finally {
    tA.close();
    tB.close();
  }
});

test('W27-4 Proof: tenant-A snapshots are invisible to tenant-B (listSnapshots + getStateAt)', () => {
  const tA = openStorage('alpha');
  const tB = openStorage('bravo');
  try {
    // Tenant-A records a checkpoint.
    const aSnapshot = tA.recordCheckpoint({
      reason: 'tenant-A test checkpoint',
      active: [
        {
          name: 'tenant-a-entry',
          where: 'in tenant-A workspace',
          verifyCommand: 'true',
          verifiedAt: new Date().toISOString(),
          landedAt: 'test',
          description: 'should not leak to tenant-B',
        },
      ],
    });

    // Tenant-B reads its own snapshot history — must have ZERO of tenant-A's.
    const bSnapshots = tB.listSnapshots(10);
    assert.equal(
      bSnapshots.findIndex(s => s.id === aSnapshot.id),
      -1,
      'tenant-B listSnapshots should not include tenant-A\'s snapshot ID',
    );
    assert.equal(
      bSnapshots.filter(s => s.reason.includes('tenant-A')).length,
      0,
      'tenant-B listSnapshots should not contain any tenant-A reasons',
    );

    // getStateAt — tenant-B's latest state must not be tenant-A's snapshot.
    const bLatest = tB.getStateAt();
    if (bLatest !== null) {
      assert.notEqual(bLatest.id, aSnapshot.id);
      assert.equal(bLatest.reason.includes('tenant-A'), false);
    }
  } finally {
    tA.close();
    tB.close();
  }
});

test('W27-4 Proof: tenant-A todos are invisible to tenant-B (listTodos + getTodo)', () => {
  const tA = openStorage('alpha');
  const tB = openStorage('bravo');
  try {
    const aTodo = tA.createTodo({
      title: 'tenant-A internal task — must not leak',
      refs: [],
    });
    const bTodos = tB.listTodos({});
    assert.equal(
      bTodos.findIndex(t => t.id === aTodo.id),
      -1,
      'tenant-B listTodos should not include tenant-A\'s todo ID',
    );
    assert.equal(
      bTodos.filter(t => t.title.includes('tenant-A')).length,
      0,
      'tenant-B listTodos should not contain tenant-A titles',
    );
    // Direct getTodo by ID — tenant-B must return null for tenant-A's ID.
    assert.equal(tB.getTodo(aTodo.id), null);
  } finally {
    tA.close();
    tB.close();
  }
});

// ── Proof 3 · symmetric — tenant-B → tenant-A also blind ─────────────────────

test('W27-4 Proof: isolation is symmetric (tenant-B writes are invisible to tenant-A)', () => {
  const tA = openStorage('alpha');
  const tB = openStorage('bravo');
  try {
    const bSentinelId = seedSentinel(tB, 'bravo', 'SENTINEL_B_XYZ789');
    assert.deepEqual(tA.getObservations([bSentinelId]), []);
    assert.equal(tA.searchObservations('SENTINEL_B_XYZ789').length, 0);
  } finally {
    tA.close();
    tB.close();
  }
});

// ── Proof 4 · case-fold canonicalisation eliminates header-tampering ─────────

test('W27-4 Proof: case-fold canonical identity — "Alpha" and "alpha" map to the SAME workspace', () => {
  // sanitiseTenantId lowercases before allowlisting; a header value of
  // 'Alpha' must therefore route to the same workspace as 'alpha'. This
  // closes a bypass where an attacker would try `X-Continuum-Project:
  // ALPHA` against a token claim of 'alpha'.
  const tLower = openStorage('alpha');
  const tUpper = openStorage('Alpha');
  try {
    const sentinelId = seedSentinel(tLower, 'alpha', 'CASE_FOLD_TEST_TOKEN');
    // The uppercase-input handle MUST see the same data — same path,
    // same sqlite file, same row.
    assert.equal(tUpper.dataLocation(), tLower.dataLocation());
    const fetched = tUpper.getObservations([sentinelId]);
    assert.equal(fetched.length, 1, 'case-folded tenantId must reach the same workspace');
    assert.equal(fetched[0]!.id, sentinelId);
  } finally {
    tLower.close();
    tUpper.close();
  }
});

// ── Proof 5 · per-tenant directories exist on disk and are distinct ──────────

test('W27-4 Proof: each tenant gets a separate directory on disk', () => {
  const tA = openStorage('alpha');
  const tB = openStorage('bravo');
  try {
    // Trigger directory creation by writing something.
    tA.upsertSource('mem:alpha', 'mem');
    tB.upsertSource('mem:bravo', 'mem');

    const alphaDir = join(dataDir, 'alpha');
    const bravoDir = join(dataDir, 'bravo');
    assert.ok(existsSync(alphaDir), `expected ${alphaDir} to exist`);
    assert.ok(existsSync(bravoDir), `expected ${bravoDir} to exist`);
    assert.ok(
      existsSync(join(alphaDir, 'continuum.db')),
      'alpha tenant should have its own continuum.db',
    );
    assert.ok(
      existsSync(join(bravoDir, 'continuum.db')),
      'bravo tenant should have its own continuum.db',
    );
  } finally {
    tA.close();
    tB.close();
  }
});
