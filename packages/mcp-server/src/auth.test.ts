/**
 * packages/mcp-server/src/auth.test.ts
 *
 * SPRINT-2026-W24 · W24-2 (JWT validation middleware).
 *
 * Tests the auth middleware in isolation — does NOT spin up the full
 * Express app or buildServer(). Each test builds a mock request/response,
 * runs the middleware, and asserts on the outcome (status code, req.user
 * populated, next() called).
 *
 * JWT mode tests use a real RSA keypair (generated per-test for hermetic
 * isolation) and a minimal in-process JWKS server so the middleware's
 * `createRemoteJWKSet` fetches from a real URL.
 *
 * Run after build via:
 *   node --test packages/mcp-server/dist/auth.test.js
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import {
  exportJWK,
  generateKeyPair,
  type KeyLike,
  SignJWT,
} from 'jose';

import {
  createAuthMiddleware,
  resolveAuthConfig,
  type AuthConfig,
} from './auth.js';

// ── Test helpers ────────────────────────────────────────────────────────────

interface MockRes {
  statusCode: number | null;
  body: unknown;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
}

function mockReq(opts: {
  authorization?: string;
  path?: string;
  /** Extra headers, e.g. { 'x-continuum-project': 'alpha' }. Express
   *  normalises header names to lowercase — the middleware reads them
   *  in lowercase form, so tests should pass them that way too. */
  headers?: Record<string, string>;
} = {}): {
  headers: Record<string, string>;
  path: string;
  user?: unknown;
  continuum?: unknown;
} {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.authorization) headers.authorization = opts.authorization;
  return {
    headers,
    path: opts.path ?? '/sse',
  };
}

function mockRes(): MockRes {
  const r: MockRes = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return r;
}

async function runMiddleware(
  config: AuthConfig,
  req: ReturnType<typeof mockReq>,
): Promise<{ res: MockRes; nextCalled: boolean }> {
  const middleware = createAuthMiddleware(config);
  const res = mockRes();
  let nextCalled = false;
  const next = (): void => {
    nextCalled = true;
  };
  // The Express type for middleware is callable as (req, res, next).
  // We cast through `unknown` because our mock shapes are minimal.
  await (middleware as unknown as (
    r: unknown,
    s: unknown,
    n: () => void,
  ) => Promise<void> | void)(req, res, next);
  return { res, nextCalled };
}

// ── Mock JWKS issuer (for JWT-mode tests) ──────────────────────────────────

interface MockIssuer {
  issuer: string;
  privateKey: KeyLike;
  server: Server;
  close(): Promise<void>;
}

async function startMockIssuer(): Promise<MockIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('mock issuer: no address');
  const port = addr.port;
  return {
    issuer: `http://127.0.0.1:${port}`,
    privateKey,
    server,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

async function issueToken(
  privateKey: KeyLike,
  issuer: string,
  audience: string,
  claims: Record<string, unknown> = {},
  opts: { exp?: string; sub?: string; kid?: string } = {},
): Promise<string> {
  return new SignJWT({ tenant: 'acme-corp', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'test-key-1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(opts.sub ?? 'user-123')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

// ── resolveAuthConfig tests ────────────────────────────────────────────────

test('resolveAuthConfig: shared-secret mode when only HTTP_TOKEN set', () => {
  const cfg = resolveAuthConfig({ CONTINUUM_HTTP_TOKEN: 'abc123' });
  assert.equal(cfg.mode, 'shared-secret');
  if (cfg.mode === 'shared-secret') assert.equal(cfg.token, 'abc123');
});

test('resolveAuthConfig: jwt mode when JWT_ISSUER + JWT_AUDIENCE set', () => {
  const cfg = resolveAuthConfig({
    CONTINUUM_JWT_ISSUER: 'https://auth.example.com',
    CONTINUUM_JWT_AUDIENCE: 'continuum-api',
  });
  assert.equal(cfg.mode, 'jwt');
  if (cfg.mode === 'jwt') {
    assert.equal(cfg.issuer, 'https://auth.example.com');
    assert.equal(cfg.audience, 'continuum-api');
    assert.equal(cfg.tenantClaim, 'tenant'); // default
  }
});

test('resolveAuthConfig: jwt mode overrides shared-secret when both set', () => {
  const cfg = resolveAuthConfig({
    CONTINUUM_HTTP_TOKEN: 'abc123',
    CONTINUUM_JWT_ISSUER: 'https://auth.example.com',
    CONTINUUM_JWT_AUDIENCE: 'continuum-api',
  });
  assert.equal(cfg.mode, 'jwt');
});

test('resolveAuthConfig: throws when neither mode is configured', () => {
  assert.throws(() => resolveAuthConfig({}), /No auth configured/);
});

test('resolveAuthConfig: custom tenant claim via env', () => {
  const cfg = resolveAuthConfig({
    CONTINUUM_JWT_ISSUER: 'https://auth.example.com',
    CONTINUUM_JWT_AUDIENCE: 'continuum-api',
    CONTINUUM_JWT_TENANT_CLAIM: 'org_id',
  });
  if (cfg.mode === 'jwt') assert.equal(cfg.tenantClaim, 'org_id');
});

// ── Shared-secret mode tests ───────────────────────────────────────────────

test('shared-secret: valid token passes through to next()', async () => {
  const { res, nextCalled } = await runMiddleware(
    { mode: 'shared-secret', token: 'topsecret' },
    mockReq({ authorization: 'Bearer topsecret' }),
  );
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('shared-secret: wrong token returns 401', async () => {
  const { res, nextCalled } = await runMiddleware(
    { mode: 'shared-secret', token: 'topsecret' },
    mockReq({ authorization: 'Bearer wrong' }),
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('shared-secret: missing Authorization header returns 401', async () => {
  const { res, nextCalled } = await runMiddleware(
    { mode: 'shared-secret', token: 'topsecret' },
    mockReq({}),
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('shared-secret: /healthz path exempt — passes with no auth', async () => {
  const { res, nextCalled } = await runMiddleware(
    { mode: 'shared-secret', token: 'topsecret' },
    mockReq({ path: '/healthz' }),
  );
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

// ── JWT mode tests ─────────────────────────────────────────────────────────

test('jwt: valid token passes + populates req.user with sub + tenant', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(issuer.privateKey, issuer.issuer, 'continuum-api');
    const req = mockReq({ authorization: `Bearer ${token}` });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, null, `unexpected status: ${res.statusCode} body=${JSON.stringify(res.body)}`);
    assert.equal(nextCalled, true);
    assert.ok(req.user, 'req.user should be populated');
    const user = req.user as { sub: string; tenant: string | undefined };
    assert.equal(user.sub, 'user-123');
    assert.equal(user.tenant, 'acme-corp');
  } finally {
    await issuer.close();
  }
});

test('jwt: missing Bearer prefix returns 401', async () => {
  const issuer = await startMockIssuer();
  try {
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      mockReq({ authorization: 'NotBearer token' }),
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    await issuer.close();
  }
});

test('jwt: wrong audience claim returns 401', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(issuer.privateKey, issuer.issuer, 'WRONG-aud');
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      mockReq({ authorization: `Bearer ${token}` }),
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    await issuer.close();
  }
});

test('jwt: expired token returns 401', async () => {
  const issuer = await startMockIssuer();
  try {
    // Set expiry in the past via a negative offset (jose accepts ISO + relative).
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      {},
      { exp: '-1s' },
    );
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      mockReq({ authorization: `Bearer ${token}` }),
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    await issuer.close();
  }
});

test('jwt: garbage token (not a JWT) returns 401', async () => {
  const issuer = await startMockIssuer();
  try {
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      mockReq({ authorization: 'Bearer this.is.not-a-real-jwt' }),
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  } finally {
    await issuer.close();
  }
});

test('jwt: /healthz exempt — passes with no token', async () => {
  const issuer = await startMockIssuer();
  try {
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      mockReq({ path: '/healthz' }),
    );
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  } finally {
    await issuer.close();
  }
});

test('jwt: custom tenant claim extracts to req.user.tenant', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      { org_id: 'acme-org-42' }, // custom claim name
    );
    const req = mockReq({ authorization: `Bearer ${token}` });
    const { nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'org_id', // configured to read org_id
      },
      req,
    );
    assert.equal(nextCalled, true);
    const user = req.user as { tenant: string | undefined };
    assert.equal(user.tenant, 'acme-org-42');
  } finally {
    await issuer.close();
  }
});

// ── W27-3: tenant routing via req.continuum ───────────────────────────────────
//
// Seven new cases (16 existing → 23 total) covering:
//   1. JWT claim + matching X-Continuum-Project header → req.continuum set
//   2. JWT claim + mismatched header → 403 with structured body
//   3. JWT claim + no header → req.continuum.tenantId = claim
//   4. JWT mode with no tenant claim → 400
//   5. JWT claim contains '../' (path traversal) → 400
//   6. Shared-secret + CONTINUUM_PROJECT_ID set → req.continuum.tenantId = env
//   7. stdio bypass — structural assertion that the stdio entry point
//      does NOT import the auth module (mechanical proof that
//      CONTINUUM_PROJECT_ID stays the workspace identifier on the
//      Journey 3 zero-config path).
//
// Tests preserve req.user behavior — the existing 16 cases still pass.

test('W27-3: jwt mode + matching X-Continuum-Project header → req.continuum.tenantId set', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      { tenant: 'alpha' },
    );
    const req = mockReq({
      authorization: `Bearer ${token}`,
      headers: { 'x-continuum-project': 'alpha' },
    });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, null);
    assert.equal(nextCalled, true);
    const ctx = req.continuum as { tenantId: string };
    assert.equal(ctx.tenantId, 'alpha');
  } finally {
    await issuer.close();
  }
});

test('W27-3: jwt mode + matching header (different case) still passes — sanitiser case-folds', async () => {
  // Sub-case of #1: case-folding through sanitiseTenantId means
  // header='ALPHA' and claim='alpha' compare EQUAL after sanitisation.
  // Prevents bypass where attacker tweaks case to evade the gate.
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      { tenant: 'alpha' },
    );
    const req = mockReq({
      authorization: `Bearer ${token}`,
      headers: { 'x-continuum-project': 'ALPHA' },
    });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, null, `expected pass, got ${res.statusCode} ${JSON.stringify(res.body)}`);
    assert.equal(nextCalled, true);
    const ctx = req.continuum as { tenantId: string };
    assert.equal(ctx.tenantId, 'alpha');
  } finally {
    await issuer.close();
  }
});

test('W27-3: jwt mode + MISMATCHED X-Continuum-Project header → 403 structured body', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      { tenant: 'alpha' },
    );
    const req = mockReq({
      authorization: `Bearer ${token}`,
      headers: { 'x-continuum-project': 'bravo' },
    });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
    const body = res.body as {
      error: string;
      expected: string;
      asserted: string;
    };
    assert.equal(body.error, 'tenant-claim-mismatch');
    assert.equal(body.expected, 'alpha');
    assert.equal(body.asserted, 'bravo');
    // Crucially: req.continuum must NOT be set on a rejected request.
    assert.equal(req.continuum, undefined);
  } finally {
    await issuer.close();
  }
});

test('W27-3: jwt mode + valid claim + NO header → req.continuum.tenantId = claim', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      { tenant: 'alpha' },
    );
    const req = mockReq({ authorization: `Bearer ${token}` });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, null);
    assert.equal(nextCalled, true);
    const ctx = req.continuum as { tenantId: string };
    assert.equal(ctx.tenantId, 'alpha');
  } finally {
    await issuer.close();
  }
});

test('W27-3: jwt mode + token with NO tenant claim → 400', async () => {
  const issuer = await startMockIssuer();
  try {
    // Issue a token where the tenant claim is explicitly empty/absent.
    // SignJWT with no `tenant` claim — issueToken's default sets it,
    // so we override with empty-string-coerced-to-undefined-shape.
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer(issuer.issuer)
      .setAudience('continuum-api')
      .setSubject('user-noclaim')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(issuer.privateKey);
    const req = mockReq({ authorization: `Bearer ${token}` });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
    const body = res.body as { error: string };
    assert.match(body.error, /tenant claim missing/);
  } finally {
    await issuer.close();
  }
});

test('W27-3: jwt mode + claim contains "../" → 400 (sanitiseTenantId rejects)', async () => {
  const issuer = await startMockIssuer();
  try {
    const token = await issueToken(
      issuer.privateKey,
      issuer.issuer,
      'continuum-api',
      { tenant: '../etc/passwd' },
    );
    const req = mockReq({ authorization: `Bearer ${token}` });
    const { res, nextCalled } = await runMiddleware(
      {
        mode: 'jwt',
        issuer: issuer.issuer,
        audience: 'continuum-api',
        tenantClaim: 'tenant',
      },
      req,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
    const body = res.body as { error: string };
    assert.match(body.error, /tenant claim invalid/);
    // req.continuum stays undefined on a rejected request.
    assert.equal(req.continuum, undefined);
  } finally {
    await issuer.close();
  }
});

test('W27-3: shared-secret mode + CONTINUUM_PROJECT_ID set → req.continuum.tenantId = env', async () => {
  const original = process.env.CONTINUUM_PROJECT_ID;
  process.env.CONTINUUM_PROJECT_ID = 'shared-tenant-x';
  try {
    const { res, nextCalled } = await runMiddleware(
      { mode: 'shared-secret', token: 'topsecret' },
      mockReq({ authorization: 'Bearer topsecret' }),
    );
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    // The test runMiddleware doesn't return req — re-check via direct
    // middleware invocation so we can inspect req.continuum.
    const req = mockReq({ authorization: 'Bearer topsecret' });
    const middleware = createAuthMiddleware({ mode: 'shared-secret', token: 'topsecret' });
    let n = false;
    await (middleware as unknown as (r: unknown, s: unknown, next: () => void) => Promise<void> | void)(
      req,
      mockRes(),
      () => {
        n = true;
      },
    );
    assert.equal(n, true);
    const ctx = req.continuum as { tenantId: string };
    assert.equal(ctx.tenantId, 'shared-tenant-x');
  } finally {
    if (original === undefined) delete process.env.CONTINUUM_PROJECT_ID;
    else process.env.CONTINUUM_PROJECT_ID = original;
  }
});

// ── stdio bypass — Journey 3 zero-config preservation ─────────────────────────
//
// Mechanical proof, NOT honor system. The stdio entry point
// (packages/mcp-server/src/index.ts) MUST NOT import the auth module.
// If it did, future drift could subject the local CLI workflow to
// JWT verification — breaking the Journey 3 promise.
//
// Read the SOURCE .ts (not the dist .js) so the rule catches drift
// before it lands in dist.

test('W27-3 stdio bypass: src/index.ts does NOT import auth module', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const stdioEntry = resolve(__dirname, '..', 'src', 'index.ts');
  const body = readFileSync(stdioEntry, 'utf-8');
  // No `from './auth.js'` (or '.auth' / '.auth.ts'), no
  // `createAuthMiddleware`, no `resolveAuthConfig`.
  assert.doesNotMatch(
    body,
    /\bfrom\s+['"]\.\/auth(?:\.js|\.ts)?['"]/,
    'src/index.ts (stdio) must not import auth — Journey 3 zero-config bypass',
  );
  assert.doesNotMatch(body, /createAuthMiddleware/);
  assert.doesNotMatch(body, /resolveAuthConfig/);
});
