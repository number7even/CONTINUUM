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
  upsertObservation as _upsertObservation,
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
  TimelineHit,
  Todo,
} from './types.js';
import type {
  CheckpointInput,
  CreateTodoInput,
  InsertObservationsResult,
  TimelineOptions,
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

  upsertObservation(obs: Omit<Observation, 'id'> & { id: string }): Observation | null {
    return _upsertObservation(this.db, obs);
  }

  insertObservationsBulk(observations: Array<Omit<Observation, 'id'>>): InsertObservationsResult {
    return _insertObservationsBulk(this.db, observations);
  }

  // ── Hard delete (INCIDENT RESPONSE — Issue #10) ───────────────────────────
  //
  // The AFTER DELETE trigger on `observations` (see db.ts:98-101) takes
  // care of cleaning the matching FTS5 row, so this is a single statement.
  // Returns true iff a row matched and was removed.

  deleteObservation(id: string): boolean {
    const info = this.db.prepare('DELETE FROM observations WHERE id = ?').run(id);
    return info.changes > 0;
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

  // ── Timeline (Progressive Disclosure Layer-2) ─────────────────────────────

  listObservationsAround(opts: TimelineOptions): TimelineHit[] {
    // 1. Resolve anchor → ISO timestamp.
    let anchorIso: string;
    if (opts.aroundId) {
      const row = this.db
        .prepare('SELECT timestamp FROM observations WHERE id = ?')
        .get(opts.aroundId) as { timestamp: string } | undefined;
      if (!row) throw new Error(`continuum_timeline: observation not found: ${opts.aroundId}`);
      anchorIso = row.timestamp;
    } else if (opts.at) {
      anchorIso = opts.at;
    } else {
      anchorIso = new Date().toISOString();
    }
    const anchorMs = new Date(anchorIso).getTime();
    if (Number.isNaN(anchorMs)) {
      throw new Error(`continuum_timeline: invalid anchor timestamp: ${anchorIso}`);
    }

    const beforeHours = opts.beforeHours ?? 1;
    const afterHours = opts.afterHours ?? 1;
    const startIso = new Date(anchorMs - beforeHours * 3600 * 1000).toISOString();
    const endIso = new Date(anchorMs + afterHours * 3600 * 1000).toISOString();
    const limit = Math.min(opts.limit ?? 50, 200);

    const rows = this.db.prepare(`
      SELECT id, source_id, type, content, timestamp
      FROM observations
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(startIso, endIso, limit) as Array<{
      id: string;
      source_id: string;
      type: string;
      content: string;
      timestamp: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      source: (r.source_id.split(':')[0] ?? 'export') as SourceType,
      type: r.type,
      timestamp: r.timestamp,
      title: r.content.slice(0, 80).replace(/\s+/g, ' '),
      score: 0, // timeline is not relevance-ranked; ordering is chronological
      hasMore: r.content.length > 2000,
      offsetSec: Math.round((new Date(r.timestamp).getTime() - anchorMs) / 1000),
    }));
  }

  // ── Batch get (Progressive Disclosure Layer-3) ────────────────────────────

  getObservations(ids: string[]): Observation[] {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    // Cap to prevent token blow-up. Extras silently dropped; caller batches.
    const capped = ids.slice(0, 50);
    const placeholders = capped.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT id, source_id, type, content, timestamp, refs, metadata
      FROM observations
      WHERE id IN (${placeholders})
    `).all(...capped) as Array<{
      id: string;
      source_id: string;
      type: string;
      content: string;
      timestamp: string;
      refs: string;
      metadata: string | null;
    }>;
    return rows.map(r => ({
      id: r.id,
      sourceId: r.source_id,
      type: r.type,
      content: r.content,
      timestamp: r.timestamp,
      refs: JSON.parse(r.refs || '[]') as string[],
      metadata: r.metadata
        ? (JSON.parse(r.metadata) as Record<string, unknown>)
        : undefined,
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

// openStorage() factory moved to ./factory.ts as of V0.5 so the hybrid
// backend (which has heavy ruvector + @xenova/transformers deps) can
// be selected via env var without forcing those deps to load when
// sqlite-only operators import @continuum/core.
