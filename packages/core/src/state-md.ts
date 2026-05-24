/**
 * STATE.md parser — string → CheckpointInput.
 *
 * STATE.md is the canonical human-curated activation state for a project
 * (ARCHITECTURE.md §16). Parsing it lets `continuum init` write the first
 * StateSnapshot automatically so a new operator's session briefing has a
 * meaningful baseline from second one.
 *
 * Expected format:
 *
 *   ## ACTIVE / ## DORMANT / ## BROKEN          (H2 — keyword anywhere in heading)
 *   ### Entry Name                              (H3 — heading text becomes entry name)
 *   - **Where** / **File**: <path:line>         (`where`)
 *   - **Verify**: <shell command>               (`verifyCommand`, required)
 *   - **Landed**: <commit-or-date>              (`landedAt`, optional)
 *   - **verified_at**: <ISO timestamp>          (`verifiedAt`, required)
 *   - **Effect** / **Note** / **Activates when** / **Requires**: <…>
 *                                               (rolled into `description`)
 *
 *   ---  thematic break separates sections
 *
 * Tolerance:
 *   - HTML comments stripped (the rules block at the top of STATE.md).
 *   - Triple-backtick fenced code blocks are skipped wholesale.
 *   - Field labels matched case-insensitively, normalised across spaces
 *     / underscores / hyphens.
 *   - Multi-line field values supported (continuation lines until the next
 *     bullet or heading).
 *   - Entries missing required fields (verify / verified_at) are dropped
 *     to `warnings[]` rather than silently degrading the snapshot.
 *
 * This module has NO file-system imports — it's a pure string→struct
 * function so it's trivially testable and reusable from MCP tools.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { StateEntry } from './types.js';
import type { CheckpointInput } from './storage.js';

// ── Public API ────────────────────────────────────────────────────────────────

export interface ParseStateMdResult {
  active: StateEntry[];
  dormant: StateEntry[];
  broken: StateEntry[];
  /** Soft errors — malformed or incomplete entries that were dropped. */
  warnings: string[];
}

export interface ParseStateMdToCheckpointResult {
  input: CheckpointInput;
  warnings: string[];
  totals: { active: number; dormant: number; broken: number };
}

/** Parse a STATE.md document into structured StateEntry lists. */
export function parseStateMd(markdown: string): ParseStateMdResult {
  const result: ParseStateMdResult = { active: [], dormant: [], broken: [], warnings: [] };
  const lines = stripCommentsAndFences(markdown);

  let category: 'active' | 'dormant' | 'broken' | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    // H2 — category boundary. (Require space after ## so ### doesn't match.)
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2 && !line.startsWith('###')) {
      category = classifyCategory(h2[1] ?? '');
      i++;
      continue;
    }

    // H3 — entry. Only consume if we're inside a recognised category.
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3 && category) {
      const name = (h3[1] ?? '').trim();
      const block: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j] ?? '';
        if (/^#{1,3}\s/.test(next) || /^---+\s*$/.test(next)) break;
        block.push(next);
        j++;
      }
      const entry = blockToStateEntry(name, block, result.warnings);
      if (entry) result[category].push(entry);
      i = j;
      continue;
    }

    i++;
  }

  return result;
}

/** Parse STATE.md and shape it into a ready-to-record CheckpointInput. */
export function parseStateMdToCheckpoint(
  markdown: string,
  reason: string,
): ParseStateMdToCheckpointResult {
  const parsed = parseStateMd(markdown);
  return {
    input: {
      reason,
      active: parsed.active,
      dormant: parsed.dormant,
      broken: parsed.broken,
    },
    warnings: parsed.warnings,
    totals: {
      active: parsed.active.length,
      dormant: parsed.dormant.length,
      broken: parsed.broken.length,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip <!-- HTML comments --> and ```fenced code blocks``` before line
 * processing. The rules header at the top of STATE.md is a comment; we
 * don't want its `###` lines (if any) misclassified as entries.
 */
function stripCommentsAndFences(markdown: string): string[] {
  const noComments = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const raw = noComments.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  for (const line of raw) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    out.push(line);
  }
  return out;
}

function classifyCategory(heading: string): 'active' | 'dormant' | 'broken' | null {
  // Match the FIRST word of the heading only. STATE.md format is
  //   ## DORMANT (built but not the active path)
  // and a `/\bactive\b/` match against the whole heading misclassifies
  // DORMANT as ACTIVE because of the parenthetical description.
  const firstWord = (heading.trim().split(/\s+/)[0] ?? '').toLowerCase();
  if (firstWord === 'active') return 'active';
  if (firstWord === 'dormant') return 'dormant';
  if (firstWord === 'broken') return 'broken';
  return null;
}

function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/[_\s-]/g, '');
}

const LABEL_ALIASES: Record<string, 'where' | 'verify' | 'landed' | 'verifiedat'> = {
  where: 'where',
  file: 'where',
  files: 'where',
  verify: 'verify',
  verifycommand: 'verify',
  landed: 'landed',
  landedat: 'landed',
  verifiedat: 'verifiedat',
};

function stripBackticks(s: string): string {
  const trimmed = s.trim();
  const m = /^`([\s\S]*?)`$/.exec(trimmed);
  return (m?.[1] ?? trimmed).trim();
}

interface ParsedBullets {
  fields: Map<'where' | 'verify' | 'landed' | 'verifiedat', string>;
  extras: string[];
}

function parseBullets(lines: string[]): ParsedBullets {
  const fields = new Map<'where' | 'verify' | 'landed' | 'verifiedat', string>();
  const extras: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // - **Label**: value     (also tolerate * bullets and missing bold)
    const m = /^\s*[-*]\s+\*\*([^*]+)\*\*\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const label = m[1] ?? '';
    let value = m[2] ?? '';
    // Continuation lines: indented, or unprefixed paragraphs that aren't
    // a new bullet or heading.
    while (i + 1 < lines.length) {
      const next = lines[i + 1] ?? '';
      if (/^\s*[-*]\s+\*\*/.test(next) || /^#{1,3}\s/.test(next) || /^---+\s*$/.test(next)) {
        break;
      }
      if (next.trim() === '') {
        break;
      }
      value += '\n' + next.trim();
      i++;
    }
    const normalised = normaliseLabel(label);
    const canonical = LABEL_ALIASES[normalised];
    if (canonical) {
      fields.set(canonical, stripBackticks(value));
    } else {
      extras.push(`${label.trim()}: ${value.trim()}`);
    }
  }

  return { fields, extras };
}

function blockToStateEntry(
  name: string,
  blockLines: string[],
  warnings: string[],
): StateEntry | null {
  if (!name) return null;
  const { fields, extras } = parseBullets(blockLines);
  const where = fields.get('where');
  const verify = fields.get('verify');
  const verifiedAt = fields.get('verifiedat');
  const landed = fields.get('landed');

  if (!verify) {
    warnings.push(`entry "${name}" missing Verify — skipped`);
    return null;
  }
  if (!verifiedAt) {
    warnings.push(`entry "${name}" missing verified_at — skipped`);
    return null;
  }
  if (!where) {
    warnings.push(`entry "${name}" missing Where/File — using "(unknown)"`);
  }

  const entry: StateEntry = {
    name,
    where: where ?? '(unknown)',
    verifyCommand: verify,
    verifiedAt,
  };
  if (landed) entry.landedAt = landed;
  if (extras.length > 0) entry.description = extras.join('\n');
  return entry;
}
