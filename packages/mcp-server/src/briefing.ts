/**
 * Briefing composer + template digest — helpers shared by the
 * continuum_get_digest tool, the continuum://digest/latest resource, and the
 * continuum://session/briefing resource.
 *
 * Lives at the top of mcp-server/src/ (rather than inside resources/ or
 * tools/) because it is used from both surfaces — placing it under either
 * would create a backwards import.
 *
 * Behaviour is byte-identical to the pre-split server.ts implementation;
 * extraction is purely structural (W22-5 / Issue #12).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { StateEntry, StorageBackend } from '@number7even/continuum-core';

/**
 * Resolve the briefing window length in hours.
 *
 * Issue #15 / W23-4. Default 24h preserves prior behaviour; operators
 * pass a different number via the CONTINUUM_BRIEFING_WINDOW_HOURS env
 * var when they want a tighter (e.g. 4h "just back from lunch") or
 * wider (168 = one week "back from holiday") briefing. Capped at 168
 * to prevent absurd values that would blow up the observation scan.
 *
 * Bad values (non-numeric, 0, negative) silently fall back to 24 — a
 * malformed env var should not break the briefing.
 */
function briefingWindowHours(): number {
  const raw = process.env.CONTINUUM_BRIEFING_WINDOW_HOURS;
  if (!raw) return 24;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(n, 168);
}

/**
 * Format an ISO timestamp as "YYYY-MM-DD HH:MM UTC" for human-scannable
 * briefing freshness. Spec from SPRINT-2026-W22 §W23-4.
 */
function formatBriefingHeaderTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16) + ' UTC';
}

// ── Layer-0 Session Briefing ────────────────────────────────────────────────
//
// Composes current state + open todos + recent activity into a single markdown
// document the AI reads at session start. Token cost: ~2–5 KB depending on
// project size; replaces 3–5 tool calls the AI would otherwise make to warm up.

export function composeBriefing(storage: StorageBackend, projectId: string): string {
  const now = new Date().toISOString();
  const windowHours = briefingWindowHours();
  const snapshot = storage.getStateAt();
  const openTodos = storage.listTodos({ status: 'open' });
  const inProgressTodos = storage.listTodos({ status: 'in_progress' });
  const allSnapshots = storage.listSnapshots(10);
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const recent = allSnapshots.filter(s => s.timestamp >= cutoff);

  // Observation count in window — surfaces raw event-log activity
  // alongside the checkpoint count. listObservationsAround caps at
  // limit=200; if we hit the cap we suffix "+" so the operator sees
  // "this window is saturated, narrow it or look at the timeline tool".
  const recentObs = storage.listObservationsAround({
    at: now,
    beforeHours: windowHours,
    afterHours: 0,
    limit: 200,
  });
  const obsCount = recentObs.length >= 200 ? '200+' : String(recentObs.length);

  const lines: string[] = [
    '# Continuum Session Briefing',
    '',
    // Issue #14 + W23-4 — freshness header. Single line, data-dense,
    // human-scannable. Replaces the prior italic _Generated_ + _Project_
    // pair so the most important signal (when was this rendered, how
    // much happened in the window) is the first thing the AI reads.
    `## Briefing as of ${formatBriefingHeaderTime(now)} · ${obsCount} observation${obsCount === '1' ? '' : 's'} in last ${windowHours}h · project \`${projectId}\``,
    '',
    '## Current State',
    '',
  ];

  if (snapshot) {
    lines.push(
      `**Snapshot:** \`${snapshot.id.slice(0, 8)}\`  `,
      `**Captured:** ${snapshot.timestamp}  `,
      `**Reason:** ${snapshot.reason}`,
      '',
      `### Active in production (${snapshot.active.length})`,
      '',
    );
    if (snapshot.active.length === 0) {
      lines.push('_(none recorded)_', '');
    } else {
      for (const e of snapshot.active) {
        lines.push(`- **${e.name}** — \`${e.where}\` — verifies via \`${e.verifyCommand}\``);
      }
      lines.push('');
    }

    lines.push(`### Known broken (${snapshot.broken.length})`, '');
    if (snapshot.broken.length === 0) {
      lines.push('_(none)_', '');
    } else {
      for (const e of snapshot.broken) {
        lines.push(`- **${e.name}** — \`${e.where}\` — ${e.description ?? 'no description'}`);
      }
      lines.push('');
    }
  } else {
    lines.push(
      '_No checkpoints recorded yet. Use `continuum_record_checkpoint` to capture the first state._',
      '',
    );
  }

  lines.push(
    '## Open Todos',
    '',
    `_${openTodos.length} open · ${inProgressTodos.length} in progress_`,
    '',
  );
  const allOpen = [...openTodos, ...inProgressTodos];
  if (allOpen.length === 0) {
    lines.push('_(pipeline empty)_', '');
  } else {
    for (const t of allOpen.slice(0, 20)) {
      const verify = t.verifyCommand ? ` — verifies: \`${t.verifyCommand}\`` : '';
      lines.push(`- [${t.status}] \`${t.id.slice(0, 8)}\` ${t.title}${verify}`);
    }
    if (allOpen.length > 20) {
      lines.push(`- _… ${allOpen.length - 20} more (use \`continuum_get_todos\`)_`);
    }
    lines.push('');
  }

  lines.push(
    `## Recent Activity (last ${windowHours}h)`,
    '',
    `_${recent.length} checkpoint${recent.length === 1 ? '' : 's'} in window_`,
    '',
  );
  if (recent.length === 0) {
    lines.push('_(no recent checkpoints)_', '');
  } else {
    for (const s of recent.slice(0, 10)) {
      lines.push(`- \`${s.timestamp.slice(0, 19)}Z\` — ${s.reason}`);
    }
    lines.push('');
  }

  lines.push(
    '## How to use this briefing',
    '',
    '1. If the answer is here, proceed directly — no further tool calls needed.',
    '2. Otherwise `continuum_search_docs` for Layer-1 hits (compact IDs + titles).',
    '3. Use `continuum_get_state` for historical state queries (ISO timestamp).',
    '4. Only fetch full content for narrowed-down IDs (Layer-3 — not yet shipped; coming V0.5).',
    '5. New commitments → `continuum_create_todo` with a concrete `verifyCommand`.',
    '6. Asserting facts → cite Observation IDs (see `continuum.cite` Prompt).',
    '',
  );

  return lines.join('\n');
}

// ── Template digest (V0 — replaced by ruvllm/ruv-FANN in V0.5) ──────────────

export function templateDigest(
  snapshots: Array<{
    timestamp: string;
    reason: string;
    active: StateEntry[];
    broken: StateEntry[];
  }>,
  window: string,
): string {
  if (snapshots.length === 0) {
    return `No state snapshots in window "${window}". Use continuum_record_checkpoint to capture state.`;
  }
  const latest = snapshots[0]!;
  const lines = [
    `Continuum digest (${window}, ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}):`,
    '',
    `Latest checkpoint: ${latest.timestamp} — ${latest.reason}`,
    `Active in production: ${latest.active.length} entries`,
    `Known broken: ${latest.broken.length} entries`,
    '',
  ];
  if (snapshots.length > 1) {
    lines.push('Checkpoint history (newest → oldest):');
    for (const s of snapshots) {
      lines.push(`  - ${s.timestamp.slice(0, 19)}Z — ${s.reason}`);
    }
  }
  return lines.join('\n');
}
