#!/usr/bin/env node
/**
 * verify-console-board.mjs — proves the console board is wired to the TRUE cryptographic state.
 *
 * Drives the exact data path the UI uses, over a real running engine:
 *   1. get_todos emits boardColumn — a PENDING_HUMAN task shows in REVIEW (what the board renders).
 *   2. the P9 boundary holds from the console shape: a non-human decision is REJECTED.
 *   3. THE ATTEST BUTTON — replicated byte-for-byte from /api/attest: load the human key, sign a
 *      decision with the CONSOLE'S OWN signer (apps/console/lib/truth-sign.mjs), call
 *      continuum_attest. That the engine ACCEPTS it proves the console's canonical form matches
 *      core's (a drift would fail here, loudly).
 *   4. after attest the card jumps to DONE (boardColumn PROVEN → DONE).
 *
 *   node scripts/verify-console-board.mjs
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
const PORT = 19878 + Math.floor(Math.random() * 900);
const PROJECT_ID = 'console-board-test';
const DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-console-'));
const KEY_PATH = join(DATA_DIR, 'human-key.json');
const baseEnv = { CONTINUUM_DATA_DIR: DATA_DIR, CONTINUUM_STORAGE_BACKEND: 'sqlite', CONTINUUM_PROJECT_ID: PROJECT_ID, CONTINUUM_HUMAN_KEY_PATH: KEY_PATH };
Object.assign(process.env, baseEnv);

const core = await import('@number7even/continuum-core');
const { openStorage, generateIdentity, signEntry, todoTaskRef } = core;
// The console's OWN signer — the exact code /api/attest runs. One source of truth.
const { generateHumanKey, saveHumanKey, loadHumanKey, signDecision } = await import(resolve(REPO_ROOT, 'apps/console/lib/truth-sign.mjs'));

// ── OUT-OF-BAND setup (before the engine starts) ──
const A = generateIdentity('executor', 'A'), V = generateIdentity('validator', 'V');
const storage = await openStorage(PROJECT_ID);
for (const kp of [A, V]) storage.registerIdentity({ keyId: kp.keyId, role: kp.role, publicKey: kp.publicKey });
const H = generateHumanKey('human'); saveHumanKey(H);                              // console lib mints + saves the key
storage.registerIdentity({ keyId: H.keyId, role: 'human', publicKey: H.publicKey }); // register PUBLIC half in the engine
const todo = storage.createTodo({ title: 'ship the board wiring', status: 'in_progress' });

const mk = (kind, kp, payload) => signEntry({ kind, taskRef: todoTaskRef(todo.id), at: new Date().toISOString(), by: kp.keyId, role: kp.role, payload }, kp);

// ── spawn the real engine ──
const server = spawn('node', [HTTP_BIN], { env: { ...process.env, CONTINUUM_HTTP_TOKEN: TOKEN, CONTINUUM_HTTP_PORT: String(PORT), ...baseEnv }, stdio: ['ignore', 'inherit', 'pipe'] });
let ready = false, errOut = '';
server.stderr.on('data', c => { const s = c.toString(); errOut += s; if (s.includes('listening on')) ready = true; });
const deadline = Date.now() + 10000;
while (!ready && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
if (!ready) { console.error('engine never listened:\n' + errOut); rmSync(DATA_DIR, { recursive: true, force: true }); process.exit(1); }

const { Client } = await import(resolve(REPO_ROOT, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'));
const { SSEClientTransport } = await import(resolve(REPO_ROOT, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/sse.js'));
const headers = { Authorization: `Bearer ${TOKEN}`, 'X-Continuum-Project': PROJECT_ID };
const client = new Client({ name: 'console-board-e2e', version: '0.0.1' }, { capabilities: {} });
const transport = new SSEClientTransport(new URL(`http://localhost:${PORT}/sse`), {
  requestInit: { headers }, eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }) },
});

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) return { error: r.content?.[0]?.text ?? 'error' };
  try { return JSON.parse(r.content[0].text); } catch { return { raw: r.content?.[0]?.text }; }
};
const cardFor = async (id) => (await call('continuum_get_todos', {})).todos?.find(t => t.id === id);

try {
  await client.connect(transport);

  console.log('── push the task through A → V → T (as the board would show it) ────────');
  await call('continuum_open_claim', { todoId: todo.id, entry: mk('claim', A, { statement: 'board wired', verifyCommand: 'exit 0' }) });
  await call('continuum_validate', { todoId: todo.id, entry: mk('validation', V, { verdict: 'confirm', reasoning: 'columns map to ledger' }) });
  const before = await cardFor(todo.id);
  check('board renders REVIEW + PENDING_HUMAN (loudly demands a signature)', before?.boardColumn === 'REVIEW' && before?.ledgerVerdict === 'PENDING_HUMAN', `${before?.ledgerVerdict}/${before?.boardColumn}`);

  console.log('── the Attest button — the console signs with the human key ────────────');
  // P9: a non-human decision must be refused (an agent clicking would get nowhere).
  const forge = await call('continuum_attest', { todoId: todo.id, entry: mk('decision', A, { decision: 'accept' }) });
  check('P9: non-human attest rejected', !!forge.error && /human/i.test(forge.error), forge.error);

  const hk = loadHumanKey();
  check('human key loads from disk (0600, local)', !!hk && hk.role === 'human', hk?.keyId);
  const decision = signDecision(hk, todo.id, 'accept');   // ← the exact code /api/attest runs
  const att = await call('continuum_attest', { todoId: todo.id, entry: decision });
  check('console-signed attest ACCEPTED by engine → PROVEN', att.verdict === 'PROVEN' && att.finalized === true, att.verdict ?? att.error);

  const after = await cardFor(todo.id);
  check('the card jumps to DONE', after?.boardColumn === 'DONE' && after?.ledgerVerdict === 'PROVEN', `${after?.ledgerVerdict}/${after?.boardColumn}`);

  await client.close();
} catch (e) { console.error('E2E error:', e); results.push(false); }

server.kill('SIGTERM');
await new Promise(r => setTimeout(r, 200));
rmSync(DATA_DIR, { recursive: true, force: true });

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length && results.length >= 5) {
  console.log('CONSOLE_BOARD_VERIFY: GREEN — the board renders the true ledger state; the Attest button');
  console.log('mints the P9 leap with the operator\'s local key; a PENDING_HUMAN card jumps to DONE on accept.');
  process.exit(0);
} else { console.log('CONSOLE_BOARD_VERIFY: RED'); process.exit(1); }
