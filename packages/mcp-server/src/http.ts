#!/usr/bin/env node
/**
 * Continuum MCP — HTTP/SSE transport entry point (V1).
 *
 * Exposes the same 7 tools + 4 Resources + 2 Prompts as the stdio entry,
 * but over HTTP + Server-Sent Events. This is the bridge a remote AI
 * client (Vercel frontend, hosted Claude Desktop, etc.) needs.
 *
 * Endpoints:
 *
 *   GET  /sse                  Establish an SSE stream. Each connection
 *                              spins up its own buildServer(projectId)
 *                              instance so per-session state is isolated.
 *                              Project picked from (in priority order):
 *                                X-Continuum-Project header
 *                                ?project= query param
 *                                $CONTINUUM_PROJECT_ID env var
 *                                "default"
 *
 *   POST /messages?sessionId=  Client posts JSON-RPC messages here. The
 *                              session ID is created by the SSE handshake
 *                              and echoed back to the client; the client
 *                              must include it as a query param so we can
 *                              route the message to the right transport.
 *
 *   GET  /healthz              No-auth health probe.
 *
 * Auth:
 *   - Shared-secret bearer token in `Authorization: Bearer <TOKEN>` header.
 *   - Token from $CONTINUUM_HTTP_TOKEN. REQUIRED — server refuses to start
 *     without it (V1 stub uses a single shared secret; OAuth + per-tenant
 *     is V2 SaaS scope).
 *   - /healthz is exempt so load balancers can probe without credentials.
 *
 * Port: $CONTINUUM_HTTP_PORT (default 7878).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { buildServer, type ServerHandle } from './server.js';

const PORT = Number(process.env.CONTINUUM_HTTP_PORT ?? 7878);
const TOKEN = process.env.CONTINUUM_HTTP_TOKEN;
const DEFAULT_PROJECT = process.env.CONTINUUM_PROJECT_ID ?? 'default';

if (!TOKEN || !TOKEN.trim()) {
  process.stderr.write(
    '[continuum-http] FATAL: $CONTINUUM_HTTP_TOKEN required. ' +
      'Generate one (e.g. `openssl rand -hex 32`) and re-launch.\n',
  );
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '4mb' }));

// ── Auth middleware ──────────────────────────────────────────────────────────
// /healthz exempt so load balancers can probe without credentials.

app.use((req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/healthz') {
    next();
    return;
  }
  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

// ── Per-session transport + server registry ──────────────────────────────────

interface Session {
  transport: SSEServerTransport;
  handle: ServerHandle;
}
const sessions = new Map<string, Session>();

function resolveProjectId(req: Request): string {
  const hdr = req.headers['x-continuum-project'];
  if (typeof hdr === 'string' && hdr.trim()) return hdr.trim();
  const q = req.query.project;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return DEFAULT_PROJECT;
}

// ── /sse  open a Server-Sent Events stream ───────────────────────────────────

app.get('/sse', async (req: Request, res: Response) => {
  const projectId = resolveProjectId(req);
  const handle = buildServer(projectId);
  // SSE transport writes its own headers + keep-alive; we hand it `res`.
  const transport = new SSEServerTransport('/messages', res);
  sessions.set(transport.sessionId, { transport, handle });

  res.on('close', () => {
    const s = sessions.get(transport.sessionId);
    if (s) {
      s.handle.close();
      sessions.delete(transport.sessionId);
    }
  });

  try {
    await handle.server.connect(transport);
    process.stderr.write(
      `[continuum-http] sse session=${transport.sessionId.slice(0, 8)} project=${projectId}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[continuum-http] sse connect failed: ${msg}\n`);
    handle.close();
    sessions.delete(transport.sessionId);
  }
});

// ── /messages  receive JSON-RPC from the client ──────────────────────────────

app.post('/messages', async (req: Request, res: Response): Promise<void> => {
  const sessionId =
    typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId query param required' });
    return;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'unknown session' });
    return;
  }
  await session.transport.handlePostMessage(req, res, req.body);
});

// ── /healthz  no-auth probe ──────────────────────────────────────────────────

app.get('/healthz', (_req: Request, res: Response): void => {
  res.json({
    ok: true,
    version: '0.0.1',
    transport: 'http+sse',
    sessions: sessions.size,
  });
});

// ── Listen + graceful shutdown ───────────────────────────────────────────────

const httpServer = app.listen(PORT, () => {
  process.stderr.write(
    `[continuum-http] listening on :${PORT}  defaultProject=${DEFAULT_PROJECT}  authToken=Bearer[len=${TOKEN.length}]\n`,
  );
});

const shutdown = (): void => {
  process.stderr.write('[continuum-http] shutting down…\n');
  for (const s of sessions.values()) s.handle.close();
  sessions.clear();
  httpServer.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
