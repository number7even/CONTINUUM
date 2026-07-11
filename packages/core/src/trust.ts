/**
 * The trust gradient + the Ask retrieval primitive.
 *
 * `tierOf` operationalises SYSTEM_ARCHITECTURE §5 (the trust gradient) directly onto
 * an Observation — so every citation, node hover, and Ask answer can show *how much a
 * piece of evidence can be trusted*, never a "dead word". `retrieveContext` is the
 * heart of the Ask: search (FTS5 → +vector) → fetch → a tier-enriched, cited bundle.
 *
 * Both are pure over the storage read-path — no model, no network — so they are
 * deterministically verifiable.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { Observation } from './types.js';
import type { StorageBackend } from './storage.js';

/** The epistemic tier of a piece of evidence (highest → lowest trust). */
export type TrustTier = 'proven' | 'authored' | 'reference' | 'external' | 'claimed';

/** Source genre from a sourceId prefix (the part before ':'). */
function genreOf(sourceId: string): string {
  const i = sourceId.indexOf(':');
  return (i === -1 ? sourceId : sourceId.slice(0, i)).toLowerCase();
}

/**
 * Derive the trust tier of an Observation:
 *   authored  — a human P9 decision (the Authorship Ledger)
 *   proven    — a mechanical verification passed (a command that exited 0)
 *   reference — human-/adapter-authored records (docs · git commits · concepts · memory):
 *               data to verify, not proof
 *   external  — ingested untrusted sources (web · youtube · sona-external)
 *   claimed   — ungrounded (reserved for a live model assertion until it cites a node;
 *               also the fallback when an Observation can't be resolved)
 */
export function tierOf(obs: Observation): TrustTier {
  const g = genreOf(obs.sourceId);
  if (obs.type === 'decision' || g === 'authorship') return 'authored';
  if (obs.type === 'command') {
    const m = (obs.metadata ?? {}) as { exitCode?: number; status?: string };
    return m.exitCode === 0 || m.status === 'ok' ? 'proven' : 'reference';
  }
  if (g === 'external' || g === 'youtube' || g === 'web' || g === 'sona') return 'external';
  return 'reference';
}

export interface RetrievedNode {
  id: string;
  title: string;
  source: string;
  type: string;
  /** The trust gradient, per node — the UI shows this so no citation is a dead word. */
  tier: TrustTier;
  score: number;
  excerpt: string;
}
export interface RetrievalResult {
  query: string;
  count: number;
  nodes: RetrievedNode[];
}

/**
 * The Ask retrieval: Layer-1 search (FTS5 now, +RuVector fusion later) → Layer-3 fetch
 * → a cited, tier-enriched bundle. One call, grounded, ready for a model to answer over
 * (or for the UI to render with tiers).
 */
export function retrieveContext(
  storage: Pick<StorageBackend, 'searchObservations' | 'getObservations'>,
  query: string,
  opts?: { limit?: number; excerpt?: number },
): RetrievalResult {
  const limit = opts?.limit ?? 12;
  const excerptLen = opts?.excerpt ?? 300;
  const hits = storage.searchObservations(query, limit);
  const obs = storage.getObservations(hits.map((h) => h.id));
  const byId = new Map(obs.map((o) => [o.id, o]));
  const nodes: RetrievedNode[] = hits.map((h) => {
    const o = byId.get(h.id);
    return {
      id: h.id,
      title: h.title,
      source: h.source,
      type: h.type,
      tier: o ? tierOf(o) : 'claimed',
      score: h.score,
      excerpt: (o?.content ?? '').slice(0, excerptLen).trim(),
    };
  });
  return { query, count: nodes.length, nodes };
}
