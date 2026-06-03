/**
 * HTTP/SSE auth middleware — shared-secret (V1) + JWT (V1.1 / W24-2).
 *
 * Two mutually-exclusive modes, picked at startup from env vars:
 *
 *   ┌──────────────────────────────┬─────────────────────────────────────────┐
 *   │  Required env                 │  Mode                                   │
 *   ├──────────────────────────────┼─────────────────────────────────────────┤
 *   │  CONTINUUM_HTTP_TOKEN          │  shared-secret (V1 default; backward    │
 *   │                                │  compatible — the Vercel frontend and   │
 *   │                                │  every existing OSS deploy keeps        │
 *   │                                │  working unchanged)                      │
 *   ├──────────────────────────────┼─────────────────────────────────────────┤
 *   │  CONTINUUM_JWT_ISSUER          │  jwt (V1.1; bring-your-own-OAuth via    │
 *   │  + CONTINUUM_JWT_AUDIENCE      │  any OIDC provider — Auth0, Clerk,      │
 *   │                                │  Keycloak, Authelia, etc.). When set,   │
 *   │                                │  shared-secret is IGNORED — pick one.   │
 *   └──────────────────────────────┴─────────────────────────────────────────┘
 *
 * Why mutually exclusive? Operator clarity. Two simultaneously-active auth
 * paths invite "did I get authenticated as the right principal?" confusion.
 * Pick a mode per deployment; switch by flipping env vars.
 *
 * JWT mode contract:
 *   - Token validated against the issuer's JWKS at
 *     <issuer>/.well-known/jwks.json (cached + refreshed by `jose`).
 *   - `iss` claim MUST equal CONTINUUM_JWT_ISSUER.
 *   - `aud` claim MUST equal (or include) CONTINUUM_JWT_AUDIENCE.
 *   - `exp` enforced by `jose` (typical OIDC token lifetime is minutes).
 *   - `sub` extracted to req.user.sub.
 *   - Tenant claim (default `tenant`; configurable via CONTINUUM_JWT_TENANT_CLAIM)
 *     extracted to req.user.tenant. The tenant value is NOT YET used for
 *     routing — that's V1.2 multi-tenant work — but it lands here so the
 *     plumbing exists when V1.2 starts.
 *
 * /healthz is exempt in both modes so orchestrator probes don't need
 * credentials.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { Request, RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// ── Public types ───────────────────────────────────────────────────────────

export interface SharedSecretConfig {
  mode: 'shared-secret';
  token: string;
}

export interface JwtConfig {
  mode: 'jwt';
  issuer: string;
  audience: string;
  tenantClaim: string;
}

export type AuthConfig = SharedSecretConfig | JwtConfig;

/**
 * Per-request principal attached by the JWT middleware. The shared-secret
 * path leaves this undefined (there is no "user" — just a shared key).
 */
export interface AuthenticatedUser {
  sub: string;
  tenant: string | undefined;
  /** Full claims payload, in case downstream code needs more than sub/tenant. */
  claims: Record<string, unknown>;
}

// Augment Express's Request so `req.user` is typed in handlers + tests.
declare module 'express-serve-static-core' {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  interface Request {
    user?: AuthenticatedUser;
  }
}

// ── Config resolution from env ─────────────────────────────────────────────

/**
 * Resolve the auth configuration from process env. Throws with a clear
 * message if neither mode is configured — http.ts calls this at startup so
 * the server refuses to launch in an undecided auth state.
 */
export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const issuer = env.CONTINUUM_JWT_ISSUER?.trim();
  const audience = env.CONTINUUM_JWT_AUDIENCE?.trim();
  if (issuer && audience) {
    return {
      mode: 'jwt',
      issuer,
      audience,
      tenantClaim: env.CONTINUUM_JWT_TENANT_CLAIM?.trim() || 'tenant',
    };
  }
  const token = env.CONTINUUM_HTTP_TOKEN?.trim();
  if (token) {
    return { mode: 'shared-secret', token };
  }
  throw new Error(
    'No auth configured. Set either CONTINUUM_HTTP_TOKEN (shared-secret) OR ' +
      'CONTINUUM_JWT_ISSUER + CONTINUUM_JWT_AUDIENCE (JWT mode).',
  );
}

// ── Middleware factory ─────────────────────────────────────────────────────

/**
 * Path exempted from auth in both modes — orchestrator health probes
 * (Docker HEALTHCHECK, Fly proxy, K8s liveness) call this without creds.
 * /readyz (W24-3) will also be added here when it lands.
 */
const EXEMPT_PATHS = new Set<string>(['/healthz', '/readyz']);

/**
 * Build the Express middleware for the resolved config. Each call returns a
 * stable handler — for JWT mode the underlying remote JWKS is cached inside
 * the closure, so successive requests don't re-fetch the keyset.
 */
export function createAuthMiddleware(config: AuthConfig): RequestHandler {
  if (config.mode === 'shared-secret') {
    return createSharedSecretMiddleware(config);
  }
  return createJwtMiddleware(config);
}

function createSharedSecretMiddleware(config: SharedSecretConfig): RequestHandler {
  const expected = `Bearer ${config.token}`;
  return (req, res, next) => {
    if (EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    if (req.headers.authorization !== expected) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}

function createJwtMiddleware(config: JwtConfig): RequestHandler {
  const issuerNoTrailingSlash = config.issuer.replace(/\/$/, '');
  const jwksUri = `${issuerNoTrailingSlash}/.well-known/jwks.json`;
  // createRemoteJWKSet handles caching + rotation. Keys are fetched on first
  // use and cached; new keys are auto-discovered when a token signs with a
  // kid we haven't seen.
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  return async (req, res, next) => {
    if (EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized: Bearer token required' });
      return;
    }
    const token = auth.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'unauthorized: empty Bearer token' });
      return;
    }
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      if (!sub) {
        res.status(401).json({ error: 'unauthorized: token missing sub claim' });
        return;
      }
      const rawTenant = (payload as Record<string, unknown>)[config.tenantClaim];
      const tenant = typeof rawTenant === 'string' ? rawTenant : undefined;
      (req as Request).user = {
        sub,
        tenant,
        claims: payload as Record<string, unknown>,
      };
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: `unauthorized: ${msg}` });
    }
  };
}
