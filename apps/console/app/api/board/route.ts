/**
 * GET /api/board — the verifiable Kanban feed.
 *
 * Reads the todo pipeline from the CONTINUUM engine (continuum_get_todos +
 * continuum_next_tasks) and classifies every task into the 6-state model —
 * RUNNING · REVIEW · DONE · SKIPPED · BLOCKED · FAILED — applying the PROOF GATE:
 *
 *   - BLOCKED : DAG says an upstream blockedBy is not done.
 *   - done + NO verifyCommand         → SKIPPED  (unproven "done" never reaches DONE)
 *   - done + verifyCommand green       → DONE
 *   - done + verifyCommand red         → FAILED   (the lie the gate catches)
 *   - in_progress + verify green       → REVIEW   (proof passed, awaiting the human leap — P9)
 *   - otherwise                        → RUNNING
 *
 * "Done is not a button — it's a passing verifyCommand." A task cannot appear in
 * DONE without a green proof.
 *
 * Live verification (actually running each verifyCommand server-side) is opt-in via
 * CONTINUUM_BOARD_LIVE_VERIFY=1 — only meaningful on a machine that holds the repo
 * (self-hosted / dogfood). Without it, the gate holds by classification: DONE
 * requires a verifyCommand; unproven "done" falls to SKIPPED. Verify errs toward
 * FAILED (never a false DONE — P4).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { cookies } from 'next/headers';
import { execSync } from 'node:child_process';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { resolveProject } from '@/lib/project';

export const runtime = 'nodejs';
export const maxDuration = 60;

export type BoardColumn = 'RUNNING' | 'REVIEW' | 'DONE' | 'SKIPPED' | 'BLOCKED' | 'FAILED';

interface Todo {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  refs?: string[];
  verifyCommand?: string;
  blockedBy?: string[];
  createdAt?: string;
}
export interface BoardCard {
  id: string;
  title: string;
  status: Todo['status'];
  column: BoardColumn;
  verifyCommand: string | null;
  hasVerify: boolean;
  refs: string[];
  leverage: number;
  blockedByOpen: string[];
}

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

const liveVerify = process.env.CONTINUUM_BOARD_LIVE_VERIFY === '1';
function runVerify(cmd: string): 'green' | 'red' {
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 8000, cwd: process.env.CONTINUUM_VERIFY_CWD ?? process.cwd() });
    return 'green';
  } catch { return 'red'; }
}

function classify(todo: Todo, dagState: string | undefined): BoardColumn {
  if (dagState === 'BLOCKED' || todo.status === 'blocked') return 'BLOCKED';
  const hasVerify = !!todo.verifyCommand?.trim();
  if (todo.status === 'done') {
    if (!hasVerify) return 'SKIPPED';                      // unproven done → never DONE
    if (!liveVerify) return 'DONE';                        // classification gate
    return runVerify(todo.verifyCommand!) === 'green' ? 'DONE' : 'FAILED';
  }
  if (todo.status === 'in_progress' && hasVerify && liveVerify && runVerify(todo.verifyCommand!) === 'green') {
    return 'REVIEW';                                       // proof green, awaiting human accept (P9)
  }
  return 'RUNNING';
}

export async function GET(): Promise<Response> {
  let mcp: McpClient | null = null;
  try {
    const url = process.env.CONTINUUM_HTTP_URL ?? 'http://localhost:7878/sse';
    const token = await resolveToken();
    if (!token) return Response.json({ error: 'login', cards: [] }, { status: 200 });
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Continuum-Project': await resolveProject('continuum'),
    };
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
      eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
    });
    mcp = new McpClient({ name: 'continuum-board', version: '0.0.1' }, { capabilities: {} });
    await mcp.connect(transport);

    const todosRes = await mcp.callTool({ name: 'continuum_get_todos', arguments: { limit: 500 } }).catch(() => null);
    await mcp.close().catch(() => {});
    const todos = parseToolText<{ todos?: Todo[] }>(todosRes, {}).todos ?? [];

    // Compute the DAG state locally from blockedBy — robust, no dependency on the
    // engine build. (continuum_next_tasks is the LLM/CLI surface; the board owns
    // the same logic over the todo set it already fetched.)
    const byId = new Map(todos.map(t => [t.id, t]));
    const isDone = (id: string): boolean => byId.get(id)?.status === 'done';
    const dependents = new Map<string, Set<string>>();
    for (const t of todos) {
      for (const dep of t.blockedBy ?? []) {
        if (!dependents.has(dep)) dependents.set(dep, new Set());
        dependents.get(dep)!.add(t.id);
      }
    }
    const leverageOf = (id: string): number => {
      const seen = new Set<string>();
      const q = [...(dependents.get(id) ?? [])];
      while (q.length) {
        const c = q.shift()!;
        if (seen.has(c)) continue;
        seen.add(c);
        for (const n of dependents.get(c) ?? []) if (!seen.has(n)) q.push(n);
      }
      return seen.size;
    };

    const cards: BoardCard[] = todos.map(t => {
      const blockedByOpen = (t.blockedBy ?? []).filter(id => !isDone(id));
      const dagState = t.status === 'blocked' || blockedByOpen.length > 0 ? 'BLOCKED' : undefined;
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        column: classify(t, dagState),
        verifyCommand: t.verifyCommand ?? null,
        hasVerify: !!t.verifyCommand?.trim(),
        refs: t.refs ?? [],
        leverage: leverageOf(t.id),
        blockedByOpen,
      };
    });

    return Response.json({ cards, liveVerify });
  } catch (err) {
    await mcp?.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg, cards: [] }, { status: 500 });
  }
}
