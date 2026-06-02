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

function mockReq(opts: { authorization?: string; path?: string } = {}): {
  headers: Record<string, string>;
  path: string;
  user?: unknown;
} {
  return {
    headers: opts.authorization ? { authorization: opts.authorization } : {},
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
