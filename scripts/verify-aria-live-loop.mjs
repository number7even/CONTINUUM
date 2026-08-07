#!/usr/bin/env node
// verify-aria-live-loop.mjs — the LIVE ARIA ↔ engine proof (Directive 2). Orchestration gate:
// boots a real engine, so it is NOT in the offline smoke suite — run it directly for the receipt.
//
// Turns "supported" into "proven live end-to-end". It boots `continuum serve` in JWT mode (CONTINUUM
// is its own issuer), seeds TWO tenants' KBs, mints a scoped token with `provision-tenant`, and
// drives a synthetic ARIA MCP client over real HTTP/SSE. It proves, under live fire, that the JWT
// middleware + header routing + storage isolation all hold together:
//   • a valid per-tenant JWT + X-Continuum-Project connects and continuum_search_docs returns
//     ONLY that tenant's knowledge (its marker found; the other tenant's marker absent);
//   • the /.well-known/jwks.json the engine serves is what verifies its own tokens;
//   • no Authorization → 401; a valid token whose header asserts a DIFFERENT tenant → 403.
//
//   node scripts/verify-aria-live-loop.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { spawn, execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const repo = resolve(new URL('..', import.meta.url).pathname);
const PORT = 7881;
const BASE = `http://localhost:${PORT}`;
const ISSUER = BASE;
const AUDIENCE = 'continuum-api';
const CLI = join(repo, 'packages/cli/dist/index.js');

const env = {
  ...process.env,
  CONTINUUM_DATA_DIR: mkdtempSync(join(tmpdir(), 'amf-aria-')),
  CONTINUUM_STORAGE_BACKEND: 'sqlite',
  CONTINUUM_PRIVACY_PII: '1',
  CONTINUUM_JWT_ISSUER: ISSUER,
  CONTINUUM_JWT_AUDIENCE: AUDIENCE,
  CONTINUUM_HTTP_PORT: String(PORT),
};

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
let engine = null;
const cleanup = () => {
  try { engine?.kill('SIGKILL'); } catch { /* noop */ }
  try { execSync(`kill -9 $(lsof -ti tcp:${PORT} 2>/dev/null) 2>/dev/null`, { stdio: 'ignore' }); } catch { /* noop */ }
  rmSync(env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
};
process.on('exit', cleanup);

try {
  console.log('── 1. seed two tenants (isolated KBs, unique markers) ──────────────────');
  const { openStorage, ingestHotelKb } = await import('@number7even/continuum-core');
  const savedDir = process.env.CONTINUUM_DATA_DIR, savedPii = process.env.CONTINUUM_PRIVACY_PII, savedBackend = process.env.CONTINUUM_STORAGE_BACKEND;
  process.env.CONTINUUM_DATA_DIR = env.CONTINUUM_DATA_DIR; process.env.CONTINUUM_PRIVACY_PII = '1'; process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
  const gh = await openStorage('grand-harbour');
  ingestHotelKb(gh, { property: { name: 'Grand Harbour Hotel' }, policies: [{ name: 'Cancellation Policy', body: 'ZEBRAFISH marker — cancel 48h ahead for a full refund.' }] });
  const al = await openStorage('alpine-lodge');
  ingestHotelKb(al, { property: { name: 'Alpine Lodge Resort' }, policies: [{ name: 'Cancellation Policy', body: 'NARWHAL marker — non-refundable in peak season.' }] });
  process.env.CONTINUUM_DATA_DIR = savedDir; process.env.CONTINUUM_PRIVACY_PII = savedPii; process.env.CONTINUUM_STORAGE_BACKEND = savedBackend;
  console.log('  seeded grand-harbour (ZEBRAFISH) + alpine-lodge (NARWHAL)');

  console.log('── 2. mint the tenant token via `continuum provision-tenant` ───────────');
  const provOut = execFileSync(process.execPath, [CLI, 'provision-tenant', 'grand-harbour', '--issuer', ISSUER, '--audience', AUDIENCE], { encoding: 'utf8', env });
  const TOKEN = provOut.match(/Authorization: Bearer (\S+)/)?.[1] ?? '';
  check('provision-tenant minted a token', TOKEN.split('.').length === 3);

  console.log('── 3. boot the live engine in JWT mode (continuum serve) ───────────────');
  engine = spawn(process.execPath, [CLI, 'serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/healthz`); if (r.ok) { up = true; break; } } catch { /* not yet */ }
    await sleep(500);
  }
  check('engine is live (healthz 200)', up);
  const jwks = await (await fetch(`${BASE}/.well-known/jwks.json`)).json();
  check('the engine serves its issuer JWKS (verifies its own tokens)', Array.isArray(jwks.keys) && jwks.keys.length >= 1 && jwks.keys[0].kty === 'RSA');

  console.log('── 4. synthetic ARIA client · scoped query over live SSE ───────────────');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
  const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Continuum-Project': 'grand-harbour' };
  const transport = new SSEClientTransport(new URL(`${BASE}/sse`), {
    requestInit: { headers },
    eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
  });
  const client = new Client({ name: 'aria-synthetic', version: '0.0.1' }, { capabilities: {} });
  await client.connect(transport);
  check('ARIA connects to the running engine with its per-tenant JWT', true);

  const parse = (r) => JSON.parse(r.content[0].text);
  const own = parse(await client.callTool({ name: 'continuum_search_docs', arguments: { query: 'ZEBRAFISH' } }));
  check("ARIA retrieves ITS OWN tenant's knowledge (ZEBRAFISH found)", own.count >= 1, `${own.count} hits`);
  const cross = parse(await client.callTool({ name: 'continuum_search_docs', arguments: { query: 'NARWHAL' } }));
  check("ARIA CANNOT retrieve the other tenant's knowledge (NARWHAL absent)", cross.count === 0, `${cross.count} leaks`);
  await client.close().catch(() => {});

  console.log('── 5. negative paths under live fire (auth actually enforced) ──────────');
  const noAuth = await fetch(`${BASE}/sse`, { headers: {} });
  check('no Authorization → 401', noAuth.status === 401, `got ${noAuth.status}`);
  const mismatch = await fetch(`${BASE}/sse`, { headers: { Authorization: `Bearer ${TOKEN}`, 'X-Continuum-Project': 'alpine-lodge' } });
  check('valid token but header asserts ANOTHER tenant → 403', mismatch.status === 403, `got ${mismatch.status}`);
} catch (err) {
  check(`no unexpected error (${err instanceof Error ? err.message : String(err)})`, false);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('ARIA_LIVE_LOOP_VERIFY: GREEN — a per-tenant JWT drives a scoped query over the LIVE SSE engine;');
  console.log('retrieval is isolated to the tenant, and auth is enforced (401 no-token, 403 tenant mismatch).');
  process.exit(0);
} else { console.log('ARIA_LIVE_LOOP_VERIFY: RED'); process.exit(1); }
