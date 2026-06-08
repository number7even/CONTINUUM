/**
 * tenant-registry.ts — W27-5 LRU cache + idle eviction for per-tenant
 * StorageBackend instances.
 *
 * The Path A multi-tenant architecture instantiates a separate
 * SQLite + ruvector pair per tenant. Without a cache, every /sse
 * connection would call openStorage(tenantId) afresh, re-opening DB
 * handles + thrashing the page cache. With an unbounded cache, every
 * tenant ever seen would stay resident — eventual OOM on the 512MB
 * Fly shared-cpu-1x ceiling under multi-tenant traffic.
 *
 * Empirical measurement (scripts/burst-test-w27-5.mjs, 2026-06-08):
 *   first tenant       : 202 MB peak (loads embedder + WASM + worker pool)
 *   steady-state slope : effectively zero — RSS settled at 97 MB across
 *                        10 concurrent open backends because the embedder
 *                        + ruvector binding + worker pool are MODULE-LEVEL
 *                        singletons shared across tenants. Per-tenant
 *                        marginal cost = sqlite handle + tiny per-instance
 *                        state ≈ 1-10 MB under load.
 *   CONTINUUM_MAX_OPEN_TENANTS=32 default fits 32 × ~10 MB = ~320 MB
 *   alongside the 97 MB embedder baseline → ~417 MB total, well under
 *   512 MB with headroom for transient ingest bursts.
 *
 * Reference-counting model (NOT timer-driven for live sessions):
 *   acquire(tenantId)  → cache hit returns existing backend, refCount++
 *                        cache miss opens new backend, refCount=1, adds
 *                        to LRU. If cache full, force-evicts LRU IDLE
 *                        entry first (refCount=0).
 *   release(tenantId)  → refCount-- ; when 0, records idle timestamp.
 *                        Idle entries are eligible for background or
 *                        force eviction.
 *   Background sweep   → every 60s, evicts idle entries past
 *                        CONTINUUM_TENANT_IDLE_TIMEOUT_MS.
 *
 * IDLE eviction = closing the StorageBackend (sqlite handle + ruvector
 * binding) and removing it from the cache. Active entries (refCount>0)
 * are NEVER touched, even past idle timeout — there's no "kill the
 * live session" mode. Active sessions hold the backend alive until
 * the last release().
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { openStorage, type StorageBackend } from '@continuum/core';

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_OPEN = 32;
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute

function readPositiveInt(env: string | undefined, fallback: number): number {
  if (env === undefined) return fallback;
  const n = Number.parseInt(env, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

export interface TenantRegistryConfig {
  /** Hard cap on simultaneously open backends. Defaults to
   *  CONTINUUM_MAX_OPEN_TENANTS env or 32. Increase only after re-running
   *  scripts/burst-test-w27-5.mjs on the target hardware. */
  maxOpen: number;
  /** Idle backends older than this are evicted in the background sweep.
   *  Defaults to CONTINUUM_TENANT_IDLE_TIMEOUT_MS env or 300_000 (5min). */
  idleTimeoutMs: number;
  /** Background sweep interval. Defaults to 60_000 (1min). */
  sweepIntervalMs: number;
}

export function defaultTenantRegistryConfig(): TenantRegistryConfig {
  return {
    maxOpen: readPositiveInt(process.env.CONTINUUM_MAX_OPEN_TENANTS, DEFAULT_MAX_OPEN),
    idleTimeoutMs: readPositiveInt(
      process.env.CONTINUUM_TENANT_IDLE_TIMEOUT_MS,
      DEFAULT_IDLE_TIMEOUT_MS,
    ),
    sweepIntervalMs: readPositiveInt(
      process.env.CONTINUUM_TENANT_SWEEP_INTERVAL_MS,
      DEFAULT_SWEEP_INTERVAL_MS,
    ),
  };
}

// ── Internal entry shape ──────────────────────────────────────────────────────

interface Entry {
  tenantId: string;
  storage: StorageBackend;
  refCount: number;
  /** ms-since-epoch when refCount last dropped to 0; -1 while active. */
  idleSinceMs: number;
  openedAtMs: number;
}

// ── Public stats shape (surfaced via /healthz) ────────────────────────────────

export interface TenantRegistryStats {
  open: number;
  active: number;
  idle: number;
  cacheHits: number;
  cacheMisses: number;
  evictedIdle: number;
  evictedLru: number;
  maxOpen: number;
  idleTimeoutMs: number;
}

// ── The registry itself ───────────────────────────────────────────────────────

export class TenantRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly config: TenantRegistryConfig;
  private cacheHits = 0;
  private cacheMisses = 0;
  private evictedIdle = 0;
  private evictedLru = 0;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(config: TenantRegistryConfig = defaultTenantRegistryConfig()) {
    this.config = config;
  }

  /** Start the background sweep. Idempotent. Call once at engine
   *  startup; call stop() at shutdown. The timer is `unref`'d so it
   *  doesn't keep the process alive on its own. */
  start(): void {
    if (this.sweepTimer !== null || this.closed) return;
    this.sweepTimer = setInterval(
      () => this.sweepIdle(),
      this.config.sweepIntervalMs,
    );
    if (typeof this.sweepTimer.unref === 'function') {
      this.sweepTimer.unref();
    }
  }

  /** Stop the background sweep and close every cached backend.
   *  Call on graceful shutdown. */
  stop(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const [_id, entry] of this.entries) {
      try {
        entry.storage.close();
      } catch {
        /* swallow — best-effort shutdown */
      }
    }
    this.entries.clear();
    this.closed = true;
  }

  /**
   * Get a StorageBackend for `tenantId`. Returns a cached instance if
   * one is open; otherwise opens a new one and adds it to the cache.
   * Increments the entry's refCount. CALLER MUST call release(tenantId)
   * exactly once for every successful acquire().
   *
   * @throws Error('continuum: invalid tenant identifier') if openStorage
   *         rejects the input (sanitisation gate in @continuum/core).
   */
  acquire(tenantId: string): StorageBackend {
    if (this.closed) {
      throw new Error('tenant-registry: closed — no new acquires accepted');
    }
    const existing = this.entries.get(tenantId);
    if (existing) {
      existing.refCount += 1;
      existing.idleSinceMs = -1;
      this.cacheHits += 1;
      return existing.storage;
    }
    // Miss path — may need to evict before opening.
    this.cacheMisses += 1;
    if (this.entries.size >= this.config.maxOpen) {
      this.evictOldestIdleOrFail();
    }
    const storage = openStorage(tenantId);
    const entry: Entry = {
      tenantId,
      storage,
      refCount: 1,
      idleSinceMs: -1,
      openedAtMs: Date.now(),
    };
    this.entries.set(tenantId, entry);
    return storage;
  }

  /**
   * Mark this acquirer's lease over `tenantId` as released. When
   * refCount drops to zero, the entry becomes eligible for idle
   * eviction. Silently no-op if the tenant is not in the cache (already
   * evicted) — defensive: a session may outlive a force-eviction.
   */
  release(tenantId: string): void {
    const entry = this.entries.get(tenantId);
    if (!entry) return;
    if (entry.refCount > 0) {
      entry.refCount -= 1;
    }
    if (entry.refCount === 0) {
      entry.idleSinceMs = Date.now();
    }
  }

  /** Run an idle sweep on demand. Normally driven by the background
   *  timer; exposed for tests + on-demand stats. */
  sweepIdle(): number {
    if (this.closed) return 0;
    const cutoff = Date.now() - this.config.idleTimeoutMs;
    let evicted = 0;
    for (const [tenantId, entry] of [...this.entries]) {
      if (entry.refCount === 0 && entry.idleSinceMs > 0 && entry.idleSinceMs <= cutoff) {
        try {
          entry.storage.close();
        } catch {
          /* swallow */
        }
        this.entries.delete(tenantId);
        this.evictedIdle += 1;
        evicted += 1;
      }
    }
    return evicted;
  }

  /** Find the oldest-idle entry and force-evict it. If NO idle entries
   *  exist (cache is full of active sessions), throw — caller can map
   *  to HTTP 503 "tenant capacity exhausted, retry later". */
  private evictOldestIdleOrFail(): void {
    let victim: Entry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.refCount !== 0) continue;
      if (entry.idleSinceMs <= 0) continue;
      if (victim === null || entry.idleSinceMs < victim.idleSinceMs) {
        victim = entry;
      }
    }
    if (victim === null) {
      throw new Error(
        `tenant-registry: capacity exhausted — ${this.entries.size}/${this.config.maxOpen} ` +
          `active tenants. Increase CONTINUUM_MAX_OPEN_TENANTS or wait for sessions to drain.`,
      );
    }
    try {
      victim.storage.close();
    } catch {
      /* swallow */
    }
    this.entries.delete(victim.tenantId);
    this.evictedLru += 1;
  }

  /** Snapshot of operational stats — safe to call at any time. */
  stats(): TenantRegistryStats {
    let active = 0;
    let idle = 0;
    for (const entry of this.entries.values()) {
      if (entry.refCount > 0) active += 1;
      else idle += 1;
    }
    return {
      open: this.entries.size,
      active,
      idle,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      evictedIdle: this.evictedIdle,
      evictedLru: this.evictedLru,
      maxOpen: this.config.maxOpen,
      idleTimeoutMs: this.config.idleTimeoutMs,
    };
  }
}
