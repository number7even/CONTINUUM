/**
 * POST /api/observation — fetch the full verified content of graph node(s).
 *
 * The brain's graph tool returns only {id, source, type, label, degree} (cheap).
 * The DOSSIER needs the actual content — file path + signature + docstring for a
 * code symbol, subject + body for a commit, the markdown for a doc. This calls
 * CONTINUUM's Layer-3 tool `continuum_get_observations({ids})` and returns the
 * dense records. NO LLM — pure MCP, so the dossier works with zero model key.
 *
 * Body:   { ids: string[] }
 * Result: { observations: Array<{ id, sourceId, type, content, timestamp, metadata, refs }> }
 *
 * Same engine as the brain graph (CONTINUUM_HTTP_URL/TOKEN/PROJECT_ID) → the ids
 * resolve against exactly what's on screen.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  let mcp: McpClient | null = null;
  try {
    const { ids } = (await req.json()) as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }

    const url = process.env.CONTINUUM_HTTP_URL ?? 'http://localhost:7878/sse';
    const token = process.env.CONTINUUM_HTTP_TOKEN;
    if (!token) return Response.json({ error: 'CONTINUUM_HTTP_TOKEN not set' }, { status: 500 });

    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Continuum-Project': process.env.CONTINUUM_PROJECT_ID ?? 'graph-demo',
    };
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
      eventSourceInit: {
        fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }),
      },
    });
    mcp = new McpClient({ name: 'continuum-brain-dossier', version: '0.0.1' }, { capabilities: {} });
    await mcp.connect(transport);

    const res = await mcp.callTool({ name: 'continuum_get_observations', arguments: { ids } });
    const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
    await mcp.close().catch(() => {});

    let parsed: unknown = {};
    try { parsed = JSON.parse(text); } catch { /* non-JSON — return raw */ }
    const observations = (parsed as { observations?: unknown[] }).observations ?? [];
    return Response.json({ observations });
  } catch (err) {
    await mcp?.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
