#!/usr/bin/env node
/**
 * Privacy filter smoke test — §A3 verification.
 *
 * Runs every named pattern against a known-positive sample and asserts:
 *   (a) the secret was REPLACED in scrubbed output (not just detected)
 *   (b) matchedPatterns[] contains the expected label
 *
 * Also exercises:
 *   - operator-extensible patterns via a temp config file
 *   - Shannon-entropy detector toggle
 *   - shouldDrop logic when content is mostly <private> tags
 *
 * Failure mode: process.exit(1). Used as a release gate, not a unit-test
 * framework — we don't have one in core yet (V0 scope discipline).
 *
 * Run via:
 *   node scripts/privacy-smoke.mjs
 */
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  privacyFilter,
  _resetOperatorPatternsCacheForTests,
} from '../packages/core/dist/observation.js';

let failed = 0;
function check(label, condition, detail) {
  const tag = condition ? '✓' : '✗';
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failed++;
}

function testPattern(label, expectedLabel, payload) {
  const sample = `prefix noise ${payload} trailing context`;
  const r = privacyFilter(sample);
  const scrubbedOk = !r.scrubbed.includes(payload);
  const labeledOk = r.matchedPatterns.includes(expectedLabel);
  const placeholderOk = r.scrubbed.includes(`[REDACTED:${expectedLabel}]`);
  check(label, scrubbedOk && labeledOk && placeholderOk,
    scrubbedOk && labeledOk && placeholderOk
      ? `matched=${r.matchedPatterns.join(',')}`
      : `scrubbedOk=${scrubbedOk} labeledOk=${labeledOk} placeholderOk=${placeholderOk} → ${r.scrubbed}`);
}

console.log('§A3 PRIVACY FILTER SMOKE TEST');
console.log('');

console.log('Named patterns (baseline + §A3 additions):');
testPattern('openai-key', 'openai-key', 'sk-abcdefghijklmnopqrstuv1234567890');
testPattern('xai-key', 'xai-key', 'xai-zyxwvutsrqponmlkjihgfedcba0987654321');
testPattern('aws-access-key-id', 'aws-access-key-id', 'AKIAIOSFODNN7EXAMPLE');
testPattern('pem-private-key', 'pem-private-key',
  '-----BEGIN RSA PRIVATE KEY-----\nMIICXAIBAAKBgQDtest123\n-----END RSA PRIVATE KEY-----');
testPattern('jwt', 'jwt',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
testPattern('gcp-service-account', 'gcp-service-account',
  '{"type": "service_account", "project_id": "my-project"}');
testPattern('github-token', 'github-token', 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
testPattern('slack-token', 'slack-token', 'xoxb-1234567890-abcdefghij1234567890ab');
// Google API keys are 39 chars total — `AIza` + exactly 35 of [A-Za-z0-9_-].
testPattern('google-api-key', 'google-api-key', 'AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz_123456');
testPattern('stripe-live-secret', 'stripe-live-secret', 'sk_live_AbCdEfGhIjKlMnOpQrStUvWx');
testPattern('stripe-live-publishable', 'stripe-live-publishable', 'pk_live_AbCdEfGhIjKlMnOpQrStUvWx');

console.log('');
console.log('<private> tag block:');
{
  const r = privacyFilter('safe text <private>secret stuff here</private> more safe text');
  check('<private> redacted', r.scrubbed.includes('[PRIVATE_REDACTED]') && !r.scrubbed.includes('secret stuff here'));
  check('<private> labeled', r.matchedPatterns.includes('private-tag'));
  check('<private> not flagged for drop (minority)', r.shouldDrop === false);
}
{
  const r = privacyFilter('<private>this is most of the content here</private>x');
  check('<private> majority → shouldDrop=true', r.shouldDrop === true);
}

console.log('');
console.log('False-positive guard — commit SHA should NOT be scrubbed:');
{
  // 40-char hex (a real commit SHA) — entropy ~4.0, below 4.5 threshold.
  // Pattern-based filter shouldn't touch hex strings either.
  const r = privacyFilter('refers to commit f21b059c8c4e8a1d3b5e7f9c2a4d6e8b0c2d4f6a in history');
  check('commit SHA preserved', r.scrubbed.includes('f21b059c8c4e8a1d3b5e7f9c2a4d6e8b0c2d4f6a'));
  check('commit SHA not labeled', !r.matchedPatterns.includes('high-entropy'));
}

console.log('');
console.log('Operator-extensible patterns (via $CONTINUUM_PRIVACY_CONFIG):');
{
  const tmpFile = join(tmpdir(), `continuum-privacy-test-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify({
    patterns: [
      { label: 'company-internal-token', rx: '\\bCT-[A-Z0-9]{16}\\b' },
    ],
  }));
  try {
    process.env.CONTINUUM_PRIVACY_CONFIG = tmpFile;
    _resetOperatorPatternsCacheForTests();
    const r = privacyFilter('audit log: token CT-ABCDEF1234567890 used to authenticate');
    check('operator pattern scrubbed',
      !r.scrubbed.includes('CT-ABCDEF1234567890') && r.scrubbed.includes('[REDACTED:company-internal-token]'),
      `scrubbed=${r.scrubbed}`);
  } finally {
    unlinkSync(tmpFile);
    delete process.env.CONTINUUM_PRIVACY_CONFIG;
    _resetOperatorPatternsCacheForTests();
  }
}

console.log('');
console.log('High-entropy detector (opt-in via $CONTINUUM_PRIVACY_ENTROPY_DETECTOR):');
{
  // base64-shaped string of 48 chars with high entropy — should redact when opt-in is on.
  const suspicious = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEf012345';

  // Off (default): leaves it alone.
  delete process.env.CONTINUUM_PRIVACY_ENTROPY_DETECTOR;
  const off = privacyFilter(`payload: ${suspicious} end`);
  check('entropy detector OFF leaves content', off.scrubbed.includes(suspicious));

  // On: redacts.
  process.env.CONTINUUM_PRIVACY_ENTROPY_DETECTOR = '1';
  const on = privacyFilter(`payload: ${suspicious} end`);
  check('entropy detector ON scrubs', !on.scrubbed.includes(suspicious) && on.matchedPatterns.includes('high-entropy'));
  delete process.env.CONTINUUM_PRIVACY_ENTROPY_DETECTOR;
}

console.log('');
console.log('Bad operator config does not crash:');
{
  const tmpFile = join(tmpdir(), `continuum-privacy-bad-${Date.now()}.json`);
  writeFileSync(tmpFile, '{not valid json');
  try {
    process.env.CONTINUUM_PRIVACY_CONFIG = tmpFile;
    _resetOperatorPatternsCacheForTests();
    const r = privacyFilter('hello world');
    check('bad config → defaults still work', r.scrubbed === 'hello world');
  } finally {
    unlinkSync(tmpFile);
    delete process.env.CONTINUUM_PRIVACY_CONFIG;
    _resetOperatorPatternsCacheForTests();
  }
}

console.log('');
console.log(failed === 0 ? `✓ ALL CHECKS PASSED` : `✗ ${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
