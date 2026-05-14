/**
 * Claude session JSONL parser.
 *
 * Claude Code writes one JSON object per line to
 * ~/.claude/projects/{project-encoded}/{session-uuid}.jsonl
 *
 * Each line is a turn entry. The shape varies across versions but
 * generally includes:
 *   - type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'summary' | ...
 *   - timestamp: ISO-8601
 *   - content: string OR array of content blocks
 *   - message: { role, content } (newer shape)
 *
 * The parser is tolerant — extracts what it can, skips what it can't.
 */
import type { Observation } from '@continuum/core';

export interface ParsedTurn {
  /** ISO-8601 timestamp. Falls back to file mtime if not in the line. */
  timestamp: string;
  /** Continuum Observation type. */
  type: 'user_turn' | 'assistant_turn' | 'tool_call' | 'tool_result' | 'summary' | 'meta';
  /** Extracted text content. */
  content: string;
  /** Tool name (only for tool_call / tool_result). */
  tool?: string;
  /** Original turn UUID if present in the line. */
  turnId?: string;
  /** Parent turn UUID if the line references one. */
  parentTurnId?: string;
}

/**
 * Parse one JSONL line into a ParsedTurn, or null if the line is unparseable
 * or contains no text content worth indexing.
 */
export function parseJsonlLine(line: string, fallbackTimestamp: string): ParsedTurn | null {
  if (!line.trim()) return null;

  let raw: any;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }

  const timestamp = raw.timestamp ?? raw.created_at ?? raw.time ?? fallbackTimestamp;
  const turnId = raw.uuid ?? raw.id ?? raw.message?.id ?? undefined;
  const parentTurnId = raw.parentUuid ?? raw.parent_uuid ?? raw.message?.parent_id ?? undefined;

  // ── Shape A: top-level type field ─────────────────────────────────────
  const topType: string | undefined = raw.type;

  if (topType === 'user' || raw.message?.role === 'user') {
    const content = extractText(raw.message?.content ?? raw.content ?? '');
    if (!content) return null;
    return { timestamp, type: 'user_turn', content, turnId, parentTurnId };
  }

  if (topType === 'assistant' || raw.message?.role === 'assistant') {
    const content = extractText(raw.message?.content ?? raw.content ?? '');
    if (!content) return null;
    return { timestamp, type: 'assistant_turn', content, turnId, parentTurnId };
  }

  if (topType === 'tool_use' || raw.toolUseResult || raw.tool_use) {
    const tool = raw.tool ?? raw.tool_use?.name ?? raw.name ?? 'unknown';
    const content = JSON.stringify(raw.tool_use?.input ?? raw.input ?? raw.args ?? {});
    return { timestamp, type: 'tool_call', content, tool, turnId, parentTurnId };
  }

  if (topType === 'tool_result' || raw.tool_use_id) {
    const tool = raw.tool ?? raw.name ?? 'unknown';
    const content = extractText(raw.content ?? raw.output ?? raw.result ?? '');
    if (!content) return null;
    return { timestamp, type: 'tool_result', content, tool, turnId, parentTurnId };
  }

  if (topType === 'summary' || raw.summary) {
    const content = typeof raw.summary === 'string' ? raw.summary : JSON.stringify(raw.summary);
    if (!content) return null;
    return { timestamp, type: 'summary', content, turnId, parentTurnId };
  }

  // ── Shape B: message-wrapped (newer Claude Code logs) ─────────────────
  if (raw.message?.content) {
    const role = raw.message.role ?? 'unknown';
    const content = extractText(raw.message.content);
    if (!content) return null;
    const type: ParsedTurn['type'] = role === 'user' ? 'user_turn' : role === 'assistant' ? 'assistant_turn' : 'meta';
    return { timestamp, type, content, turnId, parentTurnId };
  }

  // ── Shape C: meta event we don't have a category for ─────────────────
  // Capture the line as 'meta' so the index doesn't lose it. Useful for
  // debugging "what did Claude observe at 14:23 that we missed?"
  return null;
}

/**
 * Extract plain text from Claude's content field. Accepts:
 *   - string (return as-is)
 *   - array of { type: 'text'|'tool_use'|..., text?, content? } blocks
 *   - nested objects with .text or .content
 */
function extractText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (!input) return '';

  if (Array.isArray(input)) {
    return input
      .map(block => {
        if (typeof block === 'string') return block;
        if (block?.type === 'text' && typeof block.text === 'string') return block.text;
        if (block?.type === 'tool_use') return `[tool_use:${block.name ?? 'unknown'}]`;
        if (block?.type === 'tool_result') return typeof block.content === 'string' ? block.content : extractText(block.content);
        if (typeof block?.text === 'string') return block.text;
        if (typeof block?.content === 'string') return block.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof input === 'object' && input !== null) {
    const obj = input as { text?: unknown; content?: unknown };
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
    if (obj.content) return extractText(obj.content);
  }

  return '';
}

/**
 * Convert a ParsedTurn into a Continuum Observation (pre-insert shape).
 */
export function turnToObservation(
  turn: ParsedTurn,
  sourceId: string,
): Omit<Observation, 'id'> {
  const refs = turn.parentTurnId ? [turn.parentTurnId] : [];
  const metadata: Record<string, unknown> = {};
  if (turn.tool) metadata.tool = turn.tool;
  if (turn.turnId) metadata.originalTurnId = turn.turnId;

  return {
    sourceId,
    type: turn.type,
    content: turn.content,
    timestamp: turn.timestamp,
    refs,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}
