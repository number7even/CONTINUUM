/**
 * concepts.ts — deterministic concept extraction for the "brain" graph.
 *
 * The video critique (nouns=nodes, verbs=edges) is right: a document graph
 * (file→file links) is the coarse layer. The richer layer is CONCEPTS — the
 * named entities a doc is *about*. This surfaces them WITHOUT an LLM, so every
 * concept and every edge stays grep-verifiable (P4/P9 — no hallucinated edges).
 *
 * Signal: identifiers written in `backticks` (RuVector, vault-guard.mjs,
 * StorageBackend, continuum_graph). A term becomes a concept-node only when it
 * appears in >= minDocs observations — a one-off mention is noise; a term shared
 * across docs is a real concept hub. Edges are concept→observation MENTIONS
 * (untyped on purpose: we assert "this doc names this concept", which is true,
 * not "concept A relates-to concept B", which would require inference).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { Observation } from './types.js';
import type { GraphEdge, GraphNode } from './graph.js';

const BACKTICK = /`([^`]{2,48})`/g;

/** Identifier-like? no whitespace, has a letter, not a CLI flag, and looks like
 *  code (dotted / dashed / slashed / camelCase / Capitalized-word). */
export function isConceptTerm(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 3 || t.length > 40) return false;
  if (/\s/.test(t)) return false;              // commands / phrases
  if (/^[-/]/.test(t)) return false;           // --flags, /paths
  if (!/[a-zA-Z]/.test(t)) return false;       // must contain a letter
  return /[._\-/]/.test(t) || /[a-z][A-Z]/.test(t) || /^[A-Z][a-zA-Z0-9]+$/.test(t);
}

export interface ConceptOptions {
  /** A term must appear in at least this many observations to become a concept. Default 2. */
  minDocs?: number;
  /** Cap on concept nodes (highest mention-count first). Default 400. */
  maxConcepts?: number;
}

export interface ConceptAdditions {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Extract concept-nodes + mention-edges from observations. Pure + deterministic.
 * Concept node id = `concept:<lowercased-term>`; degree = number of docs mentioning it.
 */
export function extractConcepts(observations: Observation[], opts: ConceptOptions = {}): ConceptAdditions {
  const minDocs = Math.max(1, opts.minDocs ?? 2);
  const maxConcepts = opts.maxConcepts ?? 400;

  const mentions = new Map<string, Set<string>>(); // key → observation ids
  const display = new Map<string, string>();

  for (const o of observations) {
    const seen = new Set<string>();
    const re = new RegExp(BACKTICK.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(o.content ?? '')) !== null) {
      const raw = m[1]!.trim();
      if (!isConceptTerm(raw)) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue; // count each doc once per concept
      seen.add(key);
      if (!mentions.has(key)) mentions.set(key, new Set());
      mentions.get(key)!.add(o.id);
      if (!display.has(key)) display.set(key, raw);
    }
  }

  const kept = [...mentions.entries()]
    .filter(([, ids]) => ids.size >= minDocs)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, maxConcepts);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const [key, ids] of kept) {
    const cid = `concept:${key}`;
    nodes.push({ id: cid, source: 'concept', type: 'concept', label: display.get(key)!, timestamp: '', degree: ids.size });
    for (const oid of ids) edges.push({ source: cid, target: oid });
  }
  return { nodes, edges };
}
