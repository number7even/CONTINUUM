/**
 * tenant.test.ts — adversarial unit tests for the W27-1 sanitisation gate.
 *
 * Per the W27 sprint doc, 12+ adversarial inputs cover the path-traversal,
 * separator-smuggling, null-byte, control-character, length-overflow, and
 * case-fold failure modes. Positive cases verify the lowercasing path
 * doesn't accidentally reject valid identifiers.
 *
 * Run after build:
 *   node --test packages/core/dist/tenant.test.js
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitiseTenantId, tenantDataDir } from './tenant.js';

// ── Adversarial rejection cases ───────────────────────────────────────────────
// Each negative test maps to a real-world attack vector. If any of these
// flip to "accept" in a future change, multi-tenant isolation breaks.

test('sanitiseTenantId: empty string → null', () => {
  assert.equal(sanitiseTenantId(''), null);
});

test('sanitiseTenantId: whitespace-only string → null', () => {
  assert.equal(sanitiseTenantId('   '), null);
  assert.equal(sanitiseTenantId('\t\n'), null);
});

test('sanitiseTenantId: bare ".." → null (path traversal)', () => {
  assert.equal(sanitiseTenantId('..'), null);
});

test('sanitiseTenantId: nested "../etc/passwd" → null (path traversal)', () => {
  assert.equal(sanitiseTenantId('../etc/passwd'), null);
});

test('sanitiseTenantId: absolute "/absolute/path" → null (escapes root)', () => {
  assert.equal(sanitiseTenantId('/absolute/path'), null);
});

test('sanitiseTenantId: windows "\\\\windows\\\\path" → null (backslash separator)', () => {
  assert.equal(sanitiseTenantId('\\windows\\path'), null);
});

test('sanitiseTenantId: embedded null byte → null (syscall truncation)', () => {
  assert.equal(sanitiseTenantId('tenant\x00null'), null);
});

test('sanitiseTenantId: control characters (\\x01..\\x1f, \\x7f) → null', () => {
  assert.equal(sanitiseTenantId('tenant\x01control'), null);
  assert.equal(sanitiseTenantId('tenant\x1f'), null);
  assert.equal(sanitiseTenantId('tenant\x7f'), null);
});

test('sanitiseTenantId: forward slash "tenant/sub" → null (path separator)', () => {
  assert.equal(sanitiseTenantId('tenant/sub'), null);
});

test('sanitiseTenantId: dot inside identifier → null (precaution)', () => {
  // We reject ALL dots, not just .. and . — dots are path-traversal-
  // adjacent enough that a strict allowlist is the safer default.
  assert.equal(sanitiseTenantId('tenant.with.dots'), null);
  assert.equal(sanitiseTenantId('.'), null);
});

test('sanitiseTenantId: special chars (@, !, #, %, &) → null', () => {
  assert.equal(sanitiseTenantId('tenant@evil.com'), null);
  assert.equal(sanitiseTenantId('tenant!'), null);
  assert.equal(sanitiseTenantId('tenant#1'), null);
});

test('sanitiseTenantId: length-overflow (>128 chars after trim) → null', () => {
  // 129 chars of valid-looking content still fails the length cap.
  assert.equal(sanitiseTenantId('a'.repeat(129)), null);
  // Massive input is rejected before lowercasing (DoS bound at 256).
  assert.equal(sanitiseTenantId('a'.repeat(10_000)), null);
});

test('sanitiseTenantId: non-string inputs → null', () => {
  assert.equal(sanitiseTenantId(null), null);
  assert.equal(sanitiseTenantId(undefined), null);
  assert.equal(sanitiseTenantId(42), null);
  assert.equal(sanitiseTenantId({}), null);
  assert.equal(sanitiseTenantId([]), null);
});

test('sanitiseTenantId: unicode / non-ASCII → null', () => {
  // Strict allowlist rejects anything outside ASCII letters/digits/-/_.
  assert.equal(sanitiseTenantId('tenant-müller'), null);
  assert.equal(sanitiseTenantId('租户'), null);
  assert.equal(sanitiseTenantId('emoji-🚀'), null);
});

// ── Positive cases — sanitisation must NOT reject valid identifiers ──────────

test('sanitiseTenantId: uppercase input gets lowercased and accepted', () => {
  assert.equal(sanitiseTenantId('TenantA'), 'tenanta');
  assert.equal(sanitiseTenantId('UPPER'), 'upper');
});

test('sanitiseTenantId: mixed-case + hyphen + underscore + digit → accepted', () => {
  assert.equal(
    sanitiseTenantId('Tenant_id-with-valid-chars-123'),
    'tenant_id-with-valid-chars-123',
  );
});

test('sanitiseTenantId: 128 chars exactly → accepted (boundary)', () => {
  const exact = 'a'.repeat(128);
  assert.equal(sanitiseTenantId(exact), exact);
});

test('sanitiseTenantId: single character → accepted', () => {
  assert.equal(sanitiseTenantId('a'), 'a');
  assert.equal(sanitiseTenantId('1'), '1');
});

test('sanitiseTenantId: surrounding whitespace is trimmed before check', () => {
  assert.equal(sanitiseTenantId('  tenant-a  '), 'tenant-a');
});

// ── tenantDataDir — defence-in-depth re-sanitisation ─────────────────────────

test('tenantDataDir: valid tenant returns path under continuumDataRoot', () => {
  const path = tenantDataDir('alpha');
  // Path must end with /alpha (lowercased), not be the root itself,
  // and not contain the input verbatim if it had uppercase.
  assert.match(path, /\/alpha$/);
});

test('tenantDataDir: lowercases the input via sanitiseTenantId', () => {
  const path = tenantDataDir('UpperCaseTenant');
  assert.match(path, /\/uppercasetenant$/);
});

test('tenantDataDir: rejects path-traversal input by throwing', () => {
  assert.throws(
    () => tenantDataDir('../etc/passwd'),
    /invalid tenant identifier/,
  );
});

test('tenantDataDir: rejects empty input by throwing', () => {
  assert.throws(() => tenantDataDir(''), /invalid tenant identifier/);
});

test('tenantDataDir: rejects null-byte by throwing', () => {
  assert.throws(
    () => tenantDataDir('tenant\x00sub'),
    /invalid tenant identifier/,
  );
});

test('tenantDataDir: rejects forward slash by throwing', () => {
  assert.throws(
    () => tenantDataDir('tenant/sub'),
    /invalid tenant identifier/,
  );
});
