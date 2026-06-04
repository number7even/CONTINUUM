/**
 * HybridStorageBackend — V0.5 transitional backend (Path A from Issue #20).
 *
 * Composes SQLiteStorageBackend (relational: snapshots, todos, sources,
 * observation rows + FTS5 keyword search) with a RuVector vector index
 * (HNSW vector search over observation content via @xenova/transformers
 * MiniLM-L6-v2 embeddings).
 *
 * Observation writes are dual-written:
 *   1. SQLite — full row, synchronous, returns immediately.
 *   2. RuVector — embedded + indexed in the background. Fire-and-forget;
 *      embedding/index errors log to stderr but don't fail the SQLite
 *      insert (observations must always land in the relational store).
 *
 * StorageBackend's existing sync interface stays unchanged so consumers
 * (mcp-server, cli, adapter-docs, adapter-git, etc.) need NO modification.
 * Vector search is exposed as NEW async methods on this class — not on
 * the StorageBackend interface — so V0.5 doesn't reshape the contract:
 *
 *   vectorSearch(query, k)    semantic search over embedded observations
 *   flushVectorWrites()       wait for in-flight embeddings to settle
 *   vectorCount()             diagnostic
 *
 * Activation: set CONTINUUM_STORAGE_BACKEND=hybrid (default: sqlite).
 * On hybrid, the openStorage() factory returns this class.
 *
 * V0.5 acceptance criteria:
 *   (a) V0-polish-complete checkpoint's verify_commands still pass
 *       against this backend (sync StorageBackend parity).
 *   (b) vectorSearch recovers a semantically-related observation that
 *       FTS5 keyword search would not (proves the embedding pipeline
 *       is online and the vector index is consulted).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { join } from 'node:path';

import { SQLiteStorageBackend } from './storage-sqlite.js';
import { embed, embedBatchParallel, embeddingDimensions } from './embedder.js';
import { continuumDataRoot } from './db.js';
import type {
  Observation,
  SearchHit,
  SourceType,
  StateSnapshot,
  TimelineHit,
  Todo,
} from './types.js';
import type {
  CheckpointInput,
  CreateTodoInput,
  InsertObservationsResult,
  ListTodosOptions,
  StorageBackend,
  TimelineOptions,
  UpdateTodoInput,
} from './storage.js';

// Narrow shape we actually need from the ruvector VectorDB class.
// Keeping this local avoids importing ruvector's full type tree into core
// at module-graph load time — the real import is deferred until first use.
interface VectorDb {
  insert(entry: {
    id?: string;
    vector: Float32Array | number[];
    metadata?: Record<string, unknown>;
  }): Promise<string>;
  search(query: {
    vector: Float32Array | number[];
    k: number;
    filter?: Record<string, unknown>;
  }): Promise<
    Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>
  >;
  delete(id: string): Promise<boolean>;
  len(): Promise<number>;
}

interface VectorDbCtor {
  new (opts: {
    dimensions: number;
    storagePath?: string;
    metric?: string;
    distanceMetric?: string;
  }): VectorDb;
}

// W23-1 Path A — embed in batches to amortise the forward-pass overhead.
// W25-1 T1 sweep — incrementally raise from W23-1's conservative 32.
const EMBED_BATCH_SIZE = 128;
// Quiet-period flush — if the buffer hasn't filled within this window,
// emit it anyway so a single-observation insert doesn't sit forever.
// 50ms is short enough to be invisible to operators but long enough
// to gather a useful batch during bursty inserts.
const EMBED_BATCH_QUIET_MS = 50;

export class HybridStorageBackend implements StorageBackend {
  private readonly sqlite: SQLiteStorageBackend;
  private readonly vectorDbPath: string;
  private _vectorDb: VectorDb | null = null;
  private _vectorDbLoadPromise: Promise<VectorDb> | null = null;
  // Two-tier queue (W23-1 Path A):
  //   pendingBatch  — observations awaiting their batch's forward pass
  //   pendingEmbeds — already-scheduled batch promises (the drain target)
  // flushVectorWrites first flushes any pending batch, then awaits all
  // scheduled batches. New observations can land mid-flush; the loop
  // picks them up on the next iteration.
  private pendingBatch: Observation[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEmbeds: Array<Promise<void>> = [];

  constructor(projectId: string) {
    // SQLiteStorageBackend's constructor mkdirs the project root for us
    // (~/.continuum/<projectId>/), so we can place the ruvector file
    // alongside the sqlite DB without an extra mkdir.
    this.sqlite = new SQLiteStorageBackend(projectId);
    this.vectorDbPath = join(continuumDataRoot(), projectId, 'ruvector.db');
  }

  private async getVectorDb(): Promise<VectorDb> {
    if (this._vectorDb) return this._vectorDb;
    if (this._vectorDbLoadPromise) return this._vectorDbLoadPromise;
    this._vectorDbLoadPromise = (async () => {
      const rv = (await import('ruvector')) as unknown as {
        VectorDB?: VectorDbCtor;
        VectorDb?: VectorDbCtor;
        default?: VectorDbCtor;
      };
      const Ctor = rv.VectorDB ?? rv.VectorDb ?? rv.default;
      if (!Ctor) {
        throw new Error('ruvector: no VectorDB / VectorDb / default export found');
      }
      this._vectorDb = new Ctor({
        dimensions: embeddingDimensions(),
        storagePath: this.vectorDbPath,
        metric: 'cosine',
      });
      return this._vectorDb;
    })();
    return this._vectorDbLoadPromise;
  }

  /**
   * Queue an embedding + vector insert for an Observation that was just
   * persisted to SQLite. Fire-and-forget — errors log to stderr but
   * never throw back at the synchronous insert path.
   *
   * W23-1 Path A: buffer observations and flush in batches of
   * EMBED_BATCH_SIZE (32). A short quiet-period timer (50ms) ensures
   * single-observation inserts don't sit in the buffer indefinitely.
   * Batching amortises the forward-pass cost across many inputs.
   */
  private queueVectorIndex(obs: Observation): void {
    this.pendingBatch.push(obs);
    if (this.pendingBatch.length >= EMBED_BATCH_SIZE) {
      this.scheduleBatchFlush();
    } else if (this.batchTimer === null) {
      this.batchTimer = setTimeout(() => this.scheduleBatchFlush(), EMBED_BATCH_QUIET_MS);
    }
  }

  /**
   * Move the current pendingBatch into a fire-and-forget batch-embed
   * + batch-insert task. Resets the buffer + timer atomically.
   */
  private scheduleBatchFlush(): void {
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.pendingBatch.length === 0) return;
    const batch = this.pendingBatch;
    this.pendingBatch = [];

    const task = (async () => {
      try {
        // W23-1 Path B — route through the worker pool. Falls back to
        // inline batch when CONTINUUM_EMBED_WORKERS=0.
        const vectors = await embedBatchParallel(batch.map(o => o.content));
        const db = await this.getVectorDb();
        // RuVector's bulk-insert API is per-call insert today; batching
        // the embed forward pass is the dominant cost, so this still
        // wins. If RuVector adds db.insertMany later, swap here.
        await Promise.all(
          vectors.map((vec, i) => {
            const o = batch[i]!;
            return db.insert({
              id: o.id,
              vector: vec,
              metadata: {
                sourceId: o.sourceId,
                type: o.type,
                timestamp: o.timestamp,
              },
            });
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const ids = batch.map(o => o.id).join(',');
        process.stderr.write(
          `[continuum:hybrid] vector batch failed (${batch.length} ids=${ids.slice(0, 200)}…): ${msg}\n`,
        );
      }
    })();
    this.pendingEmbeds.push(task);
  }

  // ── StorageBackend (sync) — pass-through to SQLite for relational data

  recordCheckpoint(input: CheckpointInput): StateSnapshot {
    return this.sqlite.recordCheckpoint(input);
  }

  getStateAt(at?: string): StateSnapshot | null {
    return this.sqlite.getStateAt(at);
  }

  listSnapshots(limit?: number): StateSnapshot[] {
    return this.sqlite.listSnapshots(limit);
  }

  createTodo(input: CreateTodoInput): Todo {
    return this.sqlite.createTodo(input);
  }

  listTodos(opts: ListTodosOptions = {}): Todo[] {
    return this.sqlite.listTodos(opts);
  }

  getTodo(id: string): Todo | null {
    return this.sqlite.getTodo(id);
  }

  updateTodo(input: UpdateTodoInput): Todo {
    return this.sqlite.updateTodo(input);
  }

  upsertSource(
    id: string,
    type: SourceType,
    config?: Record<string, unknown>,
  ): void {
    this.sqlite.upsertSource(id, type, config);
  }

  // ── Observations — sync SQLite write + background vector indexing

  insertObservation(
    obs: Omit<Observation, 'id'> & { id?: string },
  ): Observation | null {
    const result = this.sqlite.insertObservation(obs);
    if (result) this.queueVectorIndex(result);
    return result;
  }

  upsertObservation(
    obs: Omit<Observation, 'id'> & { id: string },
  ): Observation | null {
    const result = this.sqlite.upsertObservation(obs);
    if (result) this.queueVectorIndex(result);
    return result;
  }

  insertObservationsBulk(
    observations: Array<Omit<Observation, 'id'>>,
  ): InsertObservationsResult {
    // V0.5 stub: bulk path stays SQLite-only because insertObservationsBulk
    // doesn't return the inserted IDs we'd need to vector-index. Adapters
    // that want their bulk-imported observations to be vector-searchable
    // should call insertObservation/upsertObservation in a loop instead.
    return this.sqlite.insertObservationsBulk(observations);
  }

  // ── Hard delete (INCIDENT RESPONSE — Issue #10) ─────────────────────────
  // Sync SQLite delete returns immediately; vector index removal is queued
  // through the same fire-and-forget channel the inserts use. If the row
  // didn't exist in SQLite we skip the vector queue too — nothing to remove.

  deleteObservation(id: string): boolean {
    const deleted = this.sqlite.deleteObservation(id);
    if (deleted) this.queueVectorDelete(id);
    return deleted;
  }

  private queueVectorDelete(id: string): void {
    const task = (async () => {
      try {
        const db = await this.getVectorDb();
        await db.delete(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[continuum:hybrid] vector delete failed for ${id}: ${msg}\n`,
        );
      }
    })();
    this.pendingEmbeds.push(task);
  }

  searchObservations(query: string, limit?: number): SearchHit[] {
    // Sync keyword search via SQLite-FTS5 stays the default. Vector
    // search is the explicit async vectorSearch() method below.
    return this.sqlite.searchObservations(query, limit);
  }

  listObservationsAround(opts: TimelineOptions): TimelineHit[] {
    // Layer-2 is a chronological-window query over the observations table.
    // SQLite owns it; vector index doesn't add value for time-bounded reads.
    return this.sqlite.listObservationsAround(opts);
  }

  getObservations(ids: string[]): Observation[] {
    // Layer-3 batch fetch is a simple SELECT IN (...) — SQLite's job.
    return this.sqlite.getObservations(ids);
  }

  close(): void {
    this.sqlite.close();
    // RuVector handles its own cleanup; no explicit close method on the
    // npm surface today.
  }

  dataLocation(): string {
    return `${this.sqlite.dataLocation()} + ${this.vectorDbPath}`;
  }

  // ── NEW async methods — NOT on the StorageBackend interface ─────────────

  /** Wait until every in-flight background vector-index write has settled. */
  async flushVectorWrites(): Promise<void> {
    // First flush any observations still sitting in the batch buffer —
    // they may not have hit the size threshold yet. Then drain pending
    // batch promises. Loop because new observations can land mid-drain
    // (or a new batch can be scheduled while we await the current one).
    do {
      if (this.pendingBatch.length > 0) this.scheduleBatchFlush();
      if (this.pendingEmbeds.length > 0) {
        const inFlight = this.pendingEmbeds;
        this.pendingEmbeds = [];
        await Promise.allSettled(inFlight);
      }
    } while (this.pendingBatch.length > 0 || this.pendingEmbeds.length > 0);
  }

  /**
   * Semantic search via RuVector + the embedder.
   * Returns SearchHit[] shaped like the sync FTS5 path so callers can
   * fuse the two result sets (RRF) once the V0.5 hybrid-search layer
   * lands. For now, the title field signals to the caller that the
   * full content must be fetched via continuum_get_observations.
   */
  async vectorSearch(query: string, k: number = 10): Promise<SearchHit[]> {
    const vector = await embed(query);
    const db = await this.getVectorDb();
    const results = await db.search({ vector, k });
    return results.map(r => {
      const meta = r.metadata ?? {};
      const sourceId = typeof meta.sourceId === 'string' ? meta.sourceId : 'export';
      const type = typeof meta.type === 'string' ? meta.type : 'unknown';
      const timestamp =
        typeof meta.timestamp === 'string' ? meta.timestamp : '1970-01-01T00:00:00Z';
      return {
        id: r.id,
        source: (sourceId.split(':')[0] ?? 'export') as SourceType,
        type,
        timestamp,
        title: '(vector hit — fetch full content via continuum_get_observations)',
        score: r.score,
        hasMore: true,
      };
    });
  }

  /** Diagnostic — how many vectors are currently in the RuVector index. */
  async vectorCount(): Promise<number> {
    const db = await this.getVectorDb();
    return db.len();
  }

  /** Diagnostic — where the RuVector data files live on disk. */
  vectorDataLocation(): string {
    return this.vectorDbPath;
  }

  // ── Admin: rebuild vector store from SQLite ground-truth ────────────────
  //
  // W23-1 sub-deliverables 2 + 3 (Issue #20). Iterates every observation
  // in SQLite, re-embeds via the worker pool, and re-inserts into the
  // RuVector index. SQLite is the source of truth — if SQLite has it,
  // the vector store should too. Used by both:
  //
  //   continuum reindex --backend hybrid   (rebuild from current SQLite)
  //   continuum migrate --backend hybrid   (one-time backfill after a
  //                                          V0 → V0.5 migration)
  //
  // Implementation:
  //   1. Enumerate all observation IDs from SQLite (insertion order).
  //   2. Chunk into batches of EMBED_BATCH_SIZE (32) — matches the
  //      hot-path batching used by queueVectorIndex.
  //   3. For each chunk: fetch full observations, best-effort delete
  //      any existing vectors (idempotency — safe to re-run), embed
  //      batch via worker pool, insert into RuVector.
  //   4. Report progress via optional callback.
  //   5. Return {rebuilt, failed} counts. Caller decides what to do
  //      with failures (CLI prints them; programmatic callers can retry).
  //
  // Throughput on the W23-1 benchmark hardware: ~112 inserts/sec with
  // Workers=4. For a 10k observation project: ~90s. For a 1k project: ~9s.

  async rebuildVectorStore(
    opts: { onProgress?: (done: number, total: number) => void } = {},
  ): Promise<{ rebuilt: number; failed: number; total: number }> {
    const ids = this.sqlite.listAllObservationIds();
    const total = ids.length;
    let rebuilt = 0;
    let failed = 0;

    if (total === 0) {
      opts.onProgress?.(0, 0);
      return { rebuilt: 0, failed: 0, total: 0 };
    }

    const BATCH = EMBED_BATCH_SIZE;
    const db = await this.getVectorDb();

    for (let i = 0; i < total; i += BATCH) {
      const chunkIds = ids.slice(i, i + BATCH);
      // getObservations caps at 50; BATCH=32 stays well under.
      const observations = this.sqlite.getObservations(chunkIds);
      if (observations.length === 0) {
        // Rows disappeared between listAllObservationIds() and now (DELETE
        // race). Skip; the caller's next migrate run will see the new state.
        opts.onProgress?.(rebuilt + failed, total);
        continue;
      }

      try {
        // Best-effort delete to keep this method idempotent — re-running
        // it shouldn't create duplicate vectors. RuVector.delete returns
        // false on not-found (no exception); we swallow either way.
        await Promise.all(
          observations.map(o => db.delete(o.id).catch(() => false)),
        );
        // Embed the batch through the worker pool (W23-1 Path B).
        const vectors = await embedBatchParallel(observations.map(o => o.content));
        // Insert each. RuVector's insert API is per-call; the WIN from
        // batching is the embedder forward pass, which already happened.
        await Promise.all(
          vectors.map((vec, idx) => {
            const o = observations[idx]!;
            return db.insert({
              id: o.id,
              vector: vec,
              metadata: {
                sourceId: o.sourceId,
                type: o.type,
                timestamp: o.timestamp,
              },
            });
          }),
        );
        rebuilt += observations.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[continuum:hybrid:rebuild] batch ${i}-${i + chunkIds.length} failed: ${msg}\n`,
        );
        failed += chunkIds.length;
      }
      opts.onProgress?.(rebuilt + failed, total);
    }

    // Wait for any background embed promises that may have been
    // triggered concurrently (shouldn't be, since we await every
    // batch — but defensive).
    await this.flushVectorWrites();

    return { rebuilt, failed, total };
  }
}
