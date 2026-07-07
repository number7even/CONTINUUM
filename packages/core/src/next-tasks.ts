/**
 * next-tasks — the PM brain. Pure DAG logic over the Todo pipeline.
 *
 * Given the todos (each with a `blockedBy[]` dependency list), compute the
 * ACTIONABLE set: tasks that are not done and not blocked (every blockedBy is
 * done), ordered by DOWNSTREAM LEVERAGE — completing them unblocks the most
 * other work. Each task carries its derived 6-state and its dossier refs.
 *
 * No shell execution here (that's `continuum verify`) — this is the plan-layer
 * reasoning: "based on the DAG, what is next?" Pure + deterministic + testable.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { Todo } from './types.js';

/** Derived task state (no verifyCommand execution — that resolves DONE/FAILED). */
export type NextTaskState = 'READY' | 'RUNNING' | 'BLOCKED' | 'DONE';

export interface RankedTask {
  id: string;
  title: string;
  status: Todo['status'];
  /** Derived from status + the DAG. READY = unblocked & open; RUNNING = in_progress. */
  state: NextTaskState;
  /** The proof gate — a passing run of this dissolves the task (verify-then-dissolve). */
  verifyCommand?: string;
  hasVerify: boolean;
  /** Observation IDs = this task's dossier (context). */
  refs: string[];
  blockedBy: string[];
  /** The subset of blockedBy that is not yet done (empty ⇒ unblocked). */
  blockedByOpen: string[];
  /** Transitive dependents — tasks that (eventually) wait on this one. */
  downstream: string[];
  /** downstream.length — completing this task unblocks this many tasks. */
  leverage: number;
}

export interface NextTasksResult {
  /** Unblocked, not-done tasks, ordered by leverage desc then age asc. Do these next. */
  actionable: RankedTask[];
  /** Not-done tasks still waiting on upstream, ordered by leverage desc. */
  blocked: RankedTask[];
  done: number;
  total: number;
}

/** Compute the actionable set from the todo dependency DAG. */
export function computeNextTasks(todos: Todo[]): NextTasksResult {
  const byId = new Map(todos.map(t => [t.id, t]));
  const isDone = (id: string): boolean => byId.get(id)?.status === 'done';

  // Reverse edges: for each task, the tasks that list it in blockedBy (its dependents).
  const dependents = new Map<string, Set<string>>();
  for (const t of todos) {
    for (const dep of t.blockedBy ?? []) {
      if (!dependents.has(dep)) dependents.set(dep, new Set());
      dependents.get(dep)!.add(t.id);
    }
  }
  // Transitive dependents via BFS (cycle-safe via the seen set).
  const transitiveDependents = (id: string): string[] => {
    const seen = new Set<string>();
    const queue = [...(dependents.get(id) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const nx of dependents.get(cur) ?? []) if (!seen.has(nx)) queue.push(nx);
    }
    return [...seen];
  };

  const rank = (t: Todo): RankedTask => {
    const blockedByOpen = (t.blockedBy ?? []).filter(id => !isDone(id));
    const downstream = transitiveDependents(t.id);
    let state: NextTaskState;
    if (t.status === 'done') state = 'DONE';
    else if (t.status === 'blocked' || blockedByOpen.length > 0) state = 'BLOCKED';
    else if (t.status === 'in_progress') state = 'RUNNING';
    else state = 'READY';
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      state,
      verifyCommand: t.verifyCommand,
      hasVerify: !!t.verifyCommand?.trim(),
      refs: t.refs ?? [],
      blockedBy: t.blockedBy ?? [],
      blockedByOpen,
      downstream,
      leverage: downstream.length,
    };
  };

  const ranked = todos.map(rank);
  const ageAsc = (a: RankedTask, b: RankedTask): number =>
    (byId.get(a.id)?.createdAt ?? '').localeCompare(byId.get(b.id)?.createdAt ?? '');
  const byLeverage = (a: RankedTask, b: RankedTask): number => b.leverage - a.leverage || ageAsc(a, b);

  const actionable = ranked.filter(r => r.state === 'READY' || r.state === 'RUNNING').sort(byLeverage);
  const blocked = ranked.filter(r => r.state === 'BLOCKED').sort(byLeverage);

  return {
    actionable,
    blocked,
    done: ranked.filter(r => r.state === 'DONE').length,
    total: todos.length,
  };
}
