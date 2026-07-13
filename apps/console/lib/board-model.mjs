/**
 * board-model.mjs — the pure Board assembly: align commits ↔ tasks ↔ sprints.
 *
 * Takes the ledger's tasks (from continuum_get_todos, each carrying its boardColumn +
 * ledgerVerdict + commitShas) and the git commits (from continuum_timeline), and produces
 * SPRINT LANES: each sprint holds its task cards (6-state), the commits that landed in it,
 * and — the honest part — the ORPHAN commits (work with no task claiming it). This is what
 * ends "the board feels vague": every commit is accounted for, either linked to a task or
 * flagged as unclaimed.
 *
 * Pure + dependency-free (node/browser safe) so the Next route AND the proof-gate share ONE
 * implementation. Sprint detection mirrors Timeline.tsx (W-tag → ISO-week fallback).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */

/** ISO-week number for a YYYY-MM-DD date — the sprint fallback when there's no explicit W-tag. */
export function isoWeekNum(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 86400000 / 7);
}

/** Pull an explicit sprint tag (W27, W27-3, "Sprint W22") from a commit subject, or null. */
export function tagFrom(title) {
  const s = title || '';
  const m = s.match(/\bW(\d{1,2})(?:[-.]\d+)?\b/) || s.match(/\bSprint\s+W?(\d{1,2})\b/i);
  return m ? 'W' + m[1] : null;
}

const short = (sha) => String(sha || '').slice(0, 8);
const day = (ts) => String(ts || '').slice(0, 10);

/**
 * @param {{todos?: any[], commits?: {id:string,title:string,ts:string}[]}} input
 * @returns {{sprints: any[]}}
 */
export function assembleBoard({ todos = [], commits = [] } = {}) {
  // 1. Each commit → a sprint label (explicit W-tag, else ISO week of its date).
  const sprintCommits = new Map();          // label -> commits[]
  for (const c of commits) {
    const d = day(c.ts);
    const label = tagFrom(c.title) || (d ? 'W' + isoWeekNum(d) : 'unscheduled');
    if (!sprintCommits.has(label)) sprintCommits.set(label, []);
    sprintCommits.get(label).push({ ...c, sprint: label });
  }

  // 2. Sprint windows (min/max commit date per label) — used to bucket tasks by createdAt.
  const windows = new Map();                 // label -> {from, to}
  for (const [label, cs] of sprintCommits) {
    const dates = cs.map(c => day(c.ts)).filter(Boolean).sort();
    windows.set(label, { from: dates[0] || '', to: dates[dates.length - 1] || '' });
  }

  // 3. Every commit sha that some task explicitly claims (compared by 8-char prefix).
  const linkedShort = new Set();
  for (const t of todos) for (const sha of t.commitShas || []) linkedShort.add(short(sha));

  // 4. Assign each task to a sprint: the window containing its createdAt, else ISO week.
  const taskSprint = (t) => {
    const d = day(t.createdAt);
    if (d) for (const [label, w] of windows) if (w.from && d >= w.from && d <= w.to) return label;
    return d ? 'W' + isoWeekNum(d) : 'unscheduled';
  };

  // 5. Group tasks into sprints; ensure sprints with commits but no tasks still appear.
  const lanes = new Map();                    // label -> { cards }
  for (const t of todos) {
    const label = taskSprint(t);
    if (!lanes.has(label)) lanes.set(label, { cards: [] });
    lanes.get(label).cards.push(t);
  }
  for (const label of sprintCommits.keys()) if (!lanes.has(label)) lanes.set(label, { cards: [] });

  // 6. Per sprint: link commits, surface orphans (unclaimed work).
  const out = [];
  for (const [label, lane] of lanes) {
    const cs = sprintCommits.get(label) || [];
    const orphans = cs.filter(c => !linkedShort.has(short(c.id)));
    const w = windows.get(label) || { from: '', to: '' };
    out.push({
      label, from: w.from, to: w.to,
      cards: lane.cards,
      commitCount: cs.length,
      linkedCount: cs.length - orphans.length,
      orphanCount: orphans.length,
      orphans: orphans.slice(0, 12).map(c => ({ sha: short(c.id), title: c.title })),
    });
  }
  // Newest sprint first (by window start; tasks-only lanes sort by their newest card).
  const laneKey = (s) => s.from || (s.cards.map(c => day(c.createdAt)).sort().at(-1) ?? '');
  out.sort((a, b) => laneKey(b).localeCompare(laneKey(a)));
  return { sprints: out };
}
