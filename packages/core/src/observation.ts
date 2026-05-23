/**
 * Observation insertion + privacy filter (V0).
 *
 * The Aggregator pattern in ARCHITECTURE.md §3 says every accepted Observation
 * passes through the privacy filter BEFORE indexing. V0 implementation lives
 * here in core so all adapters get the guarantee.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { AgentHandoffMetadata, Observation } from './types.js';

/**
 * Privacy patterns dropped at Aggregator (ARCHITECTURE.md §8 invariant).
 * Operators may extend via ~/.continuum/privacy.json in V0.5.
 */
const PRIVATE_TAG_RX = /<private>[\s\S]*?<\/private>/gi;
const DEFAULT_PRIVATE_PATTERNS: RegExp[] = [
  /<private>[\s\S]*?<\/private>/i,
  /sk-[a-zA-Z0-9_\-]{20,}/,          // OpenAI/Anthropic-style API keys
  /xai-[a-zA-Z0-9_\-]{20,}/,         // xAI keys
  /AKIA[0-9A-Z]{16}/,                // AWS access key IDs
  /BEGIN[\s_]+PRIVATE[\s_]+KEY/i,    // PEM private keys
];

/** Privacy filter result. */
export interface PrivacyResult {
  /** Content after `<private>` blocks stripped. May be empty if entire content was private. */
  scrubbed: string;
  /** True if any pattern matched and content was modified or dropped. */
  redacted: boolean;
  /** Patterns that matched (for audit log). */
  matchedPatterns: string[];
  /** True if >50% of original content was private and the whole observation should be dropped. */
  shouldDrop: boolean;
}

/**
 * Run the privacy filter on a candidate Observation's content.
 * Removes `<private>` blocks. Detects high-entropy secret patterns.
 * If too much content is private, signals shouldDrop=true.
 */
export function privacyFilter(content: string, extraPatterns: RegExp[] = []): PrivacyResult {
  const patterns = [...DEFAULT_PRIVATE_PATTERNS, ...extraPatterns];
  let scrubbed = content.replace(PRIVATE_TAG_RX, '[PRIVATE_REDACTED]');
  const matched: string[] = [];

  for (const pat of patterns) {
    if (pat.test(content)) {
      matched.push(pat.toString());
    }
  }

  const removedBytes = content.length - scrubbed.length;
  const shouldDrop = removedBytes > content.length * 0.5;

  return {
    scrubbed,
    redacted: matched.length > 0 || removedBytes > 0,
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
