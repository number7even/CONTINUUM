/**
 * POST /api/attest — the human's P9 leap, minted from the Board.
 *
 * The operator clicks "Accept" on a PENDING_HUMAN card. This route loads the human's LOCAL
 * private key, signs a `decision` entry (accept), and calls continuum_attest over MCP. The
 * engine verifies the signature resolves to a registered HUMAN key — an agent cannot reach
 * this (it has no human key and there is no tool to mint one). The private key never leaves
 * this machine; only the signed entry crosses the wire. Returns the new ledger verdict.
 *
 * Setup (once, out of band): node scripts/setup-human-key.mjs — generates the key + registers
 * its PUBLIC half in the engine. Custody hardening (passphrase / hardware) is Option 2.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { cookies } from 'next/headers';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { resolveProject } from '@/lib/project';
import { loadHumanKey, signDecision } from '../../../lib/truth-sign.mjs';

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
  const text = content.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
  try { return JSON.parse(text) as T; } catch { return fallback; }
}

export async function POST(req: Request): Promise<Response> {
  let mcp: McpClient | null = null;
  try {
    const { todoId } = (await req.json().catch(() => ({}))) as { todoId?: string };
    if (!todoId) return Response.json({ error: 'todoId is required' }, { status: 400 });

    const kp = loadHumanKey();
    if (!kp) {
      return Response.json(
        { error: 'No human key configured on this machine. Run: node scripts/setup-human-key.mjs' },
        { status: 428 },
      );
    }

    const token = await resolveToken();
    if (!token) return Response.json({ error: 'not authenticated' }, { status: 401 });

    const url = process.env.CONTINUUM_HTTP_URL ?? 'http://localhost:7878/sse';
    const headers = { Authorization: `Bearer ${token}`, 'X-Continuum-Project': await resolveProject('continuum') };
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
      eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
    });
    mcp = new McpClient({ name: 'continuum-attest', version: '0.0.1' }, { capabilities: {} });
    await mcp.connect(transport);

    const entry = signDecision(kp, todoId, 'accept');
    const res = await mcp.callTool({ name: 'continuum_attest', arguments: { todoId, entry } });
    await mcp.close().catch(() => {});

    if ((res as { isError?: boolean }).isError) {
      const msg = parseToolText<{ error?: string }>(res, {}).error
        ?? (res as { content?: Array<{ text?: string }> }).content?.[0]?.text
        ?? 'attest rejected';
      return Response.json({ error: msg }, { status: 403 });
    }
    const out = parseToolText<{ verdict?: string; finalized?: boolean }>(res, {});
    return Response.json({ ok: true, verdict: out.verdict, finalized: out.finalized });
  } catch (err) {
    await mcp?.close().catch(() => {});
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
