/**
 * GET /api/timeline — the session history feed.
 *
 * Pulls observations in chronological order (continuum_timeline, anchored at now
 * with a wide window) and groups them Day → Session — a "session" is a work burst
 * bounded by an idle gap. Each item is tagged by kind (commit / doc / code /
 * concept / memory) so the UI can show "what we did that sitting": which commits,
 * which docs, the knowledge created, all interlinked by refs[].
 *
 * The receipt for "the agent says we did X" — history you can open and interrogate.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { cookies } from 'next/headers';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { resolveProject } from '@/lib/project';

export const runtime = 'nodejs';
export const maxDuration = 60;

export type ItemKind = 'commit' | 'doc' | 'code' | 'concept' | 'memory';
interface Obs { id: string; sourceId?: string; type?: string; content?: string; timestamp?: string; refs?: string[] }
export interface TimelineItem { id: string; kind: ItemKind; title: string; ts: string; refs: string[]; checkpoint: boolean }
export interface Session { start: string; end: string; items: TimelineItem[]; counts: Record<ItemKind, number>; checkpoints: number }
export interface Day { date: string; sessions: Session[]; total: number }

// A checkpoint = a verified milestone (record_checkpoint stamp / "SPRINT CLOSED" /
// reproducible-via marker). These form the auditable chain of truth.
function isCheckpoint(o: Obs): boolean {
  const first = (o.content ?? '').split('\n')[0] ?? ''; // subject only — avoid body false-positives
  return /\bcheckpoint\b|\bstamp\s+[0-9a-f]{6,}|verify[-\s]?green|SPRINT[-\s]?W?\d+\s+CLOSED/i.test(first);
}

const SESSION_GAP_MS = 90 * 60 * 1000; // >90 min idle → a new session

async function resolveToken(): Promise<string | null> {
  try {
    const c = (await cookies()).get('continuum_tenant_token')?.value;
    if (c) return decodeURIComponent(c);
  } catch { /* noop */ }
  return process.env.CONTINUUM_HTTP_TOKEN ?? null;
}

function parseToolText<T>(res: unknown, fallback: T): T {
  const content = (res as { content?: Array<{ type: string; text?: string }> })?.content ?? [];
  const text = content.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

function kindOf(o: Obs): ItemKind {
  const s = (o.sourceId ?? '').toLowerCase();
  const t = (o.type ?? '').toLowerCase();
  if (s.startsWith('git:') || t === 'commit') return 'commit';
  if (s.startsWith('codegraph:') || ['function', 'method', 'class', 'interface', 'component'].includes(t)) return 'code';
  if (t === 'doc' || s.includes('docs') || t === 'markdown') return 'doc';
  if (t === 'concept') return 'concept';
  return 'memory';
}

function titleOf(o: Obs): string {
  const first = (o.content ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? o.id;
  return first.replace(/^<!--\s*/, '').replace(/\s*-->$/, '').slice(0, 100);
}

export async function GET(): Promise<Response> {
  let mcp: McpClient | null = null;
  try {
    const url = process.env.CONTINUUM_HTTP_URL ?? 'http://localhost:7878/sse';
    const token = await resolveToken();
    if (!token) return Response.json({ error: 'login', days: [] }, { status: 200 });
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Continuum-Project': await resolveProject('continuum'),
    };
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
      eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
    });
    mcp = new McpClient({ name: 'continuum-timeline', version: '0.0.1' }, { capabilities: {} });
    await mcp.connect(transport);

    // Anchor at now, look back a long way, take the most recent 200 events.
    const res = await mcp.callTool({
      name: 'continuum_timeline',
      arguments: { at: new Date().toISOString(), beforeHours: 24 * 365 * 3, afterHours: 0, limit: 200 },
    }).catch(() => null);

    const parsed = parseToolText<{ observations?: Obs[]; hits?: Obs[]; results?: Obs[] }>(res, {});
    const obs = (parsed.observations ?? parsed.hits ?? parsed.results ?? []).filter(o => o?.timestamp);

    // Layer-2 timeline is compact (no content). Batch-fetch content for real titles
    // (commit subjects, doc headings) — bounded to the visible ~200.
    const ids = obs.map(o => o.id).filter(Boolean);
    const byId = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 50) { // get_observations caps at 50 per call
      const chunk = ids.slice(i, i + 50);
      const full = await mcp.callTool({ name: 'continuum_get_observations', arguments: { ids: chunk } }).catch(() => null);
      for (const o of parseToolText<{ observations?: Obs[] }>(full, {}).observations ?? []) byId.set(o.id, o.content ?? '');
    }
    for (const o of obs) { const c = byId.get(o.id); if (c) o.content = c; }
    await mcp.close().catch(() => {});

    // newest first overall; within grouping we order by time
    obs.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));

    // group by day
    const byDay = new Map<string, Obs[]>();
    for (const o of obs) {
      const date = (o.timestamp ?? '').slice(0, 10);
      if (!byDay.has(date)) byDay.set(date, []);
      byDay.get(date)!.push(o);
    }

    const days: Day[] = [];
    for (const [date, dayObs] of [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      // sessions: cluster by idle gap (walk oldest→newest)
      const asc = [...dayObs].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
      const sessions: Session[] = [];
      let cur: Obs[] = [];
      let last = 0;
      const flush = () => {
        if (!cur.length) return;
        const items: TimelineItem[] = cur.map(o => ({ id: o.id, kind: kindOf(o), title: titleOf(o), ts: o.timestamp!, refs: o.refs ?? [], checkpoint: isCheckpoint(o) }));
        const counts = { commit: 0, doc: 0, code: 0, concept: 0, memory: 0 } as Record<ItemKind, number>;
        for (const it of items) counts[it.kind]++;
        const checkpoints = items.filter(it => it.checkpoint).length;
        sessions.push({ start: cur[0]!.timestamp!, end: cur[cur.length - 1]!.timestamp!, items, counts, checkpoints });
        cur = [];
      };
      for (const o of asc) {
        const ts = new Date(o.timestamp!).getTime();
        if (cur.length && ts - last > SESSION_GAP_MS) flush();
        cur.push(o);
        last = ts;
      }
      flush();
      sessions.reverse(); // newest session first within the day
      days.push({ date, sessions, total: dayObs.length });
    }

    return Response.json({ days, count: obs.length });
  } catch (err) {
    await mcp?.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg, days: [] }, { status: 500 });
  }
}
