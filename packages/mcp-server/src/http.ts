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
import express, { type Request, type Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { openStorage } from '@continuum/core';
import { buildServer, type ServerHandle } from './server.js';
import { createAuthMiddleware, resolveAuthConfig } from './auth.js';

const PORT = Number(process.env.CONTINUUM_HTTP_PORT ?? 7878);
const DEFAULT_PROJECT = process.env.CONTINUUM_PROJECT_ID ?? 'default';

// Resolve auth at startup so the server refuses to launch in an undecided
// state. Throws if neither CONTINUUM_HTTP_TOKEN (shared-secret) NOR
// CONTINUUM_JWT_ISSUER + CONTINUUM_JWT_AUDIENCE (JWT mode) is set.
// See ./auth.ts and docs/DEPLOY_SELF_HOSTED.md.
let authConfig: ReturnType<typeof resolveAuthConfig>;
try {
  authConfig = resolveAuthConfig();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[continuum-http] FATAL: ${msg}\n`);
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '4mb' }));

// ── Auth middleware ──────────────────────────────────────────────────────────
// /healthz exempt so orchestrator probes don't need credentials.

app.use(createAuthMiddleware(authConfig));

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

// ── Readiness probe (W24-3) ──────────────────────────────────────────────────
//
// /healthz answers "am I alive" (liveness — orchestrators restart on fail).
// /readyz answers "am I ready to serve" (readiness — orchestrators delay
// traffic until 200).
//
// On startup we eagerly probe the default project's storage so /readyz can
// signal "yes, SQLite opens and the embedder model is loaded" before the
// first MCP client connects. That eliminates the cold-start race we hit on
// W22-1 (Vercel hit Fly's /sse, engine had to load MiniLM mid-request, 10s
// connect timeout fired).
//
// The probe also re-runs on a 5-minute interval so /healthz catches storage
// drift between client requests.

interface ReadinessState {
  ready: boolean;
  startedAt: string;
  lastProbedAt: string | null;
  storage: {
    backend: string;
    sqlite_ok: boolean;
    ruvector_ok: boolean | null;
  };
  embedder_ok: boolean;
  errors: string[];
}

const STORAGE_BACKEND = (process.env.CONTINUUM_STORAGE_BACKEND ?? 'hybrid').toLowerCase();

const readiness: ReadinessState = {
  ready: false,
  startedAt: new Date().toISOString(),
  lastProbedAt: null,
  storage: {
    backend: STORAGE_BACKEND,
    sqlite_ok: false,
    ruvector_ok: STORAGE_BACKEND === 'sqlite' ? null : false,
  },
  embedder_ok: STORAGE_BACKEND === 'sqlite' ? true : false,
  errors: [],
};

async function probeReadiness(): Promise<void> {
  readiness.lastProbedAt = new Date().toISOString();
  readiness.errors = [];
  let probe: ReturnType<typeof openStorage> | null = null;
  try {
    probe = openStorage(DEFAULT_PROJECT);
    // Cheap SQLite read — confirms file accessible + WAL mode OK.
    probe.listSnapshots(1);
    readiness.storage.sqlite_ok = true;

    if (STORAGE_BACKEND !== 'sqlite') {
      // HybridStorageBackend.vectorCount() triggers lazy load of both the
      // ruvector binding AND the @xenova/transformers pipeline. Once this
      // returns we know the embedder model is in memory and the vector
      // store is queryable.
      const hybrid = probe as unknown as { vectorCount?: () => Promise<number> };
      if (typeof hybrid.vectorCount === 'function') {
        await hybrid.vectorCount();
        readiness.storage.ruvector_ok = true;
        readiness.embedder_ok = true;
      }
    }

    readiness.ready = readiness.storage.sqlite_ok && readiness.embedder_ok;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    readiness.errors.push(msg);
    readiness.ready = false;
  } finally {
    try {
      probe?.close();
    } catch {
      /* swallow — best-effort cleanup */
    }
  }
}

// Fire the first probe ASAP (don't block listen() — orchestrators get a
// quick /readyz 503 while we warm up, then 200 once ready).
void probeReadiness();
// Re-probe every 5 minutes to catch drift (DB file deleted, ruvector
// corruption, etc.). Cheap — one SQLite read + one vectorCount.
setInterval(() => void probeReadiness(), 5 * 60 * 1000).unref();

// ── /healthz  no-auth probe ──────────────────────────────────────────────────
//
// Liveness signal. 200 when the process is responsive AND core storage is OK;
// 503 when storage is degraded so docker/k8s/Fly can restart.

app.get('/healthz', (_req: Request, res: Response): void => {
  const healthy = readiness.storage.sqlite_ok && readiness.embedder_ok;
  const body = {
    ok: healthy,
    version: '0.0.1',
    transport: 'http+sse',
    sessions: sessions.size,
    uptime_seconds: Math.floor(process.uptime()),
    storage: readiness.storage,
    embedder_ok: readiness.embedder_ok,
    ready: readiness.ready,
    started_at: readiness.startedAt,
    last_probed_at: readiness.lastProbedAt,
  };
  res.status(healthy ? 200 : 503).json(body);
});

// ── /readyz  no-auth readiness probe ─────────────────────────────────────────
//
// 200 when storage + embedder are warm; 503 while initializing or on failure.
// Orchestrators should delay routing traffic until this returns 200.

app.get('/readyz', (_req: Request, res: Response): void => {
  const body = {
    ready: readiness.ready,
    storage: readiness.storage,
    embedder_ok: readiness.embedder_ok,
    errors: readiness.errors,
    started_at: readiness.startedAt,
    last_probed_at: readiness.lastProbedAt,
  };
  res.status(readiness.ready ? 200 : 503).json(body);
});

// ── Listen + graceful shutdown ───────────────────────────────────────────────

const httpServer = app.listen(PORT, () => {
  const authDesc =
    authConfig.mode === 'shared-secret'
      ? `Bearer[shared-secret,len=${authConfig.token.length}]`
      : `Bearer[jwt,iss=${authConfig.issuer},aud=${authConfig.audience}]`;
  process.stderr.write(
    `[continuum-http] listening on :${PORT}  defaultProject=${DEFAULT_PROJECT}  auth=${authDesc}\n`,
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
