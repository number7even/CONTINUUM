/**
 * continuum_session_review — the Commentator's deterministic core.
 *
 * Given the recent session exchange (captured Observations) + the project plan
 * (todos) + the verified/accepted state (latest checkpoint), it returns TWO
 * things, grounded in real state — never a model's guess (P4):
 *
 *   1. feedback  — immediate read of what just happened this session.
 *   2. questions — the questions worth asking RIGHT NOW, derived from actual
 *      gaps: unresolved failures, unproven "done", states awaiting the P9 leap,
 *      blocked tickets, the next high-leverage move. Each cites its evidence.
 *
 * This is what makes CONTINUUM active, not passive: it doesn't wait to be asked —
 * it surfaces the questions the state implies, as they relate to the plan/scope.
 * A model (the connected agent / the console) may then narrate or speak these;
 * the tool itself invents nothing.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { computeNextTasks } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

interface SessionReviewArgs { beforeHours?: number; limit?: number }
type Priority = 'high' | 'medium' | 'low';
interface Question { kind: string; priority: Priority; q: string; refs: string[] }

export const sessionReviewTool: ToolDefinition = {
  name: 'continuum_session_review',
  description:
    'Immediate feedback on the current session + the questions worth asking now, ' +
    'grounded in real state (recent exchange + todos + the latest checkpoint) — not a ' +
    'guess. Surfaces unresolved failures, unproven "done", states awaiting the P9 leap, ' +
    'blockers, and the next high-leverage move. Call at any exchange or session end.',
  inputSchema: {
    type: 'object',
    properties: {
      beforeHours: { type: 'number', description: 'How far back the session window reaches (default 24).' },
      limit: { type: 'number', description: 'Max recent events to scan (default 200, max 1000).' },
    },
  },
};

export const handleSessionReview: ToolHandler = async (args, storage) => {
  const input = (args ?? {}) as SessionReviewArgs;
  const beforeHours = Number.isFinite(input.beforeHours) && (input.beforeHours as number) > 0 ? (input.beforeHours as number) : 24;
  const limit = Number.isFinite(input.limit) && (input.limit as number) > 0 ? Math.min(input.limit as number, 1000) : 200;
  const now = new Date().toISOString();

  // 1 — the recent exchange (compact timeline hits).
  const hits = storage.listObservationsAround({ at: now, beforeHours, afterHours: 0, limit });
  const commandHits = hits.filter((h) => h.type === 'command');
  const decisionHits = hits.filter((h) => h.type === 'decision');
  const commitHits = hits.filter((h) => h.type === 'commit');

  // Failures need the full command Observation (metadata isn't on the compact hit).
  const cmdObs = commandHits.length ? storage.getObservations(commandHits.map((h) => h.id)) : [];
  const failures = cmdObs.filter((o) => {
    const m = (o.metadata ?? {}) as { status?: string; exitCode?: number };
    return m.status === 'fail' || (typeof m.exitCode === 'number' && m.exitCode !== 0);
  });

  // 2 — the plan (tickets) + the DAG.
  const todos = storage.listTodos();
  const next = computeNextTasks(todos);
  const doneNoProof = todos.filter((t) => t.status === 'done' && !t.verifyCommand?.trim());

  // 3 — the acceptance state (P9): verified entries not yet human-accepted.
  const snap = storage.getStateAt();
  const unaccepted = (snap?.active ?? []).filter((e) => !e.acceptedBy);

  // ── The questions the STATE implies (deterministic, prioritized) ──────────
  const questions: Question[] = [];

  for (const f of failures.slice(0, 3)) {
    const m = (f.metadata ?? {}) as { cmd?: string; label?: string; exitCode?: number };
    const what = m.cmd ?? m.label ?? f.content.split('\n')[0]?.slice(0, 60) ?? 'a command';
    questions.push({
      kind: 'verification',
      priority: 'high',
      q: `\`${what}\` exited ${m.exitCode ?? 'non-zero'} — is it resolved, or should it become a ticket in this sprint?`,
      refs: [f.id],
    });
  }
  for (const t of doneNoProof.slice(0, 2)) {
    questions.push({
      kind: 'proof',
      priority: 'high',
      q: `Ticket "${t.title}" is marked done without a verifyCommand — add proof or reopen? (unproven "done" never reaches DONE)`,
      refs: [t.id, ...t.refs],
    });
  }
  if (unaccepted.length) {
    questions.push({
      kind: 'acceptance',
      priority: 'high',
      q: `${unaccepted.length} verified state(s) await YOUR acceptance (P9 — the leap is yours): ${unaccepted.slice(0, 3).map((e) => e.name).join(', ')}${unaccepted.length > 3 ? ', …' : ''}. Accept to seal into the Authorship Ledger?`,
      refs: [],
    });
  }
  for (const b of next.blocked.slice(0, 2)) {
    questions.push({
      kind: 'blocked',
      priority: 'medium',
      q: `"${b.title}" is blocked on ${b.blockedByOpen.map((x) => x.slice(0, 8)).join(', ')} — clear the blocker first?`,
      refs: [b.id],
    });
  }
  if (next.actionable[0]) {
    const a = next.actionable[0];
    questions.push({
      kind: 'next',
      priority: 'medium',
      q: `Next by leverage: "${a.title}"${a.leverage > 0 ? ` (unblocks ${a.leverage})` : ''} — start it?`,
      refs: [a.id],
    });
  }
  if (failures.length > 0 && todos.length === 0) {
    questions.push({
      kind: 'scope',
      priority: 'medium',
      q: `${failures.length} failure(s) this session but no tickets exist — capture them into the sprint plan so nothing is lost?`,
      refs: [],
    });
  }

  const rank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  questions.sort((a, b) => rank[a.priority] - rank[b.priority]);

  const feedback = {
    windowHours: beforeHours,
    events: hits.length,
    commands: commandHits.length,
    failures: failures.length,
    commits: commitHits.length,
    decisions: decisionHits.length,
    summary:
      `Last ${beforeHours}h: ${hits.length} event(s) — ${commandHits.length} command(s) ` +
      `(${failures.length} failed), ${commitHits.length} commit(s), ${decisionHits.length} decision(s).`,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            feedback,
            questions,
            grounding: {
              openTickets: todos.filter((t) => t.status !== 'done').length,
              actionable: next.actionable.slice(0, 3).map((a) => a.title),
              awaitingAcceptance: unaccepted.map((e) => e.name),
            },
          },
          null,
          2,
        ),
      },
    ],
  };
};
