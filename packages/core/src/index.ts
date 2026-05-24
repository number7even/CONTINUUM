/**
 * @continuum/core — public API surface.
 *
 * V0 ships:
 *   - Types (Observation, StateSnapshot, Todo, Digest, SearchHit, …)
 *   - StorageBackend interface — domain-level persistence abstraction
 *   - SQLiteStorageBackend — V0 implementation (better-sqlite3 + FTS5)
 *   - openStorage(projectId) factory — single swap point for V0.5 RuVector
 *   - Pure helpers (privacyFilter)
 *
 * Consumers of @continuum/core SHOULD NOT touch better-sqlite3 directly —
 * always go through openStorage()/StorageBackend so the V0.5 RuVector swap
 * is a single-line change at the factory.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */

// — Domain types
export type {
  Source,
  SourceType,
  Observation,
  StateSnapshot,
  StateEntry,
  Todo,
  Digest,
  SearchHit,
  AgentHandoffMetadata,
} from './types.js';

// — Storage abstraction (the V0 → V0.5 stable interface)
export type {
  StorageBackend,
  CheckpointInput,
  CreateTodoInput,
  ListTodosOptions,
  UpdateTodoInput,
  InsertObservationsResult,
} from './storage.js';

export { SQLiteStorageBackend } from './storage-sqlite.js';
export { HybridStorageBackend } from './storage-hybrid.js';
export { openStorage } from './factory.js';

// Embedder — exposed so adapters / scripts can pre-compute embeddings
// outside the storage backend if they need to (V0.5 stub primitive).
export { embed, embeddingDimensions } from './embedder.js';

// — Filesystem layout helpers (used by adapters/CLI for diagnostics)
export { dbPathForProject, continuumDataRoot } from './db.js';

// — Pure helpers (storage-agnostic)
export { privacyFilter, scrubMetadataDeep, type PrivacyResult, type MetadataScrubResult } from './observation.js';

// — Agent handoff primitive (V0-compatible RecursiveMAS intent capture, Issue #3)
export { createAgentHandoffObservation } from './observation.js';

// — STATE.md parser (V0 polish — feeds `continuum init` first-checkpoint)
export {
  parseStateMd,
  parseStateMdToCheckpoint,
  type ParseStateMdResult,
  type ParseStateMdToCheckpointResult,
} from './state-md.js';
