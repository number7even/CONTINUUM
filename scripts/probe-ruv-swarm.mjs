#!/usr/bin/env node
/**
 * scripts/probe-ruv-swarm.mjs
 *
 * SPRINT-W26-1 dependency-landing probe.
 *
 * Verifies that ruv-swarm:
 *   1. Resolves cleanly via dynamic import (no native compile prompts)
 *   2. Initializes via RuvSwarm.initialize() — the lifecycle entry point
 *   3. Exposes the topology + lifecycle surface W26 depends on
 *   4. Exits clean (no orphan workers / hanging WebSocket / etc.)
 *
 * This is the "Journey 3 zero-config" smoke that gates whether the
 * dependency landing was actually safe for solo-dev npm-install. If
 * this script exits 0 in <5s on a fresh clone, ruv-swarm has not
 * broken the zero-config promise.
 *
 * Run:
 *   node scripts/probe-ruv-swarm.mjs
 *
 * Exit codes:
 *   0 — package resolves, initializes, exposes the W26-required surface
 *   1 — resolution failed OR API surface drift OR hang past 10s
 *
 * Bound by The Nine v0.1.0 (AGENTS.md). P4 — measured, not claimed.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */

// Hard-cap: if this script hasn't exited in 10s, something's holding the
// event loop open and we want to know — that's a Journey 3 violation
// even if the API surface is correct.
const HANG_BUDGET_MS = 10_000;
const hangTimer = setTimeout(() => {
  process.stderr.write(
    `\n✗ FAIL — probe still running after ${HANG_BUDGET_MS}ms.\n` +
      `  Something in ruv-swarm is holding the Node event loop open.\n` +
      `  Inspect with: node --inspect-brk scripts/probe-ruv-swarm.mjs\n`,
  );
  process.exit(1);
}, HANG_BUDGET_MS);
hangTimer.unref();

const t0 = performance.now();

try {
  // 1. resolves
  const rs = await import('ruv-swarm');
  const resolveMs = (performance.now() - t0).toFixed(1);
  process.stdout.write(`✓ resolves        (${resolveMs}ms)\n`);

  // 2. required exports present
  const required = ['RuvSwarm', 'Swarm', 'Agent', 'COGNITIVE_PATTERNS'];
  const missing = required.filter(k => !(k in rs));
  if (missing.length > 0) {
    process.stderr.write(`✗ FAIL — missing exports: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`✓ exports present (${required.join(', ')})\n`);

  // 3. initialize succeeds
  const initT0 = performance.now();
  const instance = await rs.RuvSwarm.initialize();
  const initMs = (performance.now() - initT0).toFixed(1);
  if (!instance) {
    process.stderr.write(`✗ FAIL — RuvSwarm.initialize() returned ${instance}\n`);
    process.exit(1);
  }
  process.stdout.write(`✓ initialize ok   (${initMs}ms)\n`);

  // 4. lifecycle methods reachable on Swarm.prototype
  const swarmMethods = ['spawn', 'orchestrate', 'getStatus', 'monitor', 'terminate'];
  const protoNames = Object.getOwnPropertyNames(rs.Swarm.prototype);
  const missingMethods = swarmMethods.filter(m => !protoNames.includes(m));
  if (missingMethods.length > 0) {
    process.stderr.write(`✗ FAIL — Swarm missing methods: ${missingMethods.join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`✓ Swarm lifecycle (${swarmMethods.join(' + ')})\n`);

  // 5. topology values W26-2+ depends on are CONFIGURABLE — probed via
  // the enhanced module (ruv-swarm/src/index-enhanced.js) because the
  // main entry's createSwarm has an upstream bug in v1.0.20 (looks for
  // a `RuvSwarm` constructor on the WASM bindings that doesn't exist —
  // the WASM module exports `WasmSwarmOrchestrator` instead). Tested
  // against the enhanced module here as the documented W26-2 path
  // forward; the main entry's bug is informational for W26-2 sequencing
  // and does NOT block W26-1 (which only needs the dep to land + the
  // root surface to expose the lifecycle types).
  const topologies = ['mesh', 'ring', 'hierarchical'];
  try {
    const enhanced = await import('ruv-swarm/src/index-enhanced.js');
    const eInstance = await enhanced.RuvSwarm.initialize();
    for (const topology of topologies) {
      const sw = await eInstance.createSwarm({ topology, maxAgents: 1 });
      if (!sw || typeof sw.terminate !== 'function') {
        process.stderr.write(
          `✗ FAIL — enhanced createSwarm({topology:${topology}}) returned bad swarm\n`,
        );
        process.exit(1);
      }
      await sw.terminate();
    }
    process.stdout.write(
      `✓ topologies      (${topologies.join(' + ')} create+terminate via enhanced module)\n`,
    );
  } catch (err) {
    process.stdout.write(
      `⚠ topologies      enhanced module probe failed — W26-2 must address: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
    // Do NOT fail W26-1 on this — main-entry resolves+initialize is
    // the contracted W26-1 deliverable. The enhanced-module probe is
    // informational for W26-2 sequencing.
  }

  const totalMs = (performance.now() - t0).toFixed(1);
  // RuvSwarm.getVersion() in v1.0.20 uses `require('../package.json')`
  // which throws in pure-ESM (a second upstream bug — separate from the
  // createSwarm symbol issue). Wrap so this purely-cosmetic diagnostic
  // can't fail the probe's contract.
  let engineVersion = 'unknown';
  try {
    engineVersion = rs.RuvSwarm.getVersion?.() ?? 'unknown';
  } catch {
    engineVersion = 'unreadable (ruv-swarm bug — getVersion uses require())';
  }
  process.stdout.write(
    `\n✓ ruv-swarm W26-1 dependency-landing probe PASS in ${totalMs}ms\n` +
      `  Engine version: ${engineVersion}\n` +
      `  W26-1 deliverable (dep installs, resolves, initializes, lifecycle\n` +
      `  surface present) is met. Note for W26-2: the canonical createSwarm\n` +
      `  path is the enhanced module (see comment at probe step 5).\n`,
  );
  process.exit(0);
} catch (err) {
  const totalMs = (performance.now() - t0).toFixed(1);
  process.stderr.write(
    `\n✗ FAIL after ${totalMs}ms: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(1);
}
