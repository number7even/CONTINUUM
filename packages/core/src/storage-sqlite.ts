/**
 * SQLiteStorageBackend — V0 implementation of StorageBackend.
 *
 * Wraps a better-sqlite3 Database with the FTS5-indexed observations table.
 * All domain operations delegate to the existing module-level helpers in
 * checkpoint.ts / observation.ts / todo.ts — those modules are now private
 * implementation details of this backend; consumers of @continuum/core talk
 * to the StorageBackend interface only.
 *
 * V0.5+ adds RuVectorStorageBackend as a drop-in replacement. The factory
 * (openStorage) is the single swap point.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type Database from 'better-sqlite3';
import { openDb, dbPathForProject } from './db.js';
import {
  recordCheckpoint as _recordCheckpoint,
  getStateAt as _getStateAt,
  listSnapshots as _listSnapshots,
} from './checkpoint.js';
import {
  upsertSource as _upsertSource,
  insertObservation as _insertObservation,
  insertObservationsBulk as _insertObservationsBulk,
} from './observation.js';
import {
  createTodo as _createTodo,
  listTodos as _listTodos,
  getTodo as _getTodo,
  updateTodo as _updateTodo,
} from './todo.js';
import type {
  Observation,
  SearchHit,
  SourceType,
  StateSnapshot,
  Todo,
} from './types.js';
import type {
  CheckpointInput,
  CreateTodoInput,
  InsertObservationsResult,
  ListTodosOptions,
  StorageBackend,
  UpdateTodoInput,
} from './storage.js';

export class SQLiteStorageBackend implements StorageBackend {
  private readonly db: Database.Database;
  private readonly projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.db = openDb(projectId);
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────

  recordCheckpoint(input: CheckpointInput): StateSnapshot {
    return _recordCheckpoint(this.db, input);
  }

  getStateAt(at?: string): StateSnapshot | null {
    return _getStateAt(this.db, at);
  }

  listSnapshots(limit?: number): StateSnapshot[] {
    return _listSnapshots(this.db, limit);
  }

  // ── Todos ─────────────────────────────────────────────────────────────────

  createTodo(input: CreateTodoInput): Todo {
    return _createTodo(this.db, input);
  }

  listTodos(opts: ListTodosOptions = {}): Todo[] {
    return _listTodos(this.db, opts);
  }

  getTodo(id: string): Todo | null {
    return _getTodo(this.db, id);
  }

  updateTodo(input: UpdateTodoInput): Todo {
    return _updateTodo(this.db, input);
  }

  // ── Observations ──────────────────────────────────────────────────────────

  upsertSource(id: string, type: SourceType, config?: Record<string, unknown>): void {
    _upsertSource(this.db, id, type, config);
  }

  insertObservation(obs: Omit<Observation, 'id'> & { id?: string }): Observation | null {
    return _insertObservation(this.db, obs);
  }

  insertObservationsBulk(observations: Array<Omit<Observation, 'id'>>): InsertObservationsResult {
    return _insertObservationsBulk(this.db, observations);
  }

  // ── Search (FTS5 — Progressive Disclosure Layer-1) ────────────────────────

  searchObservations(query: string, limit = 20): SearchHit[] {
    if (!query?.trim()) {
      throw new Error('query is required');
    }
    const rows = this.db.prepare(`
      SELECT o.id, o.source_id, o.type, o.content, o.timestamp,
             bm25(observations_fts) AS rank
      FROM observations_fts
      JOIN observations o ON o.rowid = observations_fts.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{
      id: string;
      source_id: string;
      type: string;
      content: string;
      timestamp: string;
      rank: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      source: (r.source_id.split(':')[0] ?? 'export') as SourceType,
      type: r.type,
      timestamp: r.timestamp,
      title: r.content.slice(0, 80).replace(/\s+/g, ' '),
      score: -r.rank, // bm25 returns negative — flip for "higher = better"
      hasMore: r.content.length > 2000,
    }));
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  dataLocation(): string {
    return dbPathForProject(this.projectId);
  }
}

/**
 * Factory — open the configured storage backend for a project.
 *
 * V0 always returns SQLiteStorageBackend. V0.5+ adds a feature flag /
 * env var to return RuVectorStorageBackend instead — same interface,
 * different engine.
 */
export function openStorage(projectId: string): StorageBackend {
  return new SQLiteStorageBackend(projectId);
}
