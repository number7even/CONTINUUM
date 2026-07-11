// Ask Phase 4 verify — SEMANTIC understanding beats keywords.
//
// The proof-gate the architecture demands: a CONCEPTUAL query with ZERO keyword
// overlap with the target must still retrieve it (via RuVector semantic fusion),
// while FTS5-alone MISSES it. If both are true, meaning > keywords is proven.
//
//   CONTINUUM_STORAGE_BACKEND=hybrid node scripts/verify-semantic-search.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage, retrieveContext } from '@number7even/continuum-core';

process.env.CONTINUUM_STORAGE_BACKEND = 'hybrid'; // ensure the semantic backend
if (!process.env.CONTINUUM_DATA_DIR) process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'semantic-'));
const s = openStorage('semantic-phase4');
const now = new Date().toISOString();
s.upsertSource('docs:p', 'docs', {});

// Target shares NO query keyword — only meaning (evaluation / checking / grading).
const target = s.insertObservation({
  sourceId: 'docs:p', type: 'doc', timestamp: now, refs: [],
  content: 'An impartial examiner reviews and validates every answer; nothing is accepted until it passes the independent evaluation.',
});
// Decoys — unrelated in both keyword AND meaning.
s.insertObservation({ sourceId: 'docs:p', type: 'doc', timestamp: now, refs: [], content: 'The chef prepared a three-course dinner with fresh seafood and a citrus dessert.' });
s.insertObservation({ sourceId: 'docs:p', type: 'doc', timestamp: now, refs: [], content: 'The morning train departed the central station precisely at nine and headed north.' });

if (typeof s.flushVectorWrites === 'function') await s.flushVectorWrites(); // settle embeddings

const query = 'who grades the homework and marks it correct';

// (a) FTS5-alone must MISS the target (no shared keywords).
const fts = s.searchObservations(query, 10);
const ftsHasTarget = fts.some((h) => h.id === target.id);

// (b) fused retrieval (semantic) must RECOVER it.
const res = await retrieveContext(s, query, { limit: 10 });
const node = res.nodes.find((n) => n.id === target.id);

console.log('FTS5-alone hits:', fts.length, '· target in FTS5:', ftsHasTarget);
console.log('semantic layer online:', res.semantic);
console.log('fused nodes:', res.nodes.map((n) => `${n.id.slice(0, 8)}[${n.match}]`).join(' '));
console.log('target recovered:', !!node, node ? `· match=${node.match} · rank #${res.nodes.indexOf(node) + 1}` : '');

const green = res.semantic && !ftsHasTarget && !!node && node.match.includes('semantic');
console.log(green
  ? 'SEMANTIC_VERIFY: GREEN — meaning beat keywords (FTS5 missed it, semantic found it)'
  : 'SEMANTIC_VERIFY: RED');
process.exit(green ? 0 : 1);
