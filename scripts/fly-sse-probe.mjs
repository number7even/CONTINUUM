#!/usr/bin/env node
/**
 * Fly SSE Probe — V1 AaaS bridge liveness check.
 *
 * Hits the public CONTINUUM engine on Fly.io over SSE with Bearer auth
 * and confirms the full MCP roundtrip works (connect + listTools +
 * listResources + listPrompts, in parallel). Reusable across:
 *
 *   - the V1-AaaS-LIVE checkpoint's verify_command
 *   - manual operator liveness checks
 *   - any future CI smoke
 *
 * Exit 0 on success, exit 1 on any failure. One-line machine-greppable
 * stdout:
 *
 *   FLY_SSE_PROBE_SUCCESS roundtrip=NNNms tools=N resources=N prompts=N
 *   FLY_SSE_PROBE_FAIL reason=<short reason>
 *
 * Env overrides:
 *   CONTINUUM_FLY_URL     — default https://continuum-engine.fly.dev/sse
 *   CONTINUUM_HTTP_TOKEN  — Bearer secret. Falls back to
 *                            ~/.continuum/bridge.env if not in env.
 *   PROBE_TIMEOUT_MS      — default 15000
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const URL_STR = process.env.CONTINUUM_FLY_URL ?? 'https://continuum-engine.fly.dev/sse';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 15000);

let TOKEN = process.env.CONTINUUM_HTTP_TOKEN;
if (!TOKEN) {
  try {
    const text = readFileSync(`${homedir()}/.continuum/bridge.env`, 'utf-8');
    const m = text.match(/^CONTINUUM_HTTP_TOKEN=(.+)$/m);
    if (m) TOKEN = m[1].trim();
  } catch {
    /* fall through — handled below */
  }
}
if (!TOKEN) {
  console.log('FLY_SSE_PROBE_FAIL reason=no-token-in-env-or-bridge.env');
  process.exit(1);
}

const SDK_BASE = resolve(
  REPO_ROOT,
  'node_modules/@modelcontextprotocol/sdk/dist/esm/client',
);
const { Client } = await import(resolve(SDK_BASE, 'index.js'));
const { SSEClientTransport } = await import(resolve(SDK_BASE, 'sse.js'));

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'X-Continuum-Project': 'continuum',
};
const transport = new SSEClientTransport(new URL(URL_STR), {
  requestInit: { headers },
  eventSourceInit: {
    fetch: (u, init) =>
      fetch(u, { ...init, headers: { ...init?.headers, ...headers } }),
  },
});
const client = new Client(
  { name: 'fly-sse-probe', version: '0.0.1' },
  { capabilities: {} },
);

const timeoutHandle = setTimeout(() => {
  console.log(`FLY_SSE_PROBE_FAIL reason=timeout-${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);

try {
  const t0 = Date.now();
  await client.connect(transport);
  const [tools, resources, prompts] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listPrompts(),
  ]);
  const dt = Date.now() - t0;
  clearTimeout(timeoutHandle);
  console.log(
    `FLY_SSE_PROBE_SUCCESS roundtrip=${dt}ms tools=${tools.tools.length} resources=${resources.resources.length} prompts=${prompts.prompts.length}`,
  );
  await client.close();
  process.exit(0);
} catch (err) {
  clearTimeout(timeoutHandle);
  const raw = err && err.message ? err.message : String(err);
  const msg = raw.replace(/\s+/g, ' ').slice(0, 120);
  console.log(`FLY_SSE_PROBE_FAIL reason=${msg}`);
  process.exit(1);
}
