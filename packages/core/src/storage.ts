/**
 * StorageBackend — the abstract persistence interface for Continuum.
 *
 * V0 ships a single concrete implementation: SQLiteStorageBackend (better-sqlite3
 * + FTS5). V0.5+ lands RuVectorStorageBackend (unified vector + graph + relational
 * with GNN-reinforced retrieval and RVF cognitive containers) as a drop-in swap.
 *
 * Architecture invariants encoded in this interface:
 *
 *   • Operations are domain-level, NOT SQL-level. Backends are free to use vector
 *     ops, graph traversals, or anything else — SQL must not leak into callers.
 *   • Privacy filtering happens INSIDE the backend on observation writes. Adapters
 *     never bypass it (ARCHITECTURE.md §8 invariant).
 *   • Checkpoints are immutable. recordCheckpoint always inserts a new row.
 *   • Search returns Progressive Disclosure Layer-1 hits — compact ~50-100 tokens
 *     per result. Full content is fetched separately (V0.5+ get_observations).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type {
  Observation,
  SearchHit,
  SourceType,
  StateSnapshot,
  TimelineHit,
  Todo,
} from './types.js';

// ── Input types for write operations ────────────────────────────────────────

export interface CheckpointInput {
  reason: string;
  active: import('./types.js').StateEntry[];
  dormant?: import('./types.js').StateEntry[];
  broken?: import('./types.js').StateEntry[];
}

export interface CreateTodoInput {
  title: string;
  refs?: string[];
  verifyCommand?: string;
  blockedBy?: string[];
  status?: Todo['status'];
}

export interface ListTodosOptions {
  status?: Todo['status'];
  limit?: number;
}

export interface UpdateTodoInput {
  id: string;
  status?: Todo['status'];
  title?: string;
  verifyCommand?: string | null;
  blockedBy?: string[];
  refs?: string[];
}

export interface InsertObservationsResult {
  inserted: number;
  dropped: number;
}

/**
 * Anchor + window for Layer-2 timeline retrieval. Either anchor by an
 * observation ID (uses that observation's timestamp) or by an ISO
 * timestamp directly; if neither is given, anchor = now.
 */
export interface TimelineOptions {
  /** Anchor by observation ID. Mutually exclusive with `at`. */
  aroundId?: string;
  /** Anchor by ISO-8601 timestamp. Defaults to now if neither is set. */
  at?: string;
  /** Hours of context before the anchor. Default 1. */
  beforeHours?: number;
  /** Hours of context after the anchor. Default 1. */
  afterHours?: number;
  /** Max results. Default 50, max 200. */
  limit?: number;
}

// ── The interface ───────────────────────────────────────────────────────────

export interface StorageBackend {
  // — Checkpoints — immutable state snapshots
  recordCheckpoint(input: CheckpointInput): StateSnapshot;
  getStateAt(at?: string): StateSnapshot | null;
  listSnapshots(limit?: number): StateSnapshot[];

  // — Todos — live commitment pipeline
  createTodo(input: CreateTodoInput): Todo;
  listTodos(opts?: ListTodosOptions): Todo[];
  getTodo(id: string): Todo | null;
  updateTodo(input: UpdateTodoInput): Todo;

  // — Observations — privacy-filtered event log
  upsertSource(id: string, type: SourceType, config?: Record<string, unknown>): void;
  insertObservation(obs: Omit<Observation, 'id'> & { id?: string }): Observation | null;
  /**
   * Upsert an Observation with a caller-supplied stable ID. Used by adapters
   * (`docs`, `git`, …) that want re-running their sync to be idempotent —
   * derive a deterministic ID from the source artifact (e.g. file path) and
   * call this. Privacy filter still runs; returns null if the observation was
   * dropped (entire content was private).
   */
  upsertObservation(obs: Omit<Observation, 'id'> & { id: string }): Observation | null;
  insertObservationsBulk(observations: Array<Omit<Observation, 'id'>>): InsertObservationsResult;

  /**
   * INCIDENT RESPONSE ONLY — permanently delete an Observation by ID.
   *
   * Hard-delete. Removes the row from `observations` (the FTS5 index entry
   * is cleaned automatically via the AFTER DELETE trigger). In hybrid
   * backends, also queues removal from the vector index. Returns true if
   * a row matched and was deleted, false if no row existed for that ID.
   *
   * Intended for: secrets that leaked past the privacy filter, PII landed
   * via metadata, external operator requests for data removal, accidental
   * ingest of confidential markdown. Pairs with the write-time privacy
   * filter to close the privacy loop — write-time scrub catches known
   * patterns; this catches the rest.
   *
   * This is NOT a soft-delete and does NOT cascade through derived state
   * (digests, briefings) — those regenerate on next read and reflect the
   * post-delete reality. Snapshots that referenced the deleted ID via
   * refs[] keep the dangling reference; treat as historical artifact.
   */
  deleteObservation(id: string): boolean;

  // — Search — Progressive Disclosure Layer-1
  searchObservations(query: string, limit?: number): SearchHit[];

  /**
   * Layer-2 Progressive Disclosure — observations in chronological order
   * around a reference point (observation ID OR ISO timestamp). Returns
   * compact TimelineHit[] with `offsetSec` so the agent reads "what
   * happened N seconds before/after X" without computing it.
   */
  listObservationsAround(opts: TimelineOptions): TimelineHit[];

  /**
   * Layer-3 Progressive Disclosure — batch full-text fetch for
   * specifically-narrowed Observation IDs. The expensive step (~500-2000
   * tokens per observation). Caps at 50 IDs per call; extras silently
   * dropped — caller should batch.
   */
  getObservations(ids: string[]): Observation[];

  // — Lifecycle —
  close(): void;
  /** Diagnostic — where the backing data lives. */
  dataLocation(): string;
}
