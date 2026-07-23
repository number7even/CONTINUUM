/**
 * issuer — CONTINUUM as its own local OIDC-lite JWT issuer (concierge provisioning, W-multitenant).
 *
 * The JWT auth middleware (auth.ts) validates RS256 tokens against the issuer's JWKS at
 * <issuer>/.well-known/jwks.json. For the concierge sales model — "sign a contract, hand the
 * client a scoped Bearer token" — CONTINUUM needs no external IdP: it IS the issuer. This module
 * owns a persisted RSA keypair, mints per-tenant tokens (RS256, with the `tenant` claim the
 * middleware routes on), and publishes the public JWKS the engine serves so it can verify its own
 * tokens. The private key never leaves ~/.continuum/issuer/ (P1 — minimise the secret).
 *
 * Same keypair for the CLI (mints) and the engine (serves JWKS + verifies) because both resolve it
 * from CONTINUUM_DATA_DIR — self-consistent by construction.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { generateKeyPair, exportJWK, importJWK, SignJWT, calculateJwkThumbprint } from 'jose';
import type { JWK } from 'jose';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function dataRoot(): string {
  const env = process.env.CONTINUUM_DATA_DIR?.trim();
  return env && env.length ? env : join(homedir(), '.continuum');
}
function issuerKeyPath(): string { return join(dataRoot(), 'issuer', 'rsa.jwk.json'); }

/** jose returns CryptoKey | Uint8Array from importJWK; alias it without needing the DOM lib. */
type SigningKey = Awaited<ReturnType<typeof importJWK>>;

export interface IssuerKey {
  /** The imported private key used to sign tokens. */
  privateKey: SigningKey;
  /** The public JWK (kid + alg + use) served in the JWKS. */
  publicJwk: JWK;
  kid: string;
}

let _cached: IssuerKey | null = null;

/**
 * Load the issuer's RSA keypair, generating + persisting it on first use. Idempotent + cached per
 * process. The kid is the RFC-7638 JWK thumbprint, so it's stable across processes for the same key.
 */
export async function loadOrCreateIssuerKey(): Promise<IssuerKey> {
  if (_cached) return _cached;
  const path = issuerKeyPath();
  let privateJwk: JWK;
  if (existsSync(path)) {
    privateJwk = JSON.parse(readFileSync(path, 'utf8')) as JWK;
  } else {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    privateJwk = await exportJWK(privateKey);
    mkdirSync(join(dataRoot(), 'issuer'), { recursive: true });
    writeFileSync(path, JSON.stringify(privateJwk), { mode: 0o600 });
    try { chmodSync(path, 0o600); } catch { /* best-effort on platforms without POSIX perms */ }
  }
  const publicOnly: JWK = { kty: privateJwk.kty, n: privateJwk.n, e: privateJwk.e };
  const kid = await calculateJwkThumbprint(publicOnly);
  const privateKey = await importJWK(privateJwk, 'RS256');
  _cached = { privateKey, publicJwk: { ...publicOnly, kid, alg: 'RS256', use: 'sig' }, kid };
  return _cached;
}

/** Test seam — drop the cached key so a fresh CONTINUUM_DATA_DIR is honoured. */
export function _resetIssuerCacheForTests(): void { _cached = null; }

export interface MintedToken { token: string; kid: string; expiresAt: string; sub: string }

/**
 * Mint a per-tenant RS256 Bearer token the engine's JWT middleware will accept: `tenant` claim for
 * routing, plus iss/aud/sub/exp. Default lifetime is long (concierge service tokens, not short OIDC
 * sessions) — 90 days — overridable.
 */
export async function mintTenantToken(opts: {
  tenantId: string;
  issuer: string;
  audience: string;
  sub?: string;
  ttlSeconds?: number;
}): Promise<MintedToken> {
  const key = await loadOrCreateIssuerKey();
  const ttl = opts.ttlSeconds ?? 90 * 24 * 3600;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const sub = opts.sub ?? `tenant:${opts.tenantId}`;
  const token = await new SignJWT({ tenant: opts.tenantId })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key.privateKey);
  return { token, kid: key.kid, expiresAt: new Date(exp * 1000).toISOString(), sub };
}

/** The public JWKS the engine serves at /.well-known/jwks.json (single key). */
export async function publicJwks(): Promise<{ keys: JWK[] }> {
  const key = await loadOrCreateIssuerKey();
  return { keys: [key.publicJwk] };
}
