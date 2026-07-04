/**
 * Brain graph data layer — calls the LIVE CONTINUUM engine over MCP (the same
 * proven SSE + Bearer connection the dashboard uses) and pulls the observation
 * provenance graph the 3D "brain" renders.
 *
 * Architectural seam (per the locked decision): the frontend consumes the graph
 * EXACTLY as any other MCP client would — through the continuum_graph tool over
 * SSEClientTransport. It never reads the storage engine directly. Run
 * `continuum serve` locally to point this at a local DB during dev.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { cookies } from 'next/headers';

export interface GraphNode {
  id: string;
  source: string;
  type: string;
  label: string;
  timestamp: string;
  degree: number;
}
export interface GraphEdge {
  source: string;
  target: string;
}
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  bySource: Record<string, number>;
  topHubs: Array<{ id: string; label: string; degree: number }>;
}
export interface GraphData {
  ok: boolean;
  reason?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats | null;
  projectId?: string;
  latencyMs: number;
}

function parseToolText<T>(res: unknown, fallback: T): T {
  try {
    const content = (res as { content?: Array<{ type: string; text?: string }> })?.content;
    const text = content?.find((c) => c.type === 'text')?.text;
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function resolveToken(): Promise<string | null> {
  try {
    const cookieToken = (await cookies()).get('continuum_tenant_token')?.value;
    if (cookieToken) return decodeURIComponent(cookieToken);
  } catch { /* cookies() unavailable in some contexts */ }
  return process.env.CONTINUUM_HTTP_TOKEN ?? null;
}

export async function fetchGraph(limit = 3000): Promise<GraphData> {
  const url = process.env.CONTINUUM_HTTP_URL;
  const token = await resolveToken();
  const projectId = process.env.CONTINUUM_PROJECT_ID;
  const empty: GraphData = { ok: false, nodes: [], edges: [], stats: null, latencyMs: 0 };

  if (!url) return { ...empty, reason: 'unconfigured' };
  if (!token) return { ...empty, reason: 'login' };

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (projectId) headers['X-Continuum-Project'] = projectId;

  const client = new Client({ name: 'continuum-brain', version: '0.0.1' }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(url), {
    requestInit: { headers },
    eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
  });

  const t0 = Date.now();
  try {
    await client.connect(transport);
    const res = await client
      .callTool({ name: 'continuum_graph', arguments: { limit } })
      .catch(() => null);
    const g = parseToolText<{ nodes?: GraphNode[]; edges?: GraphEdge[]; stats?: GraphStats }>(res, {});
    return {
      ok: true,
      nodes: g.nodes ?? [],
      edges: g.edges ?? [],
      stats: g.stats ?? null,
      projectId,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return { ...empty, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}
