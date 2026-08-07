/**
 * The BALL — the Board's Automated Lifecycle Loop (Ticket→Sprint auto-intake).
 *
 * Captured events → deduped → parked in the Referee Queue → auto-dissolved on their own
 * verifyCommand. The intercept protocol, mechanically (not as prose):
 *   1. gather significant events (command failures · partner blockers)
 *   2. DEDUP by signature — the same failing command is ONE issue, never N tickets. The
 *      recurrence folds into the existing ticket (evidence appended, count bumped). This is
 *      the cure for the "silently spam the board with duplicates" failure mode.
 *   3. ROUTE by domain — engineering (operator can fix → verifyCommand-gated) vs
 *      partner-blocker (parked 'blocked', ungated; can't code your way out).
 *   4. PARK in the Referee Queue (an [auto]-tagged todo), never the frozen sprint (P9).
 *   5. AUTO-DISSOLVE — when the ticket's verifyCommand exits 0 (run by the environment, the
 *      neutral referee), the ticket resolves itself. Verify-then-dissolve on auto-tickets.
 *
 * Dedup is signature-based (deterministic — the failing command IS the key). Semantic dedup
 * (RuVector, for cross-phrasing near-duplicates) is the documented layer on top; the
 * signature pass is the reliable core the proof-gate exercises.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { Observation, Todo } from './types.js';
import type { StorageBackend } from './storage.js';

/** Referee-Queue marker — distinguishes auto-tickets from human-authored ones. */
export const AUTO = '[auto]';

export type Domain = 'engineering' | 'partner-blocker';

export interface IntakeEvent {
  /** The motivating Observation id (or a synthetic id for non-observation events). */
  id: string;
  kind: 'command-failure' | 'partner-blocker';
  /** The failed command — both the dedup signature AND the fix proof (engineering). */
  cmd?: string;
  exitCode?: number;
  /** A partner-blocker label, e.g. 'XENOS lead route'. */
  label?: string;
}

export interface IntakeResult {
  scanned: number;
  created: Array<{ id: string; title: string; domain: Domain; verifyCommand?: string }>;
  /** Events folded into an existing ticket (deduped, not spawned). */
  deduped: number;
}

/** Stable dedup signature: the same failing command / the same blocker = the same issue. */
function sig(ev: IntakeEvent): string {
  return ev.kind === 'partner-blocker'
    ? `partner:${(ev.label ?? '').trim().toLowerCase()}`
    : `cmd:${(ev.cmd ?? '').trim()}`;
}

/** Recover a partner ticket's signature from its title (engineering uses verifyCommand). */
function partnerSigFromTitle(title: string): string | null {
  const m = title.match(/:partner-blocker (.+?) ×\d+\s*$/);
  return m && m[1] ? `partner:${m[1].trim().toLowerCase()}` : null;
}

function bumpCount(title: string, n: number): string {
  return /×\d+\s*$/.test(title) ? title.replace(/×\d+\s*$/, `×${n}`) : `${title} ×${n}`;
}

/** Extract significant events (command failures) from recent Observations. */
export function eventsFromObservations(obs: Observation[]): IntakeEvent[] {
  const out: IntakeEvent[] = [];
  for (const o of obs) {
    if (o.type !== 'command') continue;
    const m = (o.metadata ?? {}) as { exitCode?: number; status?: string; cmd?: string };
    if (m.status === 'fail' || (typeof m.exitCode === 'number' && m.exitCode !== 0)) {
      out.push({ id: o.id, kind: 'command-failure', cmd: m.cmd, exitCode: m.exitCode });
    }
  }
  return out;
}

/** Run the intake: dedup → route → park. Returns exactly what it did (loud). */
export function runIntake(
  storage: Pick<StorageBackend, 'listTodos' | 'createTodo' | 'updateTodo'>,
  events: IntakeEvent[],
): IntakeResult {
  const todos = storage.listTodos();
  const created: IntakeResult['created'] = [];
  let deduped = 0;

  // Existing auto-tickets, indexed by signature.
  const bySig = new Map<string, Todo>();
  for (const t of todos) {
    if (!t.title.startsWith(AUTO)) continue;
    const s = t.verifyCommand ? `cmd:${t.verifyCommand}` : partnerSigFromTitle(t.title);
    if (s) bySig.set(s, t);
  }
  // Any event already referenced by a ticket is already captured.
  const ticketed = new Set(todos.flatMap((t) => t.refs ?? []));

  for (const ev of events) {
    if (ticketed.has(ev.id)) { deduped++; continue; }
    const s = sig(ev);
    const existing = bySig.get(s);

    if (existing) {
      // DEDUP: fold the recurrence into the existing ticket — never a duplicate.
      const refs = [...(existing.refs ?? []), ev.id];
      const updated = storage.updateTodo({ id: existing.id, refs, title: bumpCount(existing.title, refs.length) });
      bySig.set(s, updated); // keep the map current so the NEXT recurrence appends to fresh refs (not stale)
      ticketed.add(ev.id);
      deduped++;
      continue;
    }

    // CREATE: route by domain, park in the Referee Queue.
    const domain: Domain = ev.kind === 'partner-blocker' ? 'partner-blocker' : 'engineering';
    const title = domain === 'engineering'
      ? `${AUTO}:engineering Fix: \`${ev.cmd}\` (exit ${ev.exitCode}) ×1`
      : `${AUTO}:partner-blocker ${ev.label} ×1`;
    const t = storage.createTodo({
      title,
      refs: [ev.id],
      // Engineering auto-dissolves on its own command; partner-blockers are ungated (parked).
      verifyCommand: domain === 'engineering' ? ev.cmd : undefined,
      status: domain === 'partner-blocker' ? 'blocked' : 'open',
    });
    created.push({ id: t.id, title: t.title, domain, verifyCommand: t.verifyCommand });
    bySig.set(s, t);
    ticketed.add(ev.id);
  }

  return { scanned: events.length, created, deduped };
}

export interface DissolveResult { checked: number; dissolved: string[] }

/**
 * Auto-dissolve: for every OPEN engineering auto-ticket, the environment (the neutral
 * referee) runs its verifyCommand; exit 0 → the ticket resolves itself. `runVerify` is
 * injected so core stays pure and the *environment* runs the proof — never the agent.
 */
export function runAutoDissolve(
  storage: Pick<StorageBackend, 'listTodos' | 'updateTodo'>,
  runVerify: (cmd: string) => number,
): DissolveResult {
  const dissolved: string[] = [];
  let checked = 0;
  for (const t of storage.listTodos()) {
    if (t.status === 'done' || !t.title.startsWith(AUTO) || !t.verifyCommand) continue;
    checked++;
    if (runVerify(t.verifyCommand) === 0) {
      storage.updateTodo({ id: t.id, status: 'done' });
      dissolved.push(t.id);
    }
  }
  return { checked, dissolved };
}
