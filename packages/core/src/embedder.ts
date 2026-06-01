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
