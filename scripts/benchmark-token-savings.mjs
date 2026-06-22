#!/usr/bin/env node
/**
 * P6-T4 — Token-savings benchmark for Progressive Disclosure.
 *
 * Measures the REAL token cost of answering project-history questions two ways:
 *
 *   NAIVE FLAT RETRIEVAL  — what an AI without Continuum does: it can't cheaply
 *     preview, so to answer "how does X work / what happened with Y" it loads the
 *     FULL content of every observation that matches the query.
 *
 *   PROGRESSIVE DISCLOSURE — Continuum's 3-layer pattern: Layer-1 search returns
 *     compact hits (id + ~60-char title + score, no body) for ALL matches; the AI
 *     reads those cheaply, then Layer-3 fetches the FULL body for only the K IDs
 *     it actually needs.
 *
 * The reported figure is whatever the math says. If it's 2-3x, we publish 2-3x.
 * We do NOT publish a number we cannot reproduce.
 *
 * HONESTY NOTES
 *  - Corpus is REAL: this repo's own git history (commit subject + body), ingested
 *    the same way the git adapter does. Reproducible by anyone who clones the repo.
 *  - Token counts use tiktoken o200k_base (via gpt-tokenizer). Claude's exact
 *    tokenizer is not public, but the SAVINGS RATIO is tokenizer-robust: numerator
 *    and denominator are counted with the same tokenizer, so the ratio is stable
 *    regardless of which BPE is used. We report the ratio, not raw Claude tokens.
 *  - K (how many full observations the AI fetches at Layer-3) is the key lever, so
 *    we report K = 1, 3, 5 transparently rather than cherry-picking one.
 *  - The naive baseline is the SAME matched set as progressive (a fair apples-to-
 *    apples comparison), not an inflated "load the entire DB" strawman.
 *
 * RUN:  node scripts/benchmark-token-savings.mjs
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'gpt-tokenizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CORE_DIST = resolve(REPO_ROOT, 'packages/core/dist/index.js');

const { SQLiteStorageBackend } = await import(CORE_DIST);

const tok = (obj) => encode(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)).length;

// Representative queries — terms that genuinely recur across this repo's history.
const QUERIES = [
  'StorageBackend',
  'tenant isolation',
  'privacy filter',
  'checkpoint',
  'publish npm',
  'MCP server',
  'protobufjs',
  'progressive disclosure',
];
const K_VALUES = [1, 3, 5];

// ── 1. Build a REAL corpus from this repo's git history ──────────────────────
function ingestGitHistory(storage) {
  // Same shape the git adapter uses: one Observation per commit, content =
  // subject + body. \x1f field sep, \x1e record sep (safe multi-line parse).
  const raw = execSync(
    'git -C "' + REPO_ROOT + '" log --pretty=format:%H%x1f%aI%x1f%s%x1f%b%x1e -n 400',
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const records = raw.split('\x1e').map((r) => r.trim()).filter(Boolean);
  storage.upsertSource('git:continuum', 'git'); // parent row for the FK
  let n = 0;
  for (const rec of records) {
    const [sha, iso, subject, body] = rec.split('\x1f');
    if (!sha) continue;
    const content = (subject + (body ? '\n\n' + body : '')).trim();
    if (!content) continue;
    storage.insertObservation({
      id: sha.slice(0, 8),
      sourceId: 'git:continuum',
      type: 'commit',
      content,
      timestamp: iso ?? new Date(0).toISOString(),
      refs: [],
    });
    n++;
  }
  return n;
}

// ── 2. Measure one query ─────────────────────────────────────────────────────
function measureQuery(storage, query) {
  const hits = storage.searchObservations(query, 20); // Layer-1 compact hits
  if (hits.length === 0) return null;
  const ids = hits.map((h) => h.id);

  // NAIVE: full body of EVERY hit (what grep+read does without preview).
  const naiveFull = storage.getObservations(ids);
  const naiveTokens = tok({ requested: ids.length, returned: naiveFull.length, observations: naiveFull });

  // PROGRESSIVE Layer-1: the compact hit list the AI reads first (all matches).
  const layer1Tokens = tok({ query, count: hits.length, hits });

  // PROGRESSIVE Layer-3: full body for only the top-K the AI selects.
  const perK = {};
  for (const K of K_VALUES) {
    const topK = ids.slice(0, K);
    const full = storage.getObservations(topK);
    const layer3 = tok({ requested: topK.length, returned: full.length, observations: full });
    const progressive = layer1Tokens + layer3;
    perK[K] = { progressiveTokens: progressive, ratio: naiveTokens / progressive };
  }
  return { query, hitCount: hits.length, naiveTokens, layer1Tokens, perK };
}

// ── 3. Run ───────────────────────────────────────────────────────────────────
const TMP = mkdtempSync(join(tmpdir(), 'continuum-bench-'));
const storage = new SQLiteStorageBackend('benchmark-' + Date.now());
try {
  const ingested = ingestGitHistory(storage);
  console.log('CONTINUUM — Progressive Disclosure token-savings benchmark (P6-T4)');
  console.log('='.repeat(72));
  console.log(`Corpus: ${ingested} real git-commit observations from this repo.`);
  console.log('Tokenizer: tiktoken o200k_base (ratio is tokenizer-robust).');
  console.log('Naive = full body of all FTS5 matches. Progressive = Layer-1 compact');
  console.log('hits (all matches) + Layer-3 full body for top-K. K reported 1/3/5.\n');

  const rows = [];
  for (const q of QUERIES) {
    const r = measureQuery(storage, q);
    if (!r) { console.log(`  "${q}" — no hits, skipped`); continue; }
    rows.push(r);
    const k3 = r.perK[3];
    console.log(
      `  ${q.padEnd(24)} hits=${String(r.hitCount).padStart(2)}  ` +
      `naive=${String(r.naiveTokens).padStart(6)}t  ` +
      `prog@K3=${String(k3.progressiveTokens).padStart(5)}t  ` +
      `savings=${k3.ratio.toFixed(2)}x`,
    );
  }

  // Aggregate: sum tokens across queries (weights by real query size), per K.
  console.log('\n' + '-'.repeat(72));
  console.log('AGGREGATE (sum of tokens across all queries):');
  const sumNaive = rows.reduce((a, r) => a + r.naiveTokens, 0);
  for (const K of K_VALUES) {
    const sumProg = rows.reduce((a, r) => a + r.perK[K].progressiveTokens, 0);
    const ratio = sumNaive / sumProg;
    console.log(
      `  K=${K}:  naive=${sumNaive}t  progressive=${sumProg}t  ` +
      `→  ${ratio.toFixed(2)}x token reduction ` +
      `(${(100 * (1 - sumProg / sumNaive)).toFixed(1)}% fewer)`,
    );
  }
  console.log('\nThe honest headline figure is the K=3 aggregate above.');
  console.log('Reproduce: node scripts/benchmark-token-savings.mjs');
} finally {
  storage.close?.();
  rmSync(TMP, { recursive: true, force: true });
}
