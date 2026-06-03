/**
 * packages/core/src/cross-source-fts5.test.ts
 *
 * SPRINT-2026-W24 · W24-5 (Issue #18 — FTS5 canary fixture).
 *
 * Replaces the fragile `grep -q "fts5" packages/core/dist/db.js` pin used
 * by current checkpoint verify_commands with a behavioural test that:
 *
 *   1. Inserts EXACTLY one observation per source type, each carrying a
 *      unique sentinel string the test owns.
 *   2. Inserts one additional observation with `type='agent_handoff'`
 *      (the V0 RecursiveMAS primitive — Issue #3) under the `mem` source.
 *   3. Asserts each sentinel search returns exactly one hit with the
 *      matching source (or obs.type for the handoff fixture).
 *   4. Asserts cross-source searches over a shared keyword return hits
 *      drawn from every fixture source — proving the FTS5 index is
 *      genuinely unified, not partitioned per source.
 *
 * Why this matters beyond the source-string check it replaces:
 *
 *   The verify_command this test supersedes greps for the literal "fts5"
 *   string in the compiled JS — which passes even if the FTS5 trigger
 *   chain is broken, the bm25 ranker errors out, or
 *   `searchObservations()` was refactored to return zero hits. This file
 *   exercises the real path end-to-end against a fresh temp database
 *   from schema create through INSERT triggers through bm25 ranking.
 *
 * Run after build via:
 *   node --test packages/core/dist/cross-source-fts5.test.js
 *
 * The root `npm test` (which delegates to `npm run test --workspaces`)
 * picks this up once packages/core/package.json gets the
 * `"test": "node --test"` script — added in the same commit as this file.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteStorageBackend } from './storage-sqlite.js';
import type { SourceType } from './types.js';

// ── Fixture ───────────────────────────────────────────────────────────────────
//
// Five source types — the union encoded in db.ts:71 (`type IN ('docs','mem',
// 'sona','git','export')`). If a future migration adds a sixth, the schema
// CHECK constraint will fire on insertion and surface here.
//
// Each sentinel is intentionally a single token with `_` separators (FTS5
// treats `_` as part of a word — clean single-token match) and the shared
// keyword "CANARY" sits in every observation so the cross-source assertion
// has a real signal to test.

const SHARED_KEYWORD = 'CANARY';

interface Fixture {
  /** sources.type — the column the CHECK constraint pins. */
  sourceType: SourceType;
  /** sources.id — adapters use `<type>:<instance>` so search hit `source` field
   *  resolves to the leading segment via storage-sqlite.ts:166. */
  sourceId: string;
  /** observations.type — the row payload type. Almost always equals sourceType
   *  for normal adapter writes (docs → 'document', git → 'commit', …), but
   *  the agent_handoff fixture uses a different obs.type under a mem source. */
  obsType: string;
  /** Unique sentinel — passed to searchObservations and asserted to return
   *  exactly one hit. Single token so the FTS5 default tokenizer treats it
   *  as a literal match. */
  sentinel: string;
}

const FIXTURES: Fixture[] = [
  {
    sourceType: 'docs',
    sourceId: 'docs:fts5-canary',
    obsType: 'document',
    sentinel: 'CANARY_SENTINEL_DOCS_5b91a3',
  },
  {
    sourceType: 'git',
    sourceId: 'git:fts5-canary',
    obsType: 'commit',
    sentinel: 'CANARY_SENTINEL_GIT_4f02d7',
  },
  {
    sourceType: 'mem',
    sourceId: 'mem:fts5-canary',
    obsType: 'note',
    sentinel: 'CANARY_SENTINEL_MEM_18c46e',
  },
  {
    sourceType: 'sona',
    sourceId: 'sona:fts5-canary',
    obsType: 'self_optimization',
    sentinel: 'CANARY_SENTINEL_SONA_a3e7c2',
  },
  {
    sourceType: 'export',
    sourceId: 'export:fts5-canary',
    obsType: 'session',
    sentinel: 'CANARY_SENTINEL_EXPORT_77fa10',
  },
];

// Sixth fixture — same `mem` source row as above, but obs.type='agent_handoff'.
// This is the V0 RecursiveMAS intent primitive (Issue #3) — kept here so the
// canary covers the obs.type axis as well as the source.type axis.
const HANDOFF_FIXTURE: Fixture = {
  sourceType: 'mem',
  sourceId: 'mem:fts5-canary',
  obsType: 'agent_handoff',
  sentinel: 'CANARY_SENTINEL_HANDOFF_e69b4d',
};

// ── Test harness — isolated temp project ─────────────────────────────────────
//
// CONTINUUM_DATA_DIR points the SQLiteStorageBackend at a fresh tmpdir; the
// `fts5-canary-test` project ID never collides with a real operator project.
// after() tears the directory down even if a single assertion failed (rmSync
// with `force: true`).

const PROJECT_ID = 'fts5-canary-test';
let dataDir: string;
let originalDataDir: string | undefined;
let storage: SQLiteStorageBackend;

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-fts5-canary-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;

  storage = new SQLiteStorageBackend(PROJECT_ID);

  const now = new Date().toISOString();

  // Insert one source row per source type. The HANDOFF fixture reuses the
  // existing mem source, so we don't re-upsert it.
  for (const f of FIXTURES) {
    storage.upsertSource(f.sourceId, f.sourceType);
  }

  // Insert five base observations.
  for (const f of FIXTURES) {
    const res = storage.insertObservation({
      sourceId: f.sourceId,
      type: f.obsType,
      content: `${SHARED_KEYWORD} test fixture for ${f.sourceType} carrying ${f.sentinel}`,
      timestamp: now,
      refs: [],
    });
    assert.ok(res, `fixture insert returned null for ${f.sourceType} — privacy filter false-positive?`);
  }

  // Insert the agent_handoff observation under the mem source.
  const handoffRes = storage.insertObservation({
    sourceId: HANDOFF_FIXTURE.sourceId,
    type: HANDOFF_FIXTURE.obsType,
    content: `${SHARED_KEYWORD} handoff fixture carrying ${HANDOFF_FIXTURE.sentinel}`,
    timestamp: now,
    refs: [],
  });
  assert.ok(handoffRes, 'handoff fixture insert returned null');
});

after(() => {
  try {
    storage?.close();
  } finally {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.CONTINUUM_DATA_DIR;
    else process.env.CONTINUUM_DATA_DIR = originalDataDir;
  }
});

// ── Per-source sentinel assertions ────────────────────────────────────────────
//
// One test per fixture so a failure tells you exactly which source's
// pipeline broke (vs. one merged test that hides which source regressed).

for (const f of FIXTURES) {
  test(`FTS5 canary · ${f.sourceType} sentinel returns exactly one hit, source matches`, () => {
    const hits = storage.searchObservations(f.sentinel);
    assert.equal(hits.length, 1, `expected exactly one hit for ${f.sentinel}, got ${hits.length}`);
    const hit = hits[0]!;
    assert.equal(hit.source, f.sourceType, `hit.source mismatch for ${f.sentinel}`);
    assert.equal(hit.type, f.obsType, `hit.type mismatch for ${f.sentinel}`);
    assert.ok(hit.title.includes(f.sentinel), `hit.title should echo the sentinel for grepability`);
  });
}

test('FTS5 canary · agent_handoff sentinel returns exactly one hit, obs.type matches', () => {
  const hits = storage.searchObservations(HANDOFF_FIXTURE.sentinel);
  assert.equal(hits.length, 1);
  const hit = hits[0]!;
  assert.equal(hit.source, HANDOFF_FIXTURE.sourceType); // 'mem'
  assert.equal(hit.type, 'agent_handoff');
});

// ── Cross-source / unified-index assertion ────────────────────────────────────

test(`FTS5 canary · cross-source search on "${SHARED_KEYWORD}" returns hits across all fixture sources`, () => {
  // Six fixtures total (5 base + 1 handoff under reused mem source) → at
  // least 6 hits. The FTS5 default limit in searchObservations is 20.
  const hits = storage.searchObservations(SHARED_KEYWORD);
  assert.ok(hits.length >= 6, `expected ≥6 hits for "${SHARED_KEYWORD}", got ${hits.length}`);

  // Distinct sources hit — proves the index is unified, not partitioned.
  const distinctSources = new Set(hits.map(h => h.source));
  const expectedSources: SourceType[] = ['docs', 'git', 'mem', 'sona', 'export'];
  for (const expected of expectedSources) {
    assert.ok(
      distinctSources.has(expected),
      `cross-source search missed source=${expected} — FTS5 index appears partitioned`,
    );
  }
});

// ── Negative control ──────────────────────────────────────────────────────────
//
// A sentinel that nobody wrote should return zero hits. If this returns
// anything, the test fixture is leaking across runs or FTS5 is over-matching.

test('FTS5 canary · unknown sentinel returns zero hits (negative control)', () => {
  const hits = storage.searchObservations('CANARY_SENTINEL_NEVER_INSERTED_zzz999');
  assert.equal(hits.length, 0);
});
