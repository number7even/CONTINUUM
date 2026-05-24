/**
 * Observation insertion + privacy filter (V0).
 *
 * The Aggregator pattern in ARCHITECTURE.md §3 says every accepted Observation
 * passes through the privacy filter BEFORE indexing. V0 implementation lives
 * here in core so all adapters get the guarantee.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentHandoffMetadata, Observation } from './types.js';

/**
 * Privacy patterns enforced at the Aggregator (ARCHITECTURE.md §8 invariant).
 *
 * The filter runs in three passes (CTO doc §A3):
 *   1. `<private>...</private>` block redaction — the explicit nuke. If a
 *      majority of content is wrapped in tags, the observation is dropped
 *      entirely (shouldDrop=true).
 *   2. Named-pattern scrubbing — known-shape secrets (OpenAI keys, JWTs,
 *      AWS credentials, etc.) are REPLACED in-place with
 *      `[REDACTED:<label>]` so the surrounding content stays useful but
 *      the secret never reaches the index. Each match is logged to
 *      matchedPatterns[] for the operator audit trail.
 *   3. Optional Shannon-entropy detector — gated by env var
 *      CONTINUUM_PRIVACY_ENTROPY_DETECTOR=1. Scans for runs of
 *      base64-shaped chars >=40 long; redacts ones above 4.5 bits/char
 *      entropy (commit SHAs sit at ~4.0 so they pass through unscrubbed).
 *
 * Operator extensibility (CTO doc §A3): patterns can be added via JSON file
 * at $CONTINUUM_PRIVACY_CONFIG (default ~/.continuum/privacy.json), shape:
 *   { "patterns": [{ "label": "company-token", "rx": "[A-Z0-9]{32}", "flags": "g" }] }
 * Invalid regexes are skipped silently — never crash the ingest pipeline
 * because a hand-edited config file is broken.
 */

interface NamedPattern {
  label: string;
  rx: RegExp;
}

const PRIVATE_TAG_RX = /<private>[\s\S]*?<\/private>/gi;

const DEFAULT_PRIVATE_PATTERNS: NamedPattern[] = [
  // V0 baseline (shipped pre-§A3) — now also scrub, not just detect.
  { label: 'openai-key', rx: /sk-[a-zA-Z0-9_-]{20,}/g },
  { label: 'xai-key', rx: /xai-[a-zA-Z0-9_-]{20,}/g },
  { label: 'aws-access-key-id', rx: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    label: 'pem-private-key',
    rx: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  // §A3 additions (2026-05-24): closes the V0 polish privacy backlog.
  {
    label: 'jwt',
    rx: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  { label: 'gcp-service-account', rx: /"type"\s*:\s*"service_account"/gi },
  { label: 'github-token', rx: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { label: 'slack-token', rx: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: 'google-api-key', rx: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: 'stripe-live-secret', rx: /\bsk_live_[0-9a-zA-Z]{24,}\b/g },
  { label: 'stripe-live-publishable', rx: /\bpk_live_[0-9a-zA-Z]{24,}\b/g },
];

// Operator patterns are loaded once per process and cached. Reloading on
// every observation would re-read the JSON file on each insert — wasteful.
let _cachedOperatorPatterns: NamedPattern[] | null = null;

function operatorPrivacyConfigPath(): string | null {
  const override = process.env.CONTINUUM_PRIVACY_CONFIG;
  if (override && override.trim()) return override.trim();
  const home = homedir();
  return home ? join(home, '.continuum', 'privacy.json') : null;
}

function loadOperatorPatterns(): NamedPattern[] {
  const path = operatorPrivacyConfigPath();
  if (!path) return [];
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return []; // file absent → no extra patterns. Not an error.
  }
  let parsed: { patterns?: Array<{ label?: string; rx?: string; flags?: string }> };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[continuum:privacy] could not parse ${path}: ${msg}\n`);
    return [];
  }
  if (!Array.isArray(parsed?.patterns)) return [];
  const out: NamedPattern[] = [];
  for (const entry of parsed.patterns) {
    if (!entry || typeof entry.label !== 'string' || typeof entry.rx !== 'string') continue;
    const flags = typeof entry.flags === 'string' ? entry.flags : 'g';
    try {
      out.push({ label: entry.label, rx: new RegExp(entry.rx, flags) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[continuum:privacy] skipping bad regex "${entry.label}": ${msg}\n`);
    }
  }
  return out;
}

function getOperatorPatterns(): NamedPattern[] {
  if (_cachedOperatorPatterns === null) {
    _cachedOperatorPatterns = loadOperatorPatterns();
  }
  return _cachedOperatorPatterns;
}

/** Test-only: clear the cached operator patterns so tests can re-load fresh. */
export function _resetOperatorPatternsCacheForTests(): void {
  _cachedOperatorPatterns = null;
}

// ── Optional Shannon-entropy detector ────────────────────────────────────────

const HIGH_ENTROPY_CANDIDATE_RX = /[A-Za-z0-9+/_=-]{40,}/g;
const HIGH_ENTROPY_THRESHOLD = 4.5; // bits/char — above hex commit SHAs (~4.0)

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const f of freq.values()) {
    const p = f / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function scrubHighEntropy(input: string): { scrubbed: string; matched: boolean } {
  HIGH_ENTROPY_CANDIDATE_RX.lastIndex = 0;
  let matched = false;
  const out = input.replace(HIGH_ENTROPY_CANDIDATE_RX, m => {
    if (shannonEntropy(m) >= HIGH_ENTROPY_THRESHOLD) {
      matched = true;
      return '[REDACTED:high-entropy]';
    }
    return m;
  });
  return { scrubbed: out, matched };
}

// ── Result type ──────────────────────────────────────────────────────────────

/** Privacy filter result. */
export interface PrivacyResult {
  /** Content after all redactions. May be empty if entire content was private. */
  scrubbed: string;
  /** True if any pattern matched and content was modified. */
  redacted: boolean;
  /** Pattern labels that matched (for audit log). */
  matchedPatterns: string[];
  /** True if >50% of original content was inside `<private>` tags. */
  shouldDrop: boolean;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the privacy filter on a candidate Observation's content.
 *
 * Three passes: `<private>` block redaction (with shouldDrop signal),
 * named-pattern scrubbing (in-place replacement with [REDACTED:label]),
 * optional Shannon-entropy scan (opt-in via env var).
 *
 * @param content       Raw observation content.
 * @param extraPatterns Caller-supplied regexes; each gets auto-label `extra-<i>`.
 */
export function privacyFilter(content: string, extraPatterns: RegExp[] = []): PrivacyResult {
  const matched: string[] = [];

  // Pass 1 — <private>...</private> block redaction.
  PRIVATE_TAG_RX.lastIndex = 0;
  let scrubbed = content.replace(PRIVATE_TAG_RX, '[PRIVATE_REDACTED]');
  const tagBytesRemoved = content.length - scrubbed.length;
  if (tagBytesRemoved > 0) matched.push('private-tag');

  // Pass 2 — named-pattern scrubbing (defaults + operator + caller extras).
  const patterns: NamedPattern[] = [
    ...DEFAULT_PRIVATE_PATTERNS,
    ...getOperatorPatterns(),
    ...extraPatterns.map((rx, i) => ({ label: `extra-${i}`, rx })),
  ];
  for (const p of patterns) {
    p.rx.lastIndex = 0;
    const before = scrubbed;
    scrubbed = scrubbed.replace(p.rx, `[REDACTED:${p.label}]`);
    if (scrubbed !== before) matched.push(p.label);
  }

  // Pass 3 — optional Shannon-entropy detector (opt-in).
  if (process.env.CONTINUUM_PRIVACY_ENTROPY_DETECTOR === '1') {
    const r = scrubHighEntropy(scrubbed);
    scrubbed = r.scrubbed;
    if (r.matched) matched.push('high-entropy');
  }

  // shouldDrop fires only on heavy <private> tag use — pattern scrubs are
  // localised, not a "drop the whole observation" signal.
  const shouldDrop = tagBytesRemoved > content.length * 0.5;

  return {
    scrubbed,
    redacted: matched.length > 0 || tagBytesRemoved > 0,
    matchedPatterns: matched,
    shouldDrop,
  };
}

/**
 * Ensure a Source row exists in the sources table. Idempotent.
 */
export function upsertSource(db: Database.Database, id: string, type: 'docs' | 'mem' | 'sona' | 'git' | 'export', config?: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO sources (id, type, config, last_synced_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_synced_at = excluded.last_synced_at
  `).run(id, type, config ? JSON.stringify(config) : null, new Date().toISOString());
}

/**
 * Insert an Observation. Applies the privacy filter — returns null if the
 * observation was dropped (entire content was private).
 *
 * The caller is responsible for ensuring the parent Source row exists
 * (use upsertSource first).
 */
export function insertObservation(
  db: Database.Database,
  obs: Omit<Observation, 'id'> & { id?: string },
): Observation | null {
  const privacy = privacyFilter(obs.content);
  if (privacy.shouldDrop) {
    // Still write a redaction audit entry — operator can see WHAT was dropped + WHY
    return null;
  }

  const id = obs.id ?? randomUUID();
  db.prepare(`
    INSERT INTO observations (id, source_id, type, content, timestamp, refs, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    obs.sourceId,
    obs.type,
    privacy.scrubbed,
    obs.timestamp,
    JSON.stringify(obs.refs ?? []),
    obs.metadata ? JSON.stringify(obs.metadata) : null,
  );

  return {
    id,
    sourceId: obs.sourceId,
    type: obs.type,
    content: privacy.scrubbed,
    timestamp: obs.timestamp,
    refs: obs.refs ?? [],
    metadata: obs.metadata,
  };
}

/**
 * Create an `agent_handoff` observation — V0-compatible RecursiveMAS intent
 * primitive (see Issue #3 and ARCHITECTURE.md §15b Step 3).
 *
 * Captures `fromAgent → toAgent` intent + constraints + optional partial
 * state across agent boundaries using the existing privacy-filtered
 * observation pipeline. A human-readable summary goes into `content` so FTS5
 * search surfaces it; the full structured handoff lives in `metadata`.
 *
 * The caller is responsible for ensuring the parent Source row exists
 * (use `upsertSource` first).
 */
export function createAgentHandoffObservation(
  db: Database.Database,
  args: {
    sourceId: string;
    handoff: AgentHandoffMetadata;
    refs?: string[];
    timestamp?: string;
  },
): Observation | null {
  const { handoff } = args;
  const constraintsLine =
    handoff.constraints.length > 0 ? `Constraints: ${handoff.constraints.join('; ')}` : '';
  const verifierLine = handoff.verifierRef ? `Verifier: ${handoff.verifierRef}` : '';
  const summary = [
    `[handoff ${handoff.fromAgent} → ${handoff.toAgent}]`,
    handoff.intent,
    constraintsLine,
    verifierLine,
  ]
    .filter(Boolean)
    .join('\n');

  return insertObservation(db, {
    sourceId: args.sourceId,
    type: 'agent_handoff',
    content: summary,
    timestamp: args.timestamp ?? new Date().toISOString(),
    refs: args.refs ?? [],
    metadata: handoff as unknown as Record<string, unknown>,
  });
}

/**
 * Upsert an Observation with a caller-supplied stable ID.
 *
 * Used by adapters that want idempotent re-syncs (e.g. the `docs` adapter
 * derives `id` from `sha256(relativePath)` so that re-ingesting an edited
 * markdown file refreshes content in place rather than creating a duplicate).
 *
 * Privacy filter still runs. Returns null if the observation was dropped
 * (entire content was private). The caller is responsible for ensuring the
 * parent Source row exists (use `upsertSource` first).
 *
 * On conflict, ALL mutable fields update — source_id, type, content,
 * timestamp, refs, metadata. The FTS5 AFTER UPDATE trigger keeps the
 * search index consistent.
 */
export function upsertObservation(
  db: Database.Database,
  obs: Omit<Observation, 'id'> & { id: string },
): Observation | null {
  const privacy = privacyFilter(obs.content);
  if (privacy.shouldDrop) {
    return null;
  }

  db.prepare(`
    INSERT INTO observations (id, source_id, type, content, timestamp, refs, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source_id = excluded.source_id,
      type = excluded.type,
      content = excluded.content,
      timestamp = excluded.timestamp,
      refs = excluded.refs,
      metadata = excluded.metadata
  `).run(
    obs.id,
    obs.sourceId,
    obs.type,
    privacy.scrubbed,
    obs.timestamp,
    JSON.stringify(obs.refs ?? []),
    obs.metadata ? JSON.stringify(obs.metadata) : null,
  );

  return {
    id: obs.id,
    sourceId: obs.sourceId,
    type: obs.type,
    content: privacy.scrubbed,
    timestamp: obs.timestamp,
    refs: obs.refs ?? [],
    metadata: obs.metadata,
  };
}

/**
 * Bulk insert in a single transaction — used by adapters during initial backfill.
 */
export function insertObservationsBulk(
  db: Database.Database,
  observations: Array<Omit<Observation, 'id'>>,
): { inserted: number; dropped: number } {
  const insert = db.prepare(`
    INSERT INTO observations (id, source_id, type, content, timestamp, refs, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let dropped = 0;

  const tx = db.transaction((batch: Array<Omit<Observation, 'id'>>) => {
    for (const obs of batch) {
      const privacy = privacyFilter(obs.content);
      if (privacy.shouldDrop) {
        dropped++;
        continue;
      }
      const id = randomUUID();
      insert.run(
        id,
        obs.sourceId,
        obs.type,
        privacy.scrubbed,
        obs.timestamp,
        JSON.stringify(obs.refs ?? []),
        obs.metadata ? JSON.stringify(obs.metadata) : null,
      );
      inserted++;
    }
  });

  tx(observations);
  return { inserted, dropped };
}
