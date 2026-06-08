/**
 * tenant-registry.test.ts — W27-5 acquire/release/LRU/eviction invariants.
 *
 * Asserts the TenantRegistry honors:
 *   - cache hit on repeat acquire (same backend instance returned)
 *   - reference counting (release reaches zero before eviction)
 *   - LRU eviction when cache full + miss arrives
 *   - capacity-exhausted throw when all entries active
 *   - idle-sweep removes entries past the idle timeout
 *   - stop() closes every cached backend
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TenantRegistry, type TenantRegistryConfig } from './tenant-registry.js';

let dataDir: string;
let originalDataDir: string | undefined;
let originalBackend: string | undefined;

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  originalBackend = process.env.CONTINUUM_STORAGE_BACKEND;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-w27-5-reg-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  // sqlite path — fast, no embedder warm-up cost for these unit tests.
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
});

after(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.CONTINUUM_DATA_DIR;
  else process.env.CONTINUUM_DATA_DIR = originalDataDir;
  if (originalBackend === undefined) delete process.env.CONTINUUM_STORAGE_BACKEND;
  else process.env.CONTINUUM_STORAGE_BACKEND = originalBackend;
});

function tinyConfig(overrides: Partial<TenantRegistryConfig> = {}): TenantRegistryConfig {
  return {
    maxOpen: 3,
    idleTimeoutMs: 100_000, // long timeout — tests trigger sweep manually
    sweepIntervalMs: 100_000,
    ...overrides,
  };
}

// ── Cache hit / miss ─────────────────────────────────────────────────────────

test('W27-5: acquire returns the SAME backend on repeat hits', () => {
  const reg = new TenantRegistry(tinyConfig());
  try {
    const a1 = reg.acquire('alpha');
    const a2 = reg.acquire('alpha');
    assert.equal(a1, a2, 'repeat acquire must return the same backend instance');
    const stats = reg.stats();
    assert.equal(stats.open, 1);
    assert.equal(stats.active, 1);
    assert.equal(stats.cacheHits, 1);
    assert.equal(stats.cacheMisses, 1);
    reg.release('alpha');
    reg.release('alpha');
  } finally {
    reg.stop();
  }
});

test('W27-5: distinct tenants get DIFFERENT backends + cache misses', () => {
  const reg = new TenantRegistry(tinyConfig());
  try {
    const a = reg.acquire('alpha');
    const b = reg.acquire('bravo');
    assert.notEqual(a, b);
    const stats = reg.stats();
    assert.equal(stats.open, 2);
    assert.equal(stats.cacheMisses, 2);
    assert.equal(stats.cacheHits, 0);
    reg.release('alpha');
    reg.release('bravo');
  } finally {
    reg.stop();
  }
});

// ── Reference counting ──────────────────────────────────────────────────────

test('W27-5: refCount must reach 0 before entry becomes idle', () => {
  const reg = new TenantRegistry(tinyConfig());
  try {
    reg.acquire('alpha');
    reg.acquire('alpha');
    reg.acquire('alpha');
    let stats = reg.stats();
    assert.equal(stats.active, 1, 'one open tenant');
    assert.equal(stats.idle, 0, 'NO idle entries while refCount > 0');

    reg.release('alpha');
    reg.release('alpha');
    stats = reg.stats();
    assert.equal(stats.active, 1, 'still active until LAST release');

    reg.release('alpha');
    stats = reg.stats();
    assert.equal(stats.active, 0);
    assert.equal(stats.idle, 1, 'idle only after final release');
  } finally {
    reg.stop();
  }
});

test('W27-5: release on unknown tenantId is a silent no-op (defensive)', () => {
  const reg = new TenantRegistry(tinyConfig());
  try {
    // Must not throw.
    reg.release('never-acquired');
    const stats = reg.stats();
    assert.equal(stats.open, 0);
  } finally {
    reg.stop();
  }
});

// ── LRU eviction under capacity pressure ────────────────────────────────────

test('W27-5: LRU eviction frees the oldest IDLE entry when cache full', () => {
  const reg = new TenantRegistry(tinyConfig({ maxOpen: 3 }));
  try {
    reg.acquire('alpha');
    reg.release('alpha');
    reg.acquire('bravo');
    reg.release('bravo');
    reg.acquire('charlie');
    reg.release('charlie');
    assert.equal(reg.stats().open, 3, 'cache at capacity');
    // delta acquire — bravo was released SECOND, alpha was first (oldest idle)
    // wait a tick so the timestamps differ across acquire/release
    // (the test relies on the ordering being deterministic since we
    // released in order alpha → bravo → charlie).
    reg.acquire('delta');
    const stats = reg.stats();
    assert.equal(stats.open, 3, 'still at maxOpen after eviction + insert');
    assert.equal(stats.evictedLru, 1, 'one LRU eviction recorded');
    reg.release('delta');
  } finally {
    reg.stop();
  }
});

test('W27-5: capacity exhausted (no idle to evict) throws — caller maps to 503', () => {
  const reg = new TenantRegistry(tinyConfig({ maxOpen: 2 }));
  try {
    reg.acquire('alpha');
    reg.acquire('bravo');
    // Both active (refCount=1). Cache full. Next acquire MUST throw.
    assert.throws(
      () => reg.acquire('charlie'),
      /capacity exhausted/,
      'cache full of ACTIVE entries must throw',
    );
    reg.release('alpha');
    reg.release('bravo');
  } finally {
    reg.stop();
  }
});

// ── Idle sweep ───────────────────────────────────────────────────────────────

test('W27-5: sweepIdle evicts entries past idleTimeoutMs', async () => {
  const reg = new TenantRegistry(tinyConfig({ idleTimeoutMs: 10 }));
  try {
    reg.acquire('alpha');
    reg.acquire('bravo');
    reg.release('alpha');
    reg.release('bravo');
    assert.equal(reg.stats().idle, 2);
    // Wait past the 10ms idle timeout.
    await new Promise(resolve => setTimeout(resolve, 25));
    const evicted = reg.sweepIdle();
    assert.equal(evicted, 2, 'both idle entries should evict');
    const stats = reg.stats();
    assert.equal(stats.open, 0);
    assert.equal(stats.evictedIdle, 2);
  } finally {
    reg.stop();
  }
});

test('W27-5: sweepIdle SKIPS active entries even past timeout', async () => {
  const reg = new TenantRegistry(tinyConfig({ idleTimeoutMs: 10 }));
  try {
    reg.acquire('alpha'); // active
    reg.acquire('bravo');
    reg.release('bravo'); // idle
    await new Promise(resolve => setTimeout(resolve, 25));
    reg.sweepIdle();
    const stats = reg.stats();
    assert.equal(stats.open, 1, 'active alpha must survive sweep');
    assert.equal(stats.active, 1);
    assert.equal(stats.idle, 0, 'bravo evicted');
    reg.release('alpha');
  } finally {
    reg.stop();
  }
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

test('W27-5: stop() closes every cached backend + rejects further acquires', () => {
  const reg = new TenantRegistry(tinyConfig());
  reg.acquire('alpha');
  reg.acquire('bravo');
  reg.release('alpha');
  reg.stop();
  assert.equal(reg.stats().open, 0);
  // Further acquires throw — registry is closed.
  assert.throws(() => reg.acquire('charlie'), /closed/);
});

// ── Stats shape (telemetry surface for /healthz) ─────────────────────────────

test('W27-5: stats() exposes the operational surface /healthz consumes', () => {
  const reg = new TenantRegistry(tinyConfig());
  try {
    const s = reg.stats();
    assert.equal(typeof s.open, 'number');
    assert.equal(typeof s.active, 'number');
    assert.equal(typeof s.idle, 'number');
    assert.equal(typeof s.cacheHits, 'number');
    assert.equal(typeof s.cacheMisses, 'number');
    assert.equal(typeof s.evictedIdle, 'number');
    assert.equal(typeof s.evictedLru, 'number');
    assert.equal(typeof s.maxOpen, 'number');
    assert.equal(typeof s.idleTimeoutMs, 'number');
    assert.equal(s.maxOpen, 3, 'config surfaces correctly');
  } finally {
    reg.stop();
  }
});

// ── Integration: registry+buildServer borrowed-storage path ─────────────────

test('W27-5: buildServer with borrowed storage does NOT close on handle.close()', async () => {
  const { buildServer } = await import('./server.js');
  const reg = new TenantRegistry(tinyConfig());
  try {
    const storage = reg.acquire('alpha');
    const h = buildServer('alpha', { storage });
    assert.equal(h.tenantId, 'alpha');
    assert.equal(h.storage, storage, 'handle exposes the SAME storage instance');
    h.close(); // should NOT close the storage
    // Verify storage is still usable — close() would have thrown
    // "database is closed" on the next call. (sqlite-better-sqlite3
    // throws "The database connection is not open" on a closed handle.)
    storage.upsertSource('mem:alpha', 'mem');
    reg.release('alpha');
  } finally {
    reg.stop();
  }
});
