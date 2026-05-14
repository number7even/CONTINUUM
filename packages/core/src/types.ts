/**
 * Continuum core data types.
 *
 * Five canonical entities — see ARCHITECTURE.md §4.
 *
 * Storage adapter pattern: types are storage-agnostic.
 * V0 implementation uses SQLite + FTS5. V0.5+ may swap to RuVector
 * without changing these type definitions.
 */

/** Where an Observation originated. */
export type SourceType = 'docs' | 'mem' | 'sona' | 'git' | 'export';

/** A configured source adapter instance. */
export interface Source {
  id: string;
  type: SourceType;
  /** Adapter-specific configuration (JSON-serializable). */
  config?: Record<string, unknown>;
  /** ISO-8601 timestamp of last successful sync, or null if never synced. */
  lastSyncedAt: string | null;
}

/**
 * Canonical Observation record. Every event captured by any source adapter
 * normalizes to this shape before indexing.
 *
 * Privacy invariant (ARCHITECTURE.md §8): content passes through the
 * PrivacyFilter at the Aggregator BEFORE this record is constructed.
 */
export interface Observation {
  /** Globally unique ID (UUID v7 for time-ordered insertion). */
  id: string;
  sourceId: string;
  /** Source-specific type: 'commit', 'file_edit', 'pain_signal', etc. */
  type: string;
  /** Full text content, post-privacy-filter. */
  content: string;
  /** ISO-8601 timestamp of the observed event (not the index time). */
  timestamp: string;
  /** References to other Observation IDs (provenance graph). */
  refs: string[];
  /** Source-adapter-specific metadata (JSON-serializable). */
  metadata?: Record<string, unknown>;
}

/**
 * Immutable point-in-time snapshot of project state.
 * Append-only — every checkpoint creates a new row.
 *
 * Query history: "what was true on May 14?" → SELECT * WHERE timestamp = ...
 */
export interface StateSnapshot {
  id: string;
  /** When this snapshot was recorded. */
  timestamp: string;
  /** Currently active in production, with verify commands. */
  active: StateEntry[];
  /** Built but not the active path. */
  dormant: StateEntry[];
  /** Known failures with reproduction steps. */
  broken: StateEntry[];
  /** SHA-256 of the canonical-serialized contents (tamper detection). */
  hash: string;
  /** Why this checkpoint was recorded (manual reason or auto-trigger label). */
  reason: string;
}

export interface StateEntry {
  /** Short identifier — e.g., "voice-vendor-default". */
  name: string;
  /** Where in the codebase this state lives — e.g., "src/hooks/foo.ts:102". */
  where: string;
  /** Shell command that proves this entry is currently true. */
  verifyCommand: string;
  /** Git commit that established this state. */
  landedAt?: string;
  /** ISO-8601 timestamp of last verification. */
  verifiedAt: string;
  /** Operator-facing description. */
  description?: string;
}

/**
 * An open commitment tracked by the Todo Pipeline.
 *
 * State machine: open → in_progress → done | blocked
 */
export interface Todo {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  /** Observation IDs that motivated this todo. */
  refs: string[];
  createdAt: string;
  completedAt?: string;
  /** Shell command that verifies this todo is satisfied. */
  verifyCommand?: string;
  /** Other Todo IDs that must complete before this one can start. */
  blockedBy: string[];
}

/**
 * A composed narrative of what happened in a time window.
 * Regeneratable from sources — not the source of truth.
 */
export interface Digest {
  id: string;
  windowStart: string;
  windowEnd: string;
  /** Generated narrative (template-based in V0). */
  narrative: string;
  /** Git commits in window. */
  commits: Array<{ hash: string; subject: string; author: string; timestamp: string }>;
  /** StateSnapshot diff between window start and end. */
  stateDiff: {
    added: StateEntry[];
    removed: StateEntry[];
    changed: Array<{ before: StateEntry; after: StateEntry }>;
  };
  /** Todo state transitions in window. */
  todoDelta: {
    created: Todo[];
    completed: Todo[];
    blocked: Todo[];
  };
  createdAt: string;
}

/**
 * A search result hit. Progressive Disclosure Layer 1 (ARCHITECTURE.md §5).
 * Compact — ~50-100 tokens per hit.
 */
export interface SearchHit {
  id: string;
  source: SourceType;
  type: string;
  timestamp: string;
  /** 1-line summary, ~60 chars. */
  title: string;
  /** Composite score from FTS5 + (V0.5+) vector fusion. */
  score: number;
  /** True if full content is >2KB — caller should batch get_observations. */
  hasMore: boolean;
}
