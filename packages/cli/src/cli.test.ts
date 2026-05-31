/**
 * packages/cli/src/cli.test.ts
 *
 * SPRINT-2026-W22 · W22-2 (Issue #9 — CLI project-id case sensitivity).
 *
 * Pins the four-tier project-id resolution rules:
 *
 *   1. --project-id flag      preserved as given (user-explicit, no normalisation)
 *   2. CONTINUUM_PROJECT_ID   preserved as given (user-explicit, no normalisation)
 *   3. cwd basename            LOWERCASED        (Issue #9 fix — folder-case accidents)
 *   4. "default"               final fallback
 *
 * Run after build via:
 *   node --test packages/cli/dist/cli.test.js
 *
 * The repo doesn't ship node --test as the canonical framework yet
 * (Issue #11) — but this file is written so it'll be picked up the
 * moment that lands. Until then, the smoke-style invocation above
 * runs the same assertions.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProjectId } from './index.js';

// Saved-and-restored env between tests to avoid cross-test bleed.
const envBefore = process.env.CONTINUUM_PROJECT_ID;
function restoreEnv(): void {
  if (envBefore === undefined) delete process.env.CONTINUUM_PROJECT_ID;
  else process.env.CONTINUUM_PROJECT_ID = envBefore;
}

test('resolveProjectId: explicit --project-id flag is preserved as given', () => {
  delete process.env.CONTINUUM_PROJECT_ID;
  try {
    assert.equal(resolveProjectId('MyProject'), 'MyProject');
    assert.equal(resolveProjectId('vc-Hospitality'), 'vc-Hospitality');
    assert.equal(resolveProjectId('UPPER'), 'UPPER');
    assert.equal(resolveProjectId('  spaced  '), 'spaced');
  } finally {
    restoreEnv();
  }
});

test('resolveProjectId: $CONTINUUM_PROJECT_ID is preserved as given', () => {
  process.env.CONTINUUM_PROJECT_ID = 'MyProject';
  try {
    assert.equal(resolveProjectId(undefined), 'MyProject');
  } finally {
    restoreEnv();
  }
  process.env.CONTINUUM_PROJECT_ID = 'vc-Hospitality';
  try {
    assert.equal(resolveProjectId(), 'vc-Hospitality');
  } finally {
    restoreEnv();
  }
});

test('resolveProjectId: cwd basename is LOWERCASED (Issue #9 fix)', () => {
  delete process.env.CONTINUUM_PROJECT_ID;
  try {
    // Pass cwd explicitly so test is not host-fs-dependent.
    assert.equal(resolveProjectId(undefined, { cwd: '/tmp/MyProject' }), 'myproject');
    assert.equal(
      resolveProjectId(undefined, { cwd: '/Users/op/vc-Hospitality' }),
      'vc-hospitality',
    );
    assert.equal(
      resolveProjectId(undefined, { cwd: '/Users/op/MIXED-Case_Name' }),
      'mixed-case_name',
    );
    // Same project two ways — the canonical "folder-case accident" case.
    const a = resolveProjectId(undefined, { cwd: '/laptop1/MyProject' });
    const b = resolveProjectId(undefined, { cwd: '/laptop2/myproject' });
    assert.equal(a, b, 'two folder casings must resolve to the same project id');
  } finally {
    restoreEnv();
  }
});

test('resolveProjectId: explicit precedence overrides cwd and env', () => {
  process.env.CONTINUUM_PROJECT_ID = 'env-value';
  try {
    // Flag wins over env AND cwd (and flag is NOT lowercased)
    assert.equal(
      resolveProjectId('FlagValue', { cwd: '/tmp/CwdValue' }),
      'FlagValue',
    );
    // Env wins over cwd when flag absent (and env is NOT lowercased)
    assert.equal(resolveProjectId(undefined, { cwd: '/tmp/CwdValue' }), 'env-value');
  } finally {
    restoreEnv();
  }
});

test('resolveProjectId: degenerate cwd falls back to "default"', () => {
  delete process.env.CONTINUUM_PROJECT_ID;
  try {
    assert.equal(resolveProjectId(undefined, { cwd: '/' }), 'default');
    assert.equal(resolveProjectId(undefined, { cwd: '.' }), 'default');
  } finally {
    restoreEnv();
  }
});
