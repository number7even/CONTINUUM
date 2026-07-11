/**
 * POST /api/ask/context — the Ask retrieval surface (model-free, local, cited).
 *
 * Calls continuum_ask_context (search → fetch → TRUST-TIERED bundle) over the live
 * engine and returns the grounded nodes verbatim: each { id, title, source, type,
 * tier, score, excerpt }. This is the deterministic grounding the Ask UI renders —
 * every result a cited window carrying its epistemic tier (§5). A prose answer (the
 * connected model composing over these nodes) is an optional layer on top; the
 * grounding itself needs no model and never leaves the machine.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { cookies } from 'next/headers';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { resolveProject } from '@/lib/project';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function resolveToken(): Promise<string | null> {
  try {
    const c = (await cookies()).get('continuum_tenant_token')?.value;
    if (c) return decodeURIComponent(c);
  } catch { /* noop */ }
  return process.env.CONTINUUM_HTTP_TOKEN ?? null;
}

function parseToolText<T>(res: unknown, fallback: T): T {
  const content = (res as { content?: Array<{ type: string; text?: string }> })?.content ?? [];
  const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { query?: string; limit?: number };
  const query = (body.query ?? '').trim();
  if (!query) return Response.json({ error: 'query required', query: '', count: 0, nodes: [] }, { status: 400 });

  let mcp: McpClient | null = null;
  try {
    const url = process.env.CONTINUUM_HTTP_URL ?? 'http://localhost:7878/sse';
    const token = await resolveToken();
    if (!token) return Response.json({ error: 'login', query, count: 0, nodes: [] }, { status: 200 });
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Continuum-Project': await resolveProject('continuum'),
    };
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
      eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
    });
    mcp = new McpClient({ name: 'continuum-ask', version: '0.0.1' }, { capabilities: {} });
    await mcp.connect(transport);
    const res = await mcp
      .callTool({ name: 'continuum_ask_context', arguments: { query, limit: body.limit ?? 12 } })
      .catch(() => null);
    await mcp.close().catch(() => {});
    return Response.json(parseToolText(res, { query, count: 0, nodes: [] }));
  } catch (err) {
    try { await mcp?.close(); } catch { /* noop */ }
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), query, count: 0, nodes: [] },
      { status: 200 },
    );
  }
}
