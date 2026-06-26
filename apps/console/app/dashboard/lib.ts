/**
 * Dashboard data layer — calls the LIVE CONTINUUM engine over MCP (the same
 * proven SSE + Bearer connection the console uses) and pulls the real data the
 * client dashboard renders: todos (verify-then-dissolve), current state, digest.
 *
 * Tenant scoping: the Bearer token + X-Continuum-Project header route the
 * session to the client's tenant (W27 isolation). One token = one tenant's view.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { cookies } from 'next/headers';

export interface Todo {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  verifyCommand?: string;
  completedAt?: string;
  createdAt?: string;
  refs?: string[];
}

export interface StateEntry {
  name: string;
  where?: string;
  description?: string;
}
export interface StateSnapshot {
  active: StateEntry[];
  dormant: StateEntry[];
  broken: StateEntry[];
  reason?: string;
  hash?: string;
  timestamp?: string;
}

export interface DashboardData {
  ok: boolean;
  reason?: string;
  todos: Todo[];
  state: StateSnapshot | null;
  digest: string | null;
  projectId?: string;
  latencyMs: number;
}

function parseToolText<T>(res: unknown, fallback: T): T {
  // MCP tool results: { content: [{ type:'text', text: '<json>' }] }
  try {
    const content = (res as { content?: Array<{ type: string; text?: string }> })?.content;
    const text = content?.find((c) => c.type === 'text')?.text;
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The client's pasted tenant token (cookie) takes precedence over the env
 *  demo token, so each logged-in client sees THEIR tenant. Returns null when
 *  neither is present (→ login required). */
async function resolveToken(): Promise<{ token: string | null; fromCookie: boolean }> {
  try {
    const cookieToken = (await cookies()).get('continuum_tenant_token')?.value;
    if (cookieToken) return { token: decodeURIComponent(cookieToken), fromCookie: true };
  } catch { /* cookies() unavailable in some contexts */ }
  return { token: process.env.CONTINUUM_HTTP_TOKEN ?? null, fromCookie: false };
}

export async function fetchDashboard(): Promise<DashboardData> {
  const url = process.env.CONTINUUM_HTTP_URL;
  const { token } = await resolveToken();
  const projectId = process.env.CONTINUUM_PROJECT_ID;
  const empty: DashboardData = { ok: false, todos: [], state: null, digest: null, latencyMs: 0 };

  if (!url) return { ...empty, reason: 'unconfigured' };
  if (!token) return { ...empty, reason: 'login' };

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (projectId) headers['X-Continuum-Project'] = projectId;

  const client = new Client({ name: 'continuum-dashboard', version: '0.0.1' }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(url), {
    requestInit: { headers },
    eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
  });

  const t0 = Date.now();
  try {
    await client.connect(transport);

    // Todos — the verify-then-dissolve pipeline (all statuses).
    const todosRes = await client.callTool({ name: 'continuum_get_todos', arguments: {} }).catch(() => null);
    const todosRaw = parseToolText<{ todos?: Todo[] } | Todo[]>(todosRes, []);
    const todos: Todo[] = Array.isArray(todosRaw) ? todosRaw : (todosRaw.todos ?? []);

    // Current state snapshot — "at a glance".
    const stateRes = await client.callTool({ name: 'continuum_get_state', arguments: {} }).catch(() => null);
    const state = parseToolText<StateSnapshot | null>(stateRes, null);

    // Latest digest — recent activity narrative.
    const digestRes = await client.callTool({ name: 'continuum_get_digest', arguments: {} }).catch(() => null);
    const digestObj = parseToolText<{ digest?: string; narrative?: string } | string>(digestRes, '');
    const digest = typeof digestObj === 'string' ? digestObj : (digestObj.digest ?? digestObj.narrative ?? null);

    return { ok: true, todos, state, digest, projectId, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ...empty, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}
