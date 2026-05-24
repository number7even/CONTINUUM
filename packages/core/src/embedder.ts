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
type EmbedPipeline = (
  text: string,
  options?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
) => Promise<{ data: Float32Array }>;

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
 */
export async function embed(text: string): Promise<Float32Array> {
  const p = await loadPipeline();
  const result = await p(text, { pooling: 'mean', normalize: true });
  // result.data is a Float32Array for the pooled sentence embedding.
  return result.data;
}

/** Fixed at 384 today (MiniLM-L6-v2). Higher-dim models would need migration. */
export function embeddingDimensions(): number {
  return EMBEDDING_DIM;
}
