#!/usr/bin/env node
/**
 * V1 HTTP/SSE transport smoke test.
 *
 * Proves the bridge between a remote AI client and the Continuum engine:
 *   (a) /healthz returns 200 without auth (load-balancer probe).
 *   (b) /sse rejects unauthenticated requests with 401.
 *   (c) /sse accepts Bearer-token-auth and opens an SSE stream.
 *   (d) tools/list, resources/list, prompts/list all round-trip cleanly
 *       over the SSE transport — same 7 + 4 + 2 surface as stdio.
 *   (e) Project routing honours the X-Continuum-Project header.
 *
 * RUN WITH:
 *   node scripts/http-smoke.mjs
 *
 * Server is spawned as a child process on a random high port with a
 * generated shared-secret token, exercised via the SDK Client +
 * SSEClientTransport, then SIGTERM'd. Throwaway project DB cleaned up.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const HTTP_BIN = resolve(REPO_ROOT, 'packages/mcp-server/dist/http.js');

const TOKEN = randomBytes(16).toString('hex');
const PORT = 17878 + Math.floor(Math.random() * 1000);
const PROJECT_ID = 'http-smoke-test';
const PROJECT_DIR = `${homedir()}/.continuum/${PROJECT_ID}`;

if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true });

const { Client } = await import(
  resolve(REPO_ROOT, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')
);
const { SSEClientTransport } = await import(
  resolve(REPO_ROOT, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/sse.js')
);

console.log('V1 HTTP/SSE TRANSPORT SMOKE TEST');
console.log(`  port=${PORT}  token=${TOKEN.slice(0, 8)}…  project=${PROJECT_ID}`);
console.log('');

// ── Spawn the HTTP server ────────────────────────────────────────────────────
const server = spawn('node', [HTTP_BIN], {
  env: {
    ...process.env,
    CONTINUUM_HTTP_TOKEN: TOKEN,
    CONTINUUM_HTTP_PORT: String(PORT),
    CONTINUUM_PROJECT_ID: PROJECT_ID,
  },
  stdio: ['ignore', 'inherit', 'pipe'],
});

let serverReady = false;
let serverErrorOutput = '';
server.stderr.on('data', chunk => {
  const s = chunk.toString();
  serverErrorOutput += s;
  process.stderr.write(s);
  if (s.includes('listening on')) serverReady = true;
});
server.on('exit', code => {
  if (!serverReady) {
    console.error(`\nFAIL: server exited with code ${code} before listening.`);
    console.error('--- stderr ---');
    console.error(serverErrorOutput);
    process.exit(1);
  }
});

const deadline = Date.now() + 8000;
while (!serverReady && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 100));
}
if (!serverReady) {
  console.error('FAIL: server did not become ready within 8s');
  server.kill('SIGTERM');
  process.exit(1);
}

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

async function cleanup(code) {
  server.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 200));
  if (existsSync(PROJECT_DIR)) rmSync(PROJECT_DIR, { recursive: true });
  process.exit(code);
}

try {
  // ── (a) /healthz no-auth ────────────────────────────────────────────────
  const hres = await fetch(`http://localhost:${PORT}/healthz`);
  const hjson = await hres.json();
  check('/healthz returns 200 without auth',
    hres.status === 200 && hjson.ok === true && hjson.transport === 'http+sse',
    `status=${hres.status} body=${JSON.stringify(hjson)}`);

  // ── (b) /sse rejects unauthenticated ────────────────────────────────────
  const noauth = await fetch(`http://localhost:${PORT}/sse`);
  check('/sse rejects unauthenticated request',
    noauth.status === 401, `status=${noauth.status}`);

  // ── (c) /sse + SDK client end-to-end ────────────────────────────────────
  const client = new Client(
    { name: 'continuum-http-smoke', version: '0.0.1' },
    { capabilities: {} },
  );
  const transport = new SSEClientTransport(
    new URL(`http://localhost:${PORT}/sse`),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'X-Continuum-Project': PROJECT_ID,
        },
      },
      eventSourceInit: {
        // EventSource doesn't natively support custom headers; the SDK
        // routes them via fetch() under the hood when this is set.
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            headers: { ...init?.headers, Authorization: `Bearer ${TOKEN}` },
          }),
      },
    },
  );
  await client.connect(transport);
  check('SSE connect succeeded with Bearer auth', true);

  // ── (d) MCP roundtrips ──────────────────────────────────────────────────
  const tools = await client.listTools();
  // Tool count = V0 baseline (7) + Layer-2 timeline + Layer-3
  // get_observations (commit e0de609, 2026-05-28) + delete_observation
  // (Issue #10 / W22-3, commit 8b987dc, 2026-05-30) = 10.
  check('tools/list returns 10 tools',
    tools.tools.length === 10,
    `got ${tools.tools.length}: ${tools.tools.map(t => t.name).join(',')}`);

  const resources = await client.listResources();
  check('resources/list returns 4 resources',
    resources.resources.length === 4,
    `got ${resources.resources.map(r => r.uri).join(', ')}`);

  const prompts = await client.listPrompts();
  check('prompts/list returns 2 prompts',
    prompts.prompts.length === 2,
    `got ${prompts.prompts.map(p => p.name).join(',')}`);

  // ── (e) Read the briefing resource ──────────────────────────────────────
  const briefing = await client.readResource({ uri: 'continuum://session/briefing' });
  const briefingText = briefing.contents[0]?.text ?? '';
  check('continuum://session/briefing renders for the routed project',
    briefingText.includes('Continuum Session Briefing')
    && briefingText.includes(PROJECT_ID),
    `briefing length=${briefingText.length}`);

  await client.close();
} catch (err) {
  console.error('FAIL during MCP roundtrip:', err);
  failed++;
}

console.log('');
console.log(failed === 0
  ? '✓ ALL V1 HTTP/SSE CHECKS PASSED'
  : `✗ ${failed} CHECK(S) FAILED`);
await cleanup(failed === 0 ? 0 : 1);
