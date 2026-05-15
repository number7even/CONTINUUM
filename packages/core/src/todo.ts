/**
 * Continuum Todo Pipeline (V0 implementation).
 *
 * Tracks open commitments through the lifecycle:
 *   open → in_progress → done | blocked
 *
 * Schema lives in db.ts (todos table). V0.5+ may add CRDT-backed
 * collaborative todo state — see ARCHITECTURE.md §10b.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Todo } from './types.js';

type TodoRow = {
  id: string;
  title: string;
  status: Todo['status'];
  refs: string;
  created_at: string;
  completed_at: string | null;
  verify_command: string | null;
  blocked_by: string;
};

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    refs: JSON.parse(row.refs) as string[],
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    verifyCommand: row.verify_command ?? undefined,
    blockedBy: JSON.parse(row.blocked_by) as string[],
  };
}

export interface CreateTodoInput {
  title: string;
  refs?: string[];
  verifyCommand?: string;
  blockedBy?: string[];
  /** Initial status. Defaults to 'open'. */
  status?: Todo['status'];
}

/** Insert a new todo. Returns the persisted row. */
export function createTodo(db: Database.Database, input: CreateTodoInput): Todo {
  if (!input.title?.trim()) {
    throw new Error('title is required');
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const status: Todo['status'] = input.status ?? 'open';
  const refs = input.refs ?? [];
  const blockedBy = input.blockedBy ?? [];

  db.prepare(`
    INSERT INTO todos (id, title, status, refs, created_at, completed_at, verify_command, blocked_by)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    input.title,
    status,
    JSON.stringify(refs),
    createdAt,
    input.verifyCommand ?? null,
    JSON.stringify(blockedBy),
  );

  return {
    id,
    title: input.title,
    status,
    refs,
    createdAt,
    verifyCommand: input.verifyCommand,
    blockedBy,
  };
}

export interface ListTodosOptions {
  /** Filter by status. Omit to return all. */
  status?: Todo['status'];
  /** Max rows. Default 100. */
  limit?: number;
}

/**
 * List todos, optionally filtered by status, newest first.
 * Default surfaces all statuses to keep the V0 API simple — callers
 * pass status: 'open' for the live pipeline view.
 */
export function listTodos(db: Database.Database, opts: ListTodosOptions = {}): Todo[] {
  const limit = opts.limit ?? 100;
  const rows = opts.status
    ? db.prepare(`
        SELECT id, title, status, refs, created_at, completed_at, verify_command, blocked_by
        FROM todos
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(opts.status, limit) as TodoRow[]
    : db.prepare(`
        SELECT id, title, status, refs, created_at, completed_at, verify_command, blocked_by
        FROM todos
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as TodoRow[];

  return rows.map(rowToTodo);
}

export function getTodo(db: Database.Database, id: string): Todo | null {
  const row = db.prepare(`
    SELECT id, title, status, refs, created_at, completed_at, verify_command, blocked_by
    FROM todos
    WHERE id = ?
  `).get(id) as TodoRow | undefined;

  return row ? rowToTodo(row) : null;
}

export interface UpdateTodoInput {
  id: string;
  status?: Todo['status'];
  title?: string;
  verifyCommand?: string | null;
  blockedBy?: string[];
  refs?: string[];
}

/**
 * Update mutable fields on a todo. Transitioning status → 'done' sets
 * completed_at; any other transition clears it.
 */
export function updateTodo(db: Database.Database, input: UpdateTodoInput): Todo {
  const existing = getTodo(db, input.id);
  if (!existing) {
    throw new Error(`No todo with id ${input.id}`);
  }

  const next: Todo = {
    ...existing,
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    refs: input.refs ?? existing.refs,
    blockedBy: input.blockedBy ?? existing.blockedBy,
    verifyCommand:
      input.verifyCommand === null
        ? undefined
        : input.verifyCommand ?? existing.verifyCommand,
  };

  const completedAt =
    next.status === 'done'
      ? existing.completedAt ?? new Date().toISOString()
      : null;
  next.completedAt = completedAt ?? undefined;

  db.prepare(`
    UPDATE todos
       SET title = ?, status = ?, refs = ?, completed_at = ?, verify_command = ?, blocked_by = ?
     WHERE id = ?
  `).run(
    next.title,
    next.status,
    JSON.stringify(next.refs),
    completedAt,
    next.verifyCommand ?? null,
    JSON.stringify(next.blockedBy),
    next.id,
  );

  return next;
}
