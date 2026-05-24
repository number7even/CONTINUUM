/**
 * Continuum Checkpoint Engine (V0 implementation).
 *
 * record_checkpoint serializes the current understanding of project state
 * (active / dormant / broken entries) into an immutable, hash-stamped row.
 *
 * V0.5+ replaces JSON serialization with RuVector RVF cognitive containers
 * (Git-like copy-on-write branching). See ARCHITECTURE.md §10b.
 */
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import type { StateEntry, StateSnapshot } from './types.js';

export interface CheckpointInput {
  /** Why this checkpoint was triggered (manual reason or auto-label). */
  reason: string;
  active: StateEntry[];
  dormant?: StateEntry[];
  broken?: StateEntry[];
}

/**
 * Recursive canonical JSON stringify — sorts every object's keys at every
 * depth so semantically-equal snapshots produce byte-identical strings
 * regardless of insertion order. Required for the SHA-256 hash to actually
 * fingerprint the content.
 *
 * The original implementation used `JSON.stringify(obj, [keyAllowlist])`
 * which filters property names RECURSIVELY — inner entry fields like
 * `verifyCommand` and `description` are NOT in the top-level allowlist of
 * `['active', 'dormant', 'broken']` so they got stripped from the
 * canonical form. Result: two snapshots with completely different entries
 * but the same `{counts of active/dormant/broken}` produced the same
 * "tamper-evident" hash. Caught while verifying the V0-polish-complete
 * checkpoint on 2026-05-24.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Write an immutable state snapshot. Returns the persisted row.
 *
 * Hash chain (V0): SHA-256 of canonically-serialized contents (sorted keys
 * at every depth — see canonicalStringify above). V0.5+ upgrades to RVF
 * tamper-evident witness chain linking each snapshot to its parent.
 */
export function recordCheckpoint(db: Database.Database, input: CheckpointInput): StateSnapshot {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const active = input.active;
  const dormant = input.dormant ?? [];
  const broken = input.broken ?? [];

  const canonical = canonicalStringify({ active, dormant, broken });
  const hash = createHash('sha256').update(canonical).digest('hex');

  db.prepare(`
    INSERT INTO state_snapshots (id, timestamp, active, dormant, broken, hash, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    JSON.stringify(active),
    JSON.stringify(dormant),
    JSON.stringify(broken),
    hash,
    input.reason,
  );

  return { id, timestamp, active, dormant, broken, hash, reason: input.reason };
}

/**
 * Fetch the StateSnapshot in effect at the given timestamp (or now).
 * Returns the most recent snapshot AT OR BEFORE the requested time.
 *
 * Answers: "what was true on May 14?"
 */
export function getStateAt(db: Database.Database, at?: string): StateSnapshot | null {
  const target = at ?? new Date().toISOString();
  const row = db.prepare(`
    SELECT id, timestamp, active, dormant, broken, hash, reason
    FROM state_snapshots
    WHERE timestamp <= ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(target) as
    | { id: string; timestamp: string; active: string; dormant: string; broken: string; hash: string; reason: string }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    timestamp: row.timestamp,
    active: JSON.parse(row.active) as StateEntry[],
    dormant: JSON.parse(row.dormant) as StateEntry[],
    broken: JSON.parse(row.broken) as StateEntry[],
    hash: row.hash,
    reason: row.reason,
  };
}

/**
 * List all snapshots, newest first. Used for history queries + audit.
 */
export function listSnapshots(db: Database.Database, limit = 50): StateSnapshot[] {
  const rows = db.prepare(`
    SELECT id, timestamp, active, dormant, broken, hash, reason
    FROM state_snapshots
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string;
    timestamp: string;
    active: string;
    dormant: string;
    broken: string;
    hash: string;
    reason: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    timestamp: row.timestamp,
    active: JSON.parse(row.active) as StateEntry[],
    dormant: JSON.parse(row.dormant) as StateEntry[],
    broken: JSON.parse(row.broken) as StateEntry[],
    hash: row.hash,
    reason: row.reason,
  }));
}
