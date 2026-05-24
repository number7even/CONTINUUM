/**
 * Continuum Console — V1 SSE roundtrip proof.
 *
 * This is a Server Component. At request time (NOT build time — see
 * `dynamic = 'force-dynamic'` below), it opens an MCP SSE client against
 * the configured CONTINUUM HTTP/SSE engine and renders the live tool /
 * resource / prompt registry returned over the wire.
 *
 * It is the end-to-end proof that:
 *   (a) A Vercel-hosted Next.js server function can reach a CONTINUUM
 *       engine over the V1 HTTP/SSE transport.
 *   (b) Bearer-token auth works through the network boundary.
 *   (c) The MCP roundtrip (tools/list, resources/list, prompts/list)
 *       returns the same 7 + 4 + 2 surface as stdio.
 *
 * Required env vars:
 *   CONTINUUM_HTTP_URL   — e.g. http://localhost:7878/sse
 *   CONTINUUM_HTTP_TOKEN — Bearer shared secret matching the engine
 *
 * Optional env vars:
 *   CONTINUUM_PROJECT_ID — sent as X-Continuum-Project header to route
 *                          the SSE session to a specific project DB
 *
 * Without env vars set, the page renders the "not configured" state.
 * Build will succeed even when env vars are absent — the connection
 * attempt only happens at request time.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // MCP SDK needs Node runtime, not Edge
export const revalidate = 0;

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

interface OkResult {
  ok: true;
  url: string;
  projectId: string | undefined;
  tools: Array<{ name: string; description?: string }>;
  resources: Array<{ uri: string; name?: string; description?: string }>;
  prompts: Array<{ name: string; description?: string }>;
  latencyMs: number;
}
interface ErrResult {
  ok: false;
  reason: string;
  detail?: string;
}
type Result = OkResult | ErrResult | { ok: 'unconfigured' };

async function fetchContinuumState(): Promise<Result> {
  const url = process.env.CONTINUUM_HTTP_URL;
  const token = process.env.CONTINUUM_HTTP_TOKEN;
  const projectId = process.env.CONTINUUM_PROJECT_ID;

  if (!url || !token) {
    return { ok: 'unconfigured' };
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (projectId) headers['X-Continuum-Project'] = projectId;

  const client = new Client(
    { name: 'continuum-console', version: '0.0.1' },
    { capabilities: {} },
  );
  const transport = new SSEClientTransport(new URL(url), {
    requestInit: { headers },
    eventSourceInit: {
      // EventSource doesn't natively support custom headers; the SDK
      // routes them via fetch() under the hood when this is set.
      fetch: (u, init) =>
        fetch(u, { ...init, headers: { ...init?.headers, ...headers } }),
    },
  });

  const t0 = Date.now();
  try {
    await client.connect(transport);
    const [tools, resources, prompts] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listPrompts(),
    ]);
    return {
      ok: true,
      url,
      projectId,
      tools: tools.tools,
      resources: resources.resources,
      prompts: prompts.prompts,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'Failed to reach the CONTINUUM engine.',
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      await client.close();
    } catch {
      /* swallow — connection may already be torn down */
    }
  }
}

export default async function Home() {
  const result = await fetchContinuumState();

  return (
    <main style={{ maxWidth: 960, margin: '0 auto' }}>
      <header style={{ borderBottom: '1px solid #2a2f36', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Continuum Console</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#8b939b' }}>
          V1 HTTP/SSE transport — operator view
        </p>
      </header>

      {result.ok === 'unconfigured' && <UnconfiguredView />}
      {result.ok === false && <ErrorView result={result} />}
      {result.ok === true && <OkView result={result} />}

      <footer style={{ marginTop: '3rem', color: '#5f6770', fontSize: '0.85rem' }}>
        Server-rendered at request time. Vercel project; Continuum engine
        runs separately (long-running daemon, native bindings).
      </footer>
    </main>
  );
}

function UnconfiguredView() {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ color: '#ffb454' }}>Not configured</h2>
      <p>
        Set <code>CONTINUUM_HTTP_URL</code> and{' '}
        <code>CONTINUUM_HTTP_TOKEN</code> as environment variables.
      </p>
      <p>
        For local dev: copy <code>.env.example</code> to{' '}
        <code>.env.local</code>, point at your running{' '}
        <code>continuum serve</code> (default{' '}
        <code>http://localhost:7878/sse</code>).
      </p>
      <p>
        For Vercel: set the same vars in <em>Project Settings → Environment
        Variables</em> and redeploy.
      </p>
    </section>
  );
}

function ErrorView({ result }: { result: ErrResult }) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ color: '#ff5c5c' }}>Connection failed</h2>
      <p>{result.reason}</p>
      {result.detail && (
        <pre
          style={{
            background: '#14181c',
            padding: '1rem',
            borderRadius: 6,
            overflowX: 'auto',
            fontSize: '0.85rem',
          }}
        >
          {result.detail}
        </pre>
      )}
      <p style={{ color: '#8b939b' }}>
        Check that <code>continuum serve</code> is running and reachable
        at the configured URL with the Bearer token.
      </p>
    </section>
  );
}

function OkView({ result }: { result: OkResult }) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ color: '#7ddf64' }}>Connected</h2>
      <p style={{ color: '#8b939b' }}>
        <code>{result.url}</code>
        {result.projectId && (
          <>
            {' '}— project <code>{result.projectId}</code>
          </>
        )}
        {' '}— roundtrip {result.latencyMs} ms
      </p>

      <Registry
        title={`Tools (${result.tools.length})`}
        items={result.tools.map(t => ({ key: t.name, body: t.description }))}
      />
      <Registry
        title={`Resources (${result.resources.length})`}
        items={result.resources.map(r => ({
          key: r.uri,
          body: r.description ?? r.name,
        }))}
      />
      <Registry
        title={`Prompts (${result.prompts.length})`}
        items={result.prompts.map(p => ({ key: p.name, body: p.description }))}
      />
    </section>
  );
}

function Registry({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; body?: string }>;
}) {
  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ borderBottom: '1px solid #2a2f36', paddingBottom: '0.5rem' }}>
        {title}
      </h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map(item => (
          <li
            key={item.key}
            style={{
              padding: '0.75rem 0',
              borderBottom: '1px solid #1a1e23',
            }}
          >
            <div style={{ fontFamily: 'ui-monospace, monospace', color: '#9ad2ff' }}>
              {item.key}
            </div>
            {item.body && (
              <div style={{ color: '#8b939b', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {item.body}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
