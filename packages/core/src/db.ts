/**
 * Continuum SQLite storage layer (V0 implementation).
 *
 * Schema is the V0 ground truth. V0.5+ may migrate to RuVector behind
 * a StorageBackend interface — see ARCHITECTURE.md §10b.
 *
 * SQLite + FTS5 covers V0 needs:
 *   - Relational queries on Observation refs[]
 *   - Full-text keyword search via FTS5 virtual table
 *   - State snapshot history queries by timestamp
 *
 * Chroma (semantic search) is V0.5+ — V0 ships keyword-only.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Default Continuum data root. Per-project subdirectories live under this. */
export function continuumDataRoot(): string {
  return process.env.CONTINUUM_DATA_DIR ?? join(homedir(), '.continuum');
}

/** Get the SQLite path for a specific project. */
export function dbPathForProject(projectId: string): string {
  return join(continuumDataRoot(), projectId, 'continuum.db');
}

/**
 * Open (or create) a Continuum SQLite database for the given project.
 * Runs migrations on first open.
 */
export function openDb(projectId: string): Database.Database {
  const dbPath = dbPathForProject(projectId);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * Apply schema migrations. Idempotent — safe to call on every open.
 *
 * V0 schema:
 *   sources           — configured adapter instances
 *   observations      — canonical event records
 *   observations_fts  — FTS5 virtual table on content
 *   state_snapshots   — append-only point-in-time state
 *   todos             — open commitments
 *   digests           — composed narratives
 *   schema_version    — migration tracking
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const current = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  const currentVersion = current?.v ?? 0;

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE sources (
        id              TEXT PRIMARY KEY,
        type            TEXT NOT NULL CHECK (type IN ('docs','mem','sona','git','export')),
        config          TEXT,
        last_synced_at  TEXT
      );

      CREATE TABLE observations (
        id          TEXT PRIMARY KEY,
        source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        type        TEXT NOT NULL,
        content     TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        refs        TEXT NOT NULL DEFAULT '[]',
        metadata    TEXT
      );
      CREATE INDEX observations_timestamp_idx ON observations(timestamp);
      CREATE INDEX observations_source_id_idx ON observations(source_id);
      CREATE INDEX observations_type_idx ON observations(type);

      CREATE VIRTUAL TABLE observations_fts USING fts5(
        content,
        content='observations',
        content_rowid='rowid'
      );

      CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, content) VALUES (new.rowid, new.content);
      END;
      CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, content)
          VALUES('delete', old.rowid, old.content);
      END;
      CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, content)
          VALUES('delete', old.rowid, old.content);
        INSERT INTO observations_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TABLE state_snapshots (
        id          TEXT PRIMARY KEY,
        timestamp   TEXT NOT NULL,
        active      TEXT NOT NULL DEFAULT '[]',
        dormant     TEXT NOT NULL DEFAULT '[]',
        broken      TEXT NOT NULL DEFAULT '[]',
        hash        TEXT NOT NULL,
        reason      TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX state_snapshots_timestamp_idx ON state_snapshots(timestamp);

      CREATE TABLE todos (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN ('open','in_progress','blocked','done')),
        refs            TEXT NOT NULL DEFAULT '[]',
        created_at      TEXT NOT NULL,
        completed_at    TEXT,
        verify_command  TEXT,
        blocked_by      TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX todos_status_idx ON todos(status);

      CREATE TABLE digests (
        id            TEXT PRIMARY KEY,
        window_start  TEXT NOT NULL,
        window_end    TEXT NOT NULL,
        narrative     TEXT NOT NULL,
        commits       TEXT NOT NULL DEFAULT '[]',
        state_diff    TEXT NOT NULL DEFAULT '{}',
        todo_delta    TEXT NOT NULL DEFAULT '{}',
        created_at    TEXT NOT NULL
      );
      CREATE INDEX digests_window_end_idx ON digests(window_end);

      INSERT INTO schema_version (version, applied_at) VALUES (1, datetime('now'));
    `);
  }
}
