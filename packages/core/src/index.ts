/**
 * @continuum/core — public API surface.
 *
 * V0 ships:
 *   - Types (Observation, StateSnapshot, Todo, Digest, SearchHit)
 *   - SQLite storage (better-sqlite3 + FTS5)
 *   - Checkpoint engine (record_checkpoint, getStateAt, listSnapshots)
 *
 * V0.5+ adds: RuVector storage backend behind the same surface, plus
 * GNN-reinforced search, RVF cognitive containers, Delta Behavior CRDTs.
 */
export type {
  Source,
  SourceType,
  Observation,
  StateSnapshot,
  StateEntry,
  Todo,
  Digest,
  SearchHit,
} from './types.js';

export {
  openDb,
  dbPathForProject,
  continuumDataRoot,
} from './db.js';

export {
  recordCheckpoint,
  getStateAt,
  listSnapshots,
  type CheckpointInput,
} from './checkpoint.js';

export {
  upsertSource,
  insertObservation,
  insertObservationsBulk,
  privacyFilter,
  type PrivacyResult,
} from './observation.js';

export {
  createTodo,
  listTodos,
  getTodo,
  updateTodo,
  type CreateTodoInput,
  type ListTodosOptions,
  type UpdateTodoInput,
} from './todo.js';
