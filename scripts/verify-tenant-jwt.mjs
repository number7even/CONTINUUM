#!/usr/bin/env node
// verify-tenant-jwt.mjs — proof-gate for concierge provisioning + the JWT contract (Directive 1).
//
// `continuum provision-tenant` is the one-command enterprise onboarding: register the tenant in the
// control plane AND mint the scoped Bearer token its ARIA client presents. This gate proves the
// command produces a token the ENGINE will actually accept — by verifying it exactly as the auth
// middleware does: jose, against the issuer's published JWKS, with iss + aud enforced. It proves:
//   • the CLI registers the tenant (control plane) AND prints a Bearer token;
//   • that token verifies against the public JWKS with the right iss/aud, carrying the `tenant`
//     claim the middleware routes on (+ sub, exp);
//   • the token's kid matches the JWKS key (self-consistent issuer);
//   • a wrong-audience token, an expired token, and a tampered token are ALL rejected.
//
//   node scripts/verify-tenant-jwt.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLocalJWKSet, jwtVerify, decodeProtectedHeader } from 'jose';

const repo = resolve(new URL('..', import.meta.url).pathname);
process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-jwt-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const ISSUER = 'http://localhost:7878';
const AUDIENCE = 'continuum-api';
const TENANT = 'grand-harbour';

const { publicJwks, mintTenantToken } = await import(new URL('../packages/mcp-server/dist/issuer.js', import.meta.url).href);
const { openTenancyDirectory } = await import('@number7even/continuum-core');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── Directive 1 · continuum provision-tenant ────────────────────────────');
const out = execFileSync(process.execPath, [
  join(repo, 'packages/cli/dist/index.js'), 'provision-tenant', TENANT,
  '--plan', 'enterprise', '--issuer', ISSUER, '--audience', AUDIENCE, '--ttl-days', '30',
], { encoding: 'utf8', env: process.env });
const tokenMatch = out.match(/Authorization: Bearer (\S+)/);
const token = tokenMatch?.[1] ?? '';
check('the command prints a Bearer token', token.length > 40 && token.split('.').length === 3);

const dir = openTenancyDirectory();
const rec = dir.getTenant(TENANT);
dir.close();
check('the command registered the tenant in the control plane', rec?.status === 'active' && rec?.plan === 'enterprise' && !!rec?.keyId);

console.log('── the JWT verifies exactly as the engine middleware would ─────────────');
const jwks = createLocalJWKSet(await publicJwks());
const { payload, protectedHeader } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE });
check('token verifies against the published JWKS (right iss + aud)', payload.iss === ISSUER && (payload.aud === AUDIENCE || payload.aud?.includes?.(AUDIENCE)));
check('carries the `tenant` claim the middleware routes on', payload.tenant === TENANT, String(payload.tenant));
check('carries sub + a future exp', typeof payload.sub === 'string' && Number(payload.exp) * 1000 > Date.now());
check('token kid matches the JWKS signing key', protectedHeader.kid === rec?.keyId, `${protectedHeader.kid?.slice(0, 12)}…`);
check('header kid is decodable + RS256', decodeProtectedHeader(token).alg === 'RS256');

console.log('── the contract REJECTS bad tokens ─────────────────────────────────────');
let wrongAud = false;
try { await jwtVerify(token, jwks, { issuer: ISSUER, audience: 'some-other-api' }); } catch { wrongAud = true; }
check('a wrong-audience verification is rejected', wrongAud);

const expired = await mintTenantToken({ tenantId: TENANT, issuer: ISSUER, audience: AUDIENCE, ttlSeconds: -10 });
let expiredRejected = false;
try { await jwtVerify(expired.token, jwks, { issuer: ISSUER, audience: AUDIENCE }); } catch { expiredRejected = true; }
check('an expired token is rejected', expiredRejected);

const tampered = token.slice(0, -3) + (token.slice(-3) === 'aaa' ? 'bbb' : 'aaa');
let tamperRejected = false;
try { await jwtVerify(tampered, jwks, { issuer: ISSUER, audience: AUDIENCE }); } catch { tamperRejected = true; }
check('a tampered signature is rejected', tamperRejected);

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('TENANT_JWT_VERIFY: GREEN — provision-tenant registers the tenant and mints a scoped RS256');
  console.log('token the engine accepts (right iss/aud/tenant/kid); wrong-aud, expired, and tampered are rejected.');
  process.exit(0);
} else { console.log('TENANT_JWT_VERIFY: RED'); process.exit(1); }
