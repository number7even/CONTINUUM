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
import type { Observation, SearchHit } from './types.js';
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
  /** Fused rank score (Reciprocal Rank Fusion over keyword + semantic). */
  score: number;
  /** Which signal(s) surfaced this node: 'keyword' · 'semantic' · 'keyword+semantic'. */
  match: string;
  excerpt: string;
}
export interface RetrievalResult {
  query: string;
  count: number;
  /** True when the semantic (vector) layer contributed — i.e. the hybrid backend is online. */
  semantic: boolean;
  nodes: RetrievedNode[];
}

/**
 * The Ask retrieval (Semantic SONA): fuse Layer-1 FTS5 keyword rank with RuVector
 * SEMANTIC rank via Reciprocal Rank Fusion, then Layer-3 fetch → a cited, tier-enriched
 * bundle. Keyword precision + semantic recall in one ranked list — a node found by BOTH
 * signals outranks one found by either alone. Vector search is feature-detected (hybrid
 * backend); on the sqlite backend it degrades to FTS5-only — same shape, no error.
 */
export async function retrieveContext(
  storage: Pick<StorageBackend, 'searchObservations' | 'getObservations' | 'vectorSearch'>,
  query: string,
  opts?: { limit?: number; excerpt?: number },
): Promise<RetrievalResult> {
  const limit = opts?.limit ?? 12;
  const excerptLen = opts?.excerpt ?? 300;
  const pool = Math.max(limit, 10);

  const ftsHits = storage.searchObservations(query, pool);
  let vecHits: SearchHit[] = [];
  if (typeof storage.vectorSearch === 'function') {
    try { vecHits = await storage.vectorSearch(query, pool); } catch { /* semantic is optional */ }
  }

  // Reciprocal Rank Fusion — a node in BOTH lists outranks one in either alone.
  const RRF_K = 60;
  const fused = new Map<string, { hit: SearchHit; score: number; signals: Set<string> }>();
  const merge = (list: SearchHit[], signal: string) => {
    list.forEach((h, i) => {
      const cur = fused.get(h.id);
      const s = 1 / (RRF_K + i);
      if (cur) { cur.score += s; cur.signals.add(signal); }
      else fused.set(h.id, { hit: h, score: s, signals: new Set([signal]) });
    });
  };
  merge(ftsHits, 'keyword');
  merge(vecHits, 'semantic');

  const ranked = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  const obs = storage.getObservations(ranked.map((r) => r.hit.id));
  const byId = new Map(obs.map((o) => [o.id, o]));
  const nodes: RetrievedNode[] = ranked.map((r) => {
    const o = byId.get(r.hit.id);
    return {
      id: r.hit.id,
      title: r.hit.title,
      source: r.hit.source,
      type: r.hit.type,
      tier: o ? tierOf(o) : 'claimed',
      score: r.score,
      match: [...r.signals].sort().join('+'),
      excerpt: (o?.content ?? '').slice(0, excerptLen).trim(),
    };
  });
  return { query, count: nodes.length, semantic: vecHits.length > 0, nodes };
}
