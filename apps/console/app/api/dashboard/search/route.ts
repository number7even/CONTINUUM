/**
 * POST /api/dashboard/search — memory search (Progressive Disclosure Layer-1).
 *
 * Wires the dashboard's search box to the live engine's continuum_search_docs
 * over the same tenant-scoped MCP connection. Returns compact hits (id + title +
 * type + timestamp) — the cheap Layer-1 surface, no full content (that's the
 * point: search the 5-source memory without burning tokens).
 *
 * Tenant token resolution mirrors the dashboard: cookie token (the client's)
 * precedence over the env demo token.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

interface Hit {
  id: string;
  source?: string;
  type?: string;
  timestamp?: string;
  title?: string;
}

async function resolveToken(): Promise<string | null> {
  try {
    const c = (await cookies()).get('continuum_tenant_token')?.value;
    if (c) return decodeURIComponent(c);
  } catch { /* noop */ }
  return process.env.CONTINUUM_HTTP_TOKEN ?? null;
}

export async function POST(req: Request): Promise<Response> {
  const url = process.env.CONTINUUM_HTTP_URL;
  const projectId = process.env.CONTINUUM_PROJECT_ID;
  const token = await resolveToken();
  if (!url || !token) return new Response(JSON.stringify({ ok: false, error: 'not configured' }), { status: 503 });

  let query = '';
  try {
    query = String((await req.json()).query ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid request' }), { status: 400 });
  }
  if (!query) return new Response(JSON.stringify({ ok: false, error: 'query required' }), { status: 400 });

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (projectId) headers['X-Continuum-Project'] = projectId;

  const client = new Client({ name: 'continuum-dashboard-search', version: '0.0.1' }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(url), {
    requestInit: { headers },
    eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
  });

  try {
    await client.connect(transport);
    const res = await client.callTool({ name: 'continuum_search_docs', arguments: { query, limit: 20 } });
    const text = (res as { content?: Array<{ type: string; text?: string }> })?.content?.find((c) => c.type === 'text')?.text;
    const parsed = text ? JSON.parse(text) : {};
    const hits: Hit[] = Array.isArray(parsed) ? parsed : (parsed.hits ?? []);
    return new Response(JSON.stringify({ ok: true, query, count: hits.length, hits }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 502 });
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}
