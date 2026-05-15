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
  insertObservationsBulk(observations: Array<Omit<Observation, 'id'>>): InsertObservationsResult;

  // — Search — Progressive Disclosure Layer-1
  searchObservations(query: string, limit?: number): SearchHit[];

  // — Lifecycle —
  close(): void;
  /** Diagnostic — where the backing data lives. */
  dataLocation(): string;
}
