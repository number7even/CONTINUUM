/**
 * embedder-worker.ts — Node worker_threads entry point for parallel
 * MiniLM-L6-v2 embedding.
 *
 * W23-1 Path B (Issue #20). Each worker independently loads the
 * @xenova/transformers pipeline (lazy on first message) and processes
 * batches of texts in isolation from other workers. The main thread
 * (embedder.ts) maintains a fixed-size pool and dispatches work via
 * postMessage; results return via postMessage with the same task ID.
 *
 * Loading the pipeline is ~3-5s on first call. Subsequent forward
 * passes are ~10ms per item inside the WASM kernel. With N workers,
 * effective throughput scales ~N× minus a small coordination overhead.
 *
 * Wire protocol:
 *
 *   main → worker: { id: string, texts: string[] }
 *   worker → main: { id: string, vectors: Float32Array[] }
 *                  OR
 *                  { id: string, error: string }
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('embedder-worker.ts must be loaded via worker_threads');
}

const EMBEDDING_DIM = 384;
const DEFAULT_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

type EmbedPipeline = (
  text: string | string[],
  options?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
) => Promise<{ data: Float32Array; dims?: number[] }>;

let _pipeline: EmbedPipeline | null = null;
let _loadPromise: Promise<EmbedPipeline> | null = null;

async function loadPipeline(): Promise<EmbedPipeline> {
  if (_pipeline) return _pipeline;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const mod: { pipeline: (t: string, m: string) => Promise<unknown> } =
      (await import('@xenova/transformers')) as never;
    const modelId = process.env.CONTINUUM_EMBEDDING_MODEL ?? DEFAULT_MODEL_ID;
    const p = (await mod.pipeline('feature-extraction', modelId)) as unknown as EmbedPipeline;
    _pipeline = p;
    return p;
  })();
  return _loadPromise;
}

interface WorkRequest {
  id: string;
  texts: string[];
}

interface WorkResponse {
  id: string;
  vectors?: Float32Array[];
  error?: string;
}

parentPort.on('message', async (msg: WorkRequest) => {
  const id = msg.id;
  try {
    const p = await loadPipeline();
    const result = await p(msg.texts, { pooling: 'mean', normalize: true });

    // Slice the flat [batch * dim] buffer into per-row Float32Arrays.
    // Use .set() with subarray to produce a *copy* in a new buffer —
    // subarray views aren't transferable across worker boundaries via
    // structured-clone, but copied Float32Arrays are.
    const out: Float32Array[] = new Array(msg.texts.length);
    for (let i = 0; i < msg.texts.length; i++) {
      const v = new Float32Array(EMBEDDING_DIM);
      v.set(result.data.subarray(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM));
      out[i] = v;
    }

    const response: WorkResponse = { id, vectors: out };
    parentPort!.postMessage(response);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const response: WorkResponse = { id, error: errMsg };
    parentPort!.postMessage(response);
  }
});
