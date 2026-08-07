#!/usr/bin/env node
/**
 * verify-mcp-truth-loop.mjs — the multi-actor E2E, over a REAL running MCP server.
 *
 * Spawns the HTTP/SSE engine and drives the full truth round across the wire through the
 * three new tools, asserting the verdict transitions and — crucially — that:
 *   • the block finalizes PROVEN ONLY when the full distinct-key set (A·V·T·H) is present;
 *   • continuum_attest is UNREACHABLE by a non-human key (P9), rejected before the ledger;
 *   • T's mechanical exit-0 is a veto even the human cannot override (a failing verify → REFUTED
 *     stays REFUTED after H accepts);
 *   • continuum_get_todos surfaces the true ledger verdict + gated board column.
 *
 * Identities (A/V/H public keys) are registered OUT OF BAND (direct storage, before the server
 * starts) — there is no MCP tool to register a key, which is exactly why an agent can't mint a
 * human identity. The server auto-holds the mechanical tester key (T).
 *
 *   node scripts/verify-mcp-truth-loop.mjs
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const HTTP_BIN = resolve(REPO_ROOT, 'packages/mcp-server/dist/http.js');
const TOKEN = randomBytes(16).toString('hex');
const PORT = 18878 + Math.floor(Math.random() * 900);
const PROJECT_ID = 'mcp-truth-loop';
const DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-mcploop-'));

const baseEnv = { CONTINUUM_DATA_DIR: DATA_DIR, CONTINUUM_STORAGE_BACKEND: 'sqlite', CONTINUUM_PROJECT_ID: PROJECT_ID };
Object.assign(process.env, baseEnv);

const core = await import('@number7even/continuum-core');
const { openStorage, generateIdentity, signEntry, todoTaskRef } = core;

// ── OUT-OF-BAND identity setup (before the server starts; no MCP tool does this) ──
const A = generateIdentity('executor', 'A'), V = generateIdentity('validator', 'V'), H = generateIdentity('human', 'H');
const storage = await openStorage(PROJECT_ID);
for (const kp of [A, V, H]) storage.registerIdentity({ keyId: kp.keyId, role: kp.role, publicKey: kp.publicKey });
const good = storage.createTodo({ title: 'harden auth (passing)', status: 'in_progress' });
const bad = storage.createTodo({ title: 'harden auth (failing verify)', status: 'in_progress' });

const sign = (kind, todoId, kp, payload) =>
  signEntry({ kind, taskRef: todoTaskRef(todoId), at: new Date().toISOString(), by: kp.keyId, role: kp.role, payload }, kp);

// ── Spawn the real HTTP/SSE server ───────────────────────────────────────────
const server = spawn('node', [HTTP_BIN], {
  env: { ...process.env, CONTINUUM_HTTP_TOKEN: TOKEN, CONTINUUM_HTTP_PORT: String(PORT), ...baseEnv },
  stdio: ['ignore', 'inherit', 'pipe'],
});
let ready = false, errOut = '';
server.stderr.on('data', c => { const s = c.toString(); errOut += s; if (s.includes('listening on')) ready = true; });
const deadline = Date.now() + 10000;
while (!ready && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
if (!ready) { console.error('server never listened:\n' + errOut); rmSync(DATA_DIR, { recursive: true, force: true }); process.exit(1); }

const { Client } = await import(resolve(REPO_ROOT, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'));
const { SSEClientTransport } = await import(resolve(REPO_ROOT, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/sse.js'));

const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Continuum-Project': PROJECT_ID };
const client = new Client({ name: 'truth-loop-e2e', version: '0.0.1' }, { capabilities: {} });
const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/sse`), {
  requestInit: { headers },
  eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
});

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) return { error: r.content?.[0]?.text ?? 'error' };
  try { return JSON.parse(r.content[0].text); } catch { return { raw: r.content?.[0]?.text }; }
};

try {
  await client.connect(transport);
  console.log('── the passing round: A → V → T(exit 0) → H → PROVEN ──────────────────');

  const c1 = await call('continuum_open_claim', { todoId: good.id, entry: sign('claim', good.id, A, { statement: 'auth hardened', verifyCommand: 'exit 0' }) });
  check('after A claim → UNVERIFIED', c1.verdict === 'UNVERIFIED', c1.verdict ?? c1.error);

  const c2 = await call('continuum_validate', { todoId: good.id, entry: sign('validation', good.id, V, { verdict: 'confirm', reasoning: 'scope clean' }) });
  check('after V confirm + T exit 0 → PENDING_HUMAN', c2.verdict === 'PENDING_HUMAN', `${c2.verdict} test=${JSON.stringify(c2.test)}`);

  // P9: an executor key CANNOT attest.
  const forge = await call('continuum_attest', { todoId: good.id, entry: sign('decision', good.id, A, { decision: 'accept' }) });
  check('P9: attest with executor key REJECTED', !!forge.error && /human/i.test(forge.error), forge.error ?? `verdict=${forge.verdict}`);

  const c3 = await call('continuum_attest', { todoId: good.id, entry: sign('decision', good.id, H, { decision: 'accept' }) });
  check('after H accept → PROVEN (finalized)', c3.verdict === 'PROVEN' && c3.finalized === true, c3.verdict ?? c3.error);

  console.log('── the failing round: T is a veto even the human cannot override ───────');
  await call('continuum_open_claim', { todoId: bad.id, entry: sign('claim', bad.id, A, { statement: 'claims done', verifyCommand: 'exit 1' }) });
  const bv = await call('continuum_validate', { todoId: bad.id, entry: sign('validation', bad.id, V, { verdict: 'confirm', reasoning: 'looks ok' }) });
  check('failing verify → REFUTED', bv.verdict === 'REFUTED', `${bv.verdict} test=${JSON.stringify(bv.test)}`);
  const ba = await call('continuum_attest', { todoId: bad.id, entry: sign('decision', bad.id, H, { decision: 'accept' }) });
  check('H accept CANNOT rescue a REFUTED task', ba.verdict === 'REFUTED', ba.verdict ?? ba.error);

  console.log('── get_todos surfaces the true verdict + gated board column ───────────');
  const list = await call('continuum_get_todos', {});
  const g = list.todos?.find(t => t.id === good.id), b = list.todos?.find(t => t.id === bad.id);
  check('passing todo → verdict PROVEN, column DONE', g?.ledgerVerdict === 'PROVEN' && g?.boardColumn === 'DONE', `${g?.ledgerVerdict}/${g?.boardColumn}`);
  check('failing todo → verdict REFUTED, column FAILED', b?.ledgerVerdict === 'REFUTED' && b?.boardColumn === 'FAILED', `${b?.ledgerVerdict}/${b?.boardColumn}`);

  await client.close();
} catch (e) {
  console.error('E2E error:', e); results.push(false);
}

server.kill('SIGTERM');
await new Promise(r => setTimeout(r, 200));
rmSync(DATA_DIR, { recursive: true, force: true });

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length && results.length >= 8) {
  console.log('MCP_TRUTH_LOOP_VERIFY: GREEN — over a live server, DONE is reachable only through a full');
  console.log('A·V·T·H TruthBlock; attest is unreachable by an agent; T is a veto the human cannot override.');
  process.exit(0);
} else { console.log('MCP_TRUTH_LOOP_VERIFY: RED'); process.exit(1); }
