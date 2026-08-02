#!/usr/bin/env node
// verify-observation-endpoint.mjs — proof-gate for the by-id verification REST route (Task B).
//
// GET /api/observation/:id is the lightweight surface a scheduler (CROOMA/PodGeni intake wall)
// uses to re-verify a seal just-in-time at publish time WITHOUT embedding a full MCP client
// (CROOMA_TERMINAL_BRIEF §II.5). This gate boots the REAL engine (dist/http.js) with shared-secret
// auth, seeds a sealed type='decision' Observation into one tenant's storage, and proves:
//   • an AUTHED, tenant-scoped GET returns the verification projection (subject.contentHash + verdict
//     + operator + type) — and NEVER the raw content (P1, minimal surface);
//   • an UNAUTHENTICATED GET is 401 (the wall can't be read without a credential);
//   • an unknown id is 404 (fail-closed — a scheduler treats 404 as "do not publish");
//   • the SAME id requested as a DIFFERENT tenant is 404 — cross-tenant reads are structurally
//     impossible (per-tenant storage), so this endpoint cannot leak another workspace's seal.
//
//   node scripts/verify-observation-endpoint.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(new URL('..', import.meta.url).pathname);
const DATA = mkdtempSync(join(tmpdir(), 'amf-obs-endpoint-'));
const PORT = 7893;
const TOKEN = 'gate-shared-secret-token';
const BASE = `http://127.0.0.1:${PORT}`;
const TENANT = 'gate-tenant';
const OTHER = 'other-tenant';
const DEC_ID = 'dddddddd-1111-2222-3333-444444444444';
const HASH = 'sha256:abc123def456';

// Set on THIS process too — the seed below calls openStorage() in-process, so it must land in the
// same DATA dir + backend the server will read. (Bug caught by this gate on first run: seeding only
// the child env wrote the decision to the default data dir → the server read an empty tenant → 404.)
process.env.CONTINUUM_DATA_DIR = DATA;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const env = {
  ...process.env,
  CONTINUUM_DATA_DIR: DATA,
  CONTINUUM_STORAGE_BACKEND: 'sqlite',
  CONTINUUM_HTTP_TOKEN: TOKEN,
  CONTINUUM_HTTP_PORT: String(PORT),
};
delete env.CONTINUUM_PROJECT_ID;      // unset → per-request X-Continuum-Project header routing
delete env.CONTINUUM_JWT_ISSUER;      // force shared-secret mode
delete env.CONTINUUM_JWT_AUDIENCE;

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

// 1. Seed the sealed decision into the TENANT's storage (before the server opens it).
{
  const { openStorage } = await import(new URL('../packages/core/dist/index.js', import.meta.url).href);
  const s = openStorage(TENANT);
  s.upsertSource('authorship', 'docs', {});
  s.upsertObservation({
    id: DEC_ID, sourceId: 'authorship', type: 'decision',
    content: 'SECRET-DRAFT-BODY-must-not-leak', timestamp: new Date().toISOString(), refs: [],
    metadata: { subject: { contentHash: HASH }, verdict: 'accept', operator: 'riaan', contentHash: HASH },
  });
  s.close?.();
}

// 2. Boot the real engine.
const server = spawn(process.execPath, [join(repo, 'packages/mcp-server/dist/http.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
// SIGTERM (not SIGKILL) → http.ts's graceful shutdown closes storage cleanly; SIGKILL mid-open
// aborts the native sqlite/ruvector binding (libc++abi, exit 134).
const stop = () => { try { server.kill('SIGTERM'); } catch { /* */ } };
process.on('exit', stop);

async function waitForReady(ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/healthz`); if (r.status === 200) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const ready = await waitForReady();
check('the engine boots + /healthz is 200', ready);
if (!ready) { stop(); rmSync(DATA, { recursive: true, force: true }); console.log('\nOBS_ENDPOINT_VERIFY: RED (server never became ready)'); process.exit(1); }

const authed = { Authorization: `Bearer ${TOKEN}`, 'X-Continuum-Project': TENANT };

// 3. Authed, tenant-scoped GET → 200 verification projection, NO raw content.
{
  const r = await fetch(`${BASE}/api/observation/${DEC_ID}`, { headers: authed });
  const body = await r.json().catch(() => ({}));
  check('authed by-id GET returns 200', r.status === 200, `status=${r.status}`);
  check('the projection carries the seal (subject.contentHash + verdict + type)',
    body?.subject?.contentHash === HASH && body?.verdict === 'accept' && body?.type === 'decision', `hash=${body?.subject?.contentHash}`);
  check('the projection carries operator provenance', body?.operator === 'riaan', body?.operator);
  check('the raw content is NOT leaked (minimal surface, P1)', !('content' in body), Object.keys(body).join(','));
}

// 4. Unauthenticated → 401.
{
  const r = await fetch(`${BASE}/api/observation/${DEC_ID}`, { headers: { 'X-Continuum-Project': TENANT } });
  check('an unauthenticated GET is 401', r.status === 401, `status=${r.status}`);
}

// 5. Unknown id → 404 (fail-closed).
{
  const r = await fetch(`${BASE}/api/observation/00000000-dead-dead-dead-000000000000`, { headers: authed });
  check('an unknown id is 404 (scheduler fails closed)', r.status === 404, `status=${r.status}`);
}

// 6. Cross-tenant: the SAME id as OTHER tenant → 404 (structural isolation).
{
  const r = await fetch(`${BASE}/api/observation/${DEC_ID}`, { headers: { Authorization: `Bearer ${TOKEN}`, 'X-Continuum-Project': OTHER } });
  check('the same id requested as a different tenant is 404 (no cross-tenant leak)', r.status === 404, `status=${r.status}`);
}

stop();
rmSync(DATA, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('OBS_ENDPOINT_VERIFY: GREEN — the by-id verification route returns the seal projection to an');
  console.log('authed tenant, hides raw content, and fails closed for unauth / unknown / cross-tenant reads.');
  process.exit(0);
} else { console.log('OBS_ENDPOINT_VERIFY: RED'); process.exit(1); }
