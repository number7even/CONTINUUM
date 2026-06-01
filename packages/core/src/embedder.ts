/**
 * Embedder — wraps @xenova/transformers feature-extraction pipeline.
 *
 * Loads MiniLM-L6-v2 (384-dim, MIT, ~25 MB on disk after first use) LAZILY
 * on the first embed() call. The model + pipeline are cached in-process so
 * subsequent calls skip the load.
 *
 * Used by HybridStorageBackend to embed observation content before it
 * lands in the RuVector vector index.
 *
 * V0.5 default model can be overridden via $CONTINUUM_EMBEDDING_MODEL
 * (any sentence-transformers-compatible model on the Hugging Face hub
 * that @xenova/transformers can load).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */

import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const DEFAULT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

// @xenova/transformers' pipeline returns a callable instance; we treat
// it as `any` here to avoid pulling its (large) type tree into core.
// The pipeline accepts either a single string OR an array of strings.
// When given an array, the returned tensor has shape [batch, dim] —
// .data is the flat Float32Array of length batch*dim, .dims is the shape.
type EmbedPipelineResult = {
  data: Float32Array;
  dims?: number[];
};
type EmbedPipeline = (
  text: string | string[],
  options?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
) => Promise<EmbedPipelineResult>;

let _pipeline: EmbedPipeline | null = null;
let _loadPromise: Promise<EmbedPipeline> | null = null;

async function loadPipeline(): Promise<EmbedPipeline> {
  if (_pipeline) return _pipeline;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const mod: { pipeline: (task: string, modelId: string) => Promise<unknown> } =
      (await import('@xenova/transformers')) as never;
    const modelId = process.env.CONTINUUM_EMBEDDING_MODEL ?? DEFAULT_MODEL_ID;
    const p = (await mod.pipeline('feature-extraction', modelId)) as unknown as EmbedPipeline;
    _pipeline = p;
    return p;
  })();
  return _loadPromise;
}

/**
 * Embed `text` into a normalised mean-pooled Float32Array of length
 * `embeddingDimensions()`. Throws on model load / forward-pass failure.
 *
 * For high-throughput callers (bulk ingest), prefer `embedBatch(texts)`
 * which amortises the forward-pass overhead across multiple inputs.
 */
export async function embed(text: string): Promise<Float32Array> {
  const p = await loadPipeline();
  const result = await p(text, { pooling: 'mean', normalize: true });
  // result.data is a Float32Array for the pooled sentence embedding.
  return result.data;
}

/**
 * Embed an array of texts in a single forward pass through the model.
 *
 * @xenova/transformers accepts an array natively and returns a tensor
 * with shape [batch_size, embedding_dim]. We split that flat
 * Float32Array into per-row Float32Arrays so the caller sees a clean
 * vector-per-input shape.
 *
 * W23-1 Path A (Issue #20) — addresses the embedder bottleneck found
 * in the 2026-06-01 benchmark (10k observations took 138s sequential
 * because each embed() awaited its own forward pass). Batching at
 * 32-at-a-time typically yields 5-10x throughput.
 *
 * Empty array returns empty array. Throws on model load / forward-pass
 * failure (same semantics as single embed()).
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const p = await loadPipeline();
  const result = await p(texts, { pooling: 'mean', normalize: true });
  const data = result.data;
  // Split the flat [batch * dim] buffer into per-row vectors. We trust
  // the model's pooled output is EMBEDDING_DIM wide; verify with dims
  // if present so a future model swap that changes shape fails loudly.
  if (result.dims && result.dims.length >= 2) {
    const [batch, dim] = [result.dims[0]!, result.dims[1]!];
    if (batch !== texts.length) {
      throw new Error(
        `embedBatch: batch size mismatch (got ${batch} vectors for ${texts.length} inputs)`,
      );
    }
    if (dim !== EMBEDDING_DIM) {
      throw new Error(
        `embedBatch: embedding dim mismatch (got ${dim}, expected ${EMBEDDING_DIM})`,
      );
    }
  }
  const out: Float32Array[] = new Array(texts.length);
  for (let i = 0; i < texts.length; i++) {
    out[i] = data.subarray(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM);
  }
  return out;
}

/** Fixed at 384 today (MiniLM-L6-v2). Higher-dim models would need migration. */
export function embeddingDimensions(): number {
  return EMBEDDING_DIM;
}

// ── W23-1 Path B — worker_threads parallel embed pool ─────────────────────
//
// The single-pipeline path (above) processes one forward pass at a time.
// On a multi-core machine that leaves N-1 cores idle during bulk ingest.
// The pool below loads N independent pipelines in N worker_threads and
// distributes batches across them, parallelising the WASM compute that
// is the real bottleneck found in the 2026-06-01 benchmark.
//
// Pool sizing:
//   CONTINUUM_EMBED_WORKERS=N    explicit override (N > 0)
//   CONTINUUM_EMBED_WORKERS=0    disable worker pool, fall back to inline
//   unset                        default = min(availableParallelism(), 8)
//
// Memory: each worker holds ~75MB resident (model + ONNX runtime + WASM).
// 8 workers × 75MB ≈ 600MB on a dev machine — fine. Production deployments
// on tighter machines (Fly shared-cpu-1x 512MB) should explicitly set
// CONTINUUM_EMBED_WORKERS=2 to stay within budget.
//
// Workers are .unref()'d so they don't block process exit when there's
// no pending work. Pending tasks keep the event loop alive via their
// awaiting Promises.

interface PoolSlot {
  worker: Worker;
  busy: boolean;
}

interface PendingTask {
  resolve: (vectors: Float32Array[]) => void;
  reject: (err: Error) => void;
}

interface QueueEntry {
  texts: string[];
  resolve: (v: Float32Array[]) => void;
  reject: (e: Error) => void;
}

let _pool: PoolSlot[] | null = null;
const _pendingByTaskId = new Map<string, PendingTask>();
const _queue: QueueEntry[] = [];
let _taskIdCounter = 0;

function resolvedPoolSize(): number {
  const raw = process.env.CONTINUUM_EMBED_WORKERS;
  if (raw !== undefined) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) {
      // Explicit 0 = disable pool, run inline. >0 = exact pool size, capped at 16.
      return Math.min(n, 16);
    }
  }
  // Default cap at 4. Empirical sweep (2026-06-01) showed Workers=4 is the
  // sweet spot on an 8-core machine: Workers=8 caused OS-thread contention
  // (ORT WASM grabs N threads per worker internally), Workers=2 underuses
  // the box. Cloud machines with 1-2 cores work well at this default too.
  // Operators with bigger boxes can override via CONTINUUM_EMBED_WORKERS=N.
  const cores = availableParallelism();
  return Math.min(Math.max(cores, 1), 4);
}

function ensurePool(): PoolSlot[] | null {
  if (_pool !== null) return _pool;
  const size = resolvedPoolSize();
  if (size === 0) {
    // Explicit disable. Caller will fall back to inline embedBatch.
    return null;
  }
  const workerUrl = new URL('./embedder-worker.js', import.meta.url);
  const pool: PoolSlot[] = [];
  for (let i = 0; i < size; i++) {
    const worker = new Worker(workerUrl);
    worker.unref(); // don't keep the process alive when idle
    worker.on('message', (msg: { id: string; vectors?: Float32Array[]; error?: string }) => {
      const task = _pendingByTaskId.get(msg.id);
      if (task) {
        _pendingByTaskId.delete(msg.id);
        if (msg.error) task.reject(new Error(msg.error));
        else task.resolve(msg.vectors!);
      }
      const slot = pool.find(s => s.worker === worker);
      if (slot) slot.busy = false;
      drainQueue();
    });
    worker.on('error', err => {
      const slot = pool.find(s => s.worker === worker);
      if (slot) slot.busy = false;
      process.stderr.write(
        `[continuum:embedder-worker] worker error: ${err.message}\n`,
      );
    });
    pool.push({ worker, busy: false });
  }
  _pool = pool;
  return pool;
}

function drainQueue(): void {
  if (!_pool) return;
  while (_queue.length > 0) {
    const slot = _pool.find(s => !s.busy);
    if (!slot) break;
    const entry = _queue.shift()!;
    const id = `t${++_taskIdCounter}`;
    slot.busy = true;
    _pendingByTaskId.set(id, { resolve: entry.resolve, reject: entry.reject });
    slot.worker.postMessage({ id, texts: entry.texts });
  }
}

/**
 * Embed an array of texts in parallel across the worker pool.
 *
 * One call = one batch routed to one available worker. Multiple
 * concurrent callers fan out across the pool. If all workers are busy,
 * the request queues and is dispatched when a worker frees.
 *
 * If CONTINUUM_EMBED_WORKERS=0 (explicit disable), this falls back to
 * the inline embedBatch() path — useful for memory-tight environments
 * (Fly shared-cpu-1x 512MB) or for debugging.
 *
 * W23-1 Path B (Issue #20). Re-benchmark after wiring storage-hybrid
 * through this; G1 (10k inserts <60s) should pass on ≥4-core machines.
 */
export async function embedBatchParallel(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const pool = ensurePool();
  if (!pool) {
    // Explicit pool-disabled — fall back to single-thread batch path.
    return embedBatch(texts);
  }
  return new Promise<Float32Array[]>((resolve, reject) => {
    _queue.push({ texts, resolve, reject });
    drainQueue();
  });
}

/**
 * Diagnostic — current pool size and busy count. Returns null if pool
 * is uninitialised or explicitly disabled. Used by the benchmark to
 * confirm the parallel path is actually live.
 */
export function embedderPoolStatus(): { size: number; busy: number; queueDepth: number } | null {
  if (!_pool) return null;
  return {
    size: _pool.length,
    busy: _pool.filter(s => s.busy).length,
    queueDepth: _queue.length,
  };
}
