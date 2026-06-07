/**
 * build-server.test.ts — W27-2 tenant-scoped factory invariants.
 *
 * Asserts:
 *   - buildServer(tenantA) and buildServer(tenantB) return distinct
 *     Server instances (no shared state)
 *   - Each handle's storage points at a DIFFERENT on-disk path
 *     (storage.dataLocation() encodes the tenant component)
 *   - Adversarial tenantId input throws at the factory boundary (not
 *     downstream after a file is created)
 *   - W27-2 STATIC GREP GATE: no file under src/tools/ may reference
 *     `openStorage` directly. Every tool handler reaches storage
 *     through ServerHandle.storage. Drift-protection: future tool
 *     authors cannot accidentally bypass the tenant factory.
 *
 * Run after build:
 *   node --test packages/mcp-server/dist/build-server.test.js
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from './server.js';

// ── Isolated tmpdir-rooted env for the live-storage assertions ────────────────

let dataDir: string;
let originalDataDir: string | undefined;
let originalBackend: string | undefined;

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  originalBackend = process.env.CONTINUUM_STORAGE_BACKEND;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-w27-buildsv-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  // sqlite path — fast, no embedder/ruvector startup cost.
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
});

after(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.CONTINUUM_DATA_DIR;
  else process.env.CONTINUUM_DATA_DIR = originalDataDir;
  if (originalBackend === undefined) delete process.env.CONTINUUM_STORAGE_BACKEND;
  else process.env.CONTINUUM_STORAGE_BACKEND = originalBackend;
});

// ── Tenant-scoped factory invariants ──────────────────────────────────────────

test('buildServer(tenantA) and buildServer(tenantB) return DIFFERENT instances', () => {
  const a = buildServer('alpha');
  const b = buildServer('bravo');
  try {
    assert.notEqual(a.server, b.server, 'Server instances must differ');
    assert.notEqual(a.storage, b.storage, 'StorageBackend instances must differ');
    assert.equal(a.tenantId, 'alpha');
    assert.equal(b.tenantId, 'bravo');
  } finally {
    a.close();
    b.close();
  }
});

test('buildServer: each tenant\'s storage points at a distinct on-disk path', () => {
  const a = buildServer('alpha');
  const b = buildServer('bravo');
  try {
    const la = a.storage.dataLocation();
    const lb = b.storage.dataLocation();
    assert.notEqual(la, lb, 'data locations must differ between tenants');
    assert.match(la, /\/alpha\//);
    assert.match(lb, /\/bravo\//);
    // Both must be UNDER the tmpdir we set, never escape it.
    assert.ok(la.startsWith(dataDir), `alpha path should be under tmpdir: ${la}`);
    assert.ok(lb.startsWith(dataDir), `bravo path should be under tmpdir: ${lb}`);
  } finally {
    a.close();
    b.close();
  }
});

test('buildServer: same tenantId in sequence still creates a fresh handle', () => {
  // The factory is per-call (no caching at this layer — that\'s W27-5\'s
  // TenantRegistry job). Two calls with the same tenant produce two
  // independent Server instances over the same DB file.
  const a1 = buildServer('charlie');
  const a2 = buildServer('charlie');
  try {
    assert.notEqual(a1.server, a2.server, 'Server instances differ per call');
    assert.equal(a1.storage.dataLocation(), a2.storage.dataLocation());
  } finally {
    a1.close();
    a2.close();
  }
});

test('buildServer: case-folds tenantId via sanitiseTenantId', () => {
  // The W22-2 case-fold rule (Issue #9) now applies at the factory.
  // buildServer("Alpha") and buildServer("alpha") must map to the same
  // DB file — otherwise two HTTP requests with different header casing
  // would land in different tenants.
  const u = buildServer('Alpha');
  const l = buildServer('alpha');
  try {
    assert.equal(u.tenantId, 'alpha');
    assert.equal(l.tenantId, 'alpha');
    assert.equal(u.storage.dataLocation(), l.storage.dataLocation());
  } finally {
    u.close();
    l.close();
  }
});

// ── Adversarial input rejected AT THE BOUNDARY ────────────────────────────────

test('buildServer: path-traversal tenantId throws (not "succeed silently")', () => {
  assert.throws(
    () => buildServer('../etc/passwd'),
    /invalid tenant identifier/,
    'path-traversal must throw at the factory, not reach the filesystem',
  );
});

test('buildServer: empty tenantId throws', () => {
  assert.throws(() => buildServer(''), /invalid tenant identifier/);
});

test('buildServer: null-byte tenantId throws', () => {
  assert.throws(
    () => buildServer('tenant\x00null'),
    /invalid tenant identifier/,
  );
});

// ── W27-2 STATIC GREP GATE — drift protection ─────────────────────────────────
//
// No file under packages/mcp-server/src/tools/ may reference openStorage
// directly. This is THE architectural invariant of W27-2: every tool
// handler reaches storage through the ServerHandle.storage that
// buildServer(tenantId) injected. Bypassing this rule means a tool
// could read/write a different tenant\'s data than the one the caller
// authenticated for — exactly the leak Path A is built to prevent.

test('W27-2 static gate: no openStorage call inside packages/mcp-server/src/tools/', () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  // We run from dist/, so go up one level for the tools/ dir at runtime.
  // The check, however, is on the SOURCE — open the .ts files directly
  // so the assertion reads what humans write, not what tsc emits.
  const toolsSrcDir = resolve(__dirname, '..', 'src', 'tools');
  const offenders: string[] = [];
  for (const entry of readdirSync(toolsSrcDir)) {
    if (!entry.endsWith('.ts')) continue;
    const full = join(toolsSrcDir, entry);
    const body = readFileSync(full, 'utf-8');
    // Allow `openStorage` only inside a comment line — but the simplest
    // rule that holds the invariant tightly is "no occurrence at all."
    // If a tool ever genuinely needs to enumerate tenants, we add a
    // dedicated admin API rather than punching a hole in this gate.
    if (/\bopenStorage\b/.test(body)) {
      offenders.push(entry);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `W27-2 invariant violated: tool handler(s) reference openStorage directly:\n  ${offenders.join('\n  ')}\nUse the ServerHandle.storage passed in by buildServer(tenantId) instead.`,
  );
});

// Same invariant for resources/ and prompts/ — they also see storage via
// the buildServer-injected backend, never via the global factory.

test('W27-2 static gate: no openStorage call inside packages/mcp-server/src/resources/', () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const dir = resolve(__dirname, '..', 'src', 'resources');
  const offenders: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.ts')) continue;
    const body = readFileSync(join(dir, entry), 'utf-8');
    if (/\bopenStorage\b/.test(body)) offenders.push(entry);
  }
  assert.deepEqual(offenders, []);
});

test('W27-2 static gate: no openStorage call inside packages/mcp-server/src/prompts/', () => {
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const dir = resolve(__dirname, '..', 'src', 'prompts');
  const offenders: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.ts')) continue;
    const body = readFileSync(join(dir, entry), 'utf-8');
    if (/\bopenStorage\b/.test(body)) offenders.push(entry);
  }
  assert.deepEqual(offenders, []);
});
