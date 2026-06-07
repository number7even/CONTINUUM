/**
 * tenant.ts — security gate for the V1.2 per-tenant filesystem-isolation
 * routing (Path A, W27-1).
 *
 * Multi-tenant identifiers reach CONTINUUM from two untrusted entry points:
 *   1. The HTTP/SSE JWT claim (`req.user.tenant`) — trusted ONLY in the
 *      sense that the issuer signed it. The CLAIM VALUE itself is operator-
 *      controlled and may carry adversarial input.
 *   2. The `X-Continuum-Project` request header — fully untrusted.
 *
 * Both eventually flow into `~/.continuum/<tenantId>/continuum.db` and
 * `~/.continuum/<tenantId>/ruvector.db` as filesystem path segments. A
 * single bypass anywhere in this chain — a `..` slipped past validation,
 * a `\` interpreted as a separator on Windows, a null byte that
 * truncates a string at the syscall boundary — collapses the structural
 * tenant isolation that V1.2 is the entire point of.
 *
 * This module is the only place where strings become path segments.
 *
 * Design choices:
 *
 *   - Strict allowlist: `[a-z0-9_-]{1,128}` after lowercasing. Anything
 *     outside this character class returns null. We accept the false-
 *     positive cost (a tenant called "Tenant Müller" is rejected) for
 *     the false-negative cost we refuse to pay (a tenant called
 *     "../../etc/passwd" succeeding).
 *
 *   - Lowercasing as part of sanitisation: matches the W22-2 CLI
 *     project-id case-fold fix (Issue #9). Two tenant identifiers
 *     that differ only in case map to the same filesystem segment,
 *     eliminating macOS/Windows case-insensitive-filesystem footguns.
 *
 *   - 128-char cap: aligns with the X-Continuum-Project header sanity
 *     ceiling and most filesystem PATH_MAX budgets when combined with
 *     the ~/.continuum/ root + filename suffix.
 *
 *   - `tenantDataDir` re-sanitises defensively. Even if a caller forgets
 *     to call `sanitiseTenantId` first, this layer throws — multi-proof
 *     P2 discipline at the cost of one regex match per call.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P1 (minimise the secret)
 * meets P5 (the rule binds its keeper) — the rule is "no string
 * becomes a path without passing through this file."
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { join } from 'node:path';
import { continuumDataRoot } from './db.js';

/**
 * Strict allowlist for sanitised tenant IDs. Lowercase alphanumeric +
 * hyphen + underscore, 1-128 chars. Anchored to the full string so a
 * substring match cannot smuggle disallowed characters past the test.
 */
const TENANT_ID_ALLOWLIST = /^[a-z0-9_-]{1,128}$/;

/** Hard upper-bound on raw input length BEFORE lowercasing — catches DoS
 *  attempts that paste megabytes of text through the header. */
const MAX_RAW_LENGTH = 256;

/**
 * Sanitise an untrusted tenant identifier into a filesystem-safe segment.
 *
 * Algorithm:
 *   1. Reject non-strings, empty strings, whitespace-only strings,
 *      strings longer than `MAX_RAW_LENGTH` (DoS bound).
 *   2. Trim leading/trailing whitespace.
 *   3. Lowercase (case-fold to eliminate macOS/Windows case-insensitive-
 *      filesystem collision footguns).
 *   4. Run the strict allowlist regex. If it fails, return null.
 *
 * The regex is anchored at both ends — there is no way to embed `..`
 * or `/` or a null byte and pass.
 *
 * @returns the sanitised lowercase tenant ID, or `null` on any failure.
 *          Callers MUST map `null` to HTTP 400 (or equivalent rejection)
 *          and never substitute a default.
 */
export function sanitiseTenantId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_RAW_LENGTH) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const lowered = trimmed.toLowerCase();
  if (!TENANT_ID_ALLOWLIST.test(lowered)) return null;
  return lowered;
}

/**
 * Resolve a tenant's on-disk data directory. The result is always a
 * subdirectory of `continuumDataRoot()` — never the root itself, never
 * an absolute path supplied by the caller.
 *
 * Defence-in-depth: this function ALSO calls `sanitiseTenantId`. If the
 * caller already sanitised, this is a fast confirmation. If the caller
 * forgot or bypassed the gate, this throws — there is no way to obtain
 * a path from a non-sanitised identifier through this module.
 *
 * @throws Error('continuum: invalid tenant identifier') if the input
 *         fails sanitisation. Catches bypass mistakes at the boundary.
 */
export function tenantDataDir(tenantId: string): string {
  const sanitised = sanitiseTenantId(tenantId);
  if (sanitised === null) {
    throw new Error('continuum: invalid tenant identifier');
  }
  return join(continuumDataRoot(), sanitised);
}
