/**
 * POST /api/dashboard/session — set the tenant session from a pasted token.
 *
 * Validates the token by attempting a real MCP connection to the engine; on
 * success, stores it in an HttpOnly cookie so the dashboard connects as THAT
 * tenant. DELETE clears it (logout). Concierge model — no accounts.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const runtime = 'nodejs';

const COOKIE = 'continuum_tenant_token';

async function validate(url: string, token: string): Promise<boolean> {
  const headers = { Authorization: `Bearer ${token}` };
  const client = new Client({ name: 'continuum-dashboard-auth', version: '0.0.1' }, { capabilities: {} });
  const transport = new SSEClientTransport(new URL(url), {
    requestInit: { headers },
    eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
  });
  try {
    await client.connect(transport);
    await client.listTools();
    return true;
  } catch {
    return false;
  } finally {
    try { await client.close(); } catch { /* noop */ }
  }
}

export async function POST(req: Request): Promise<Response> {
  const url = process.env.CONTINUUM_HTTP_URL;
  if (!url) return new Response('engine not configured', { status: 503 });

  let token: string;
  try {
    token = String((await req.json()).token ?? '').trim();
  } catch {
    return new Response('invalid request', { status: 400 });
  }
  if (!token) return new Response('token required', { status: 400 });

  const ok = await validate(url, token);
  if (!ok) return new Response('Token rejected by the engine. Check it and try again.', { status: 401 });

  const cookie = `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${7 * 24 * 60 * 60}`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  });
}

export async function DELETE(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0` },
  });
}
