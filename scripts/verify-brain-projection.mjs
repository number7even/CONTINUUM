#!/usr/bin/env node
// verify-brain-projection.mjs — the Brain console must remain a PROJECTION of the spine,
// never a store (CONTINUUM_ENGINE_OBLIGATIONS: no shadow stores). This gate fails the
// moment a browser-storage API enters the brain surface — the drift that "decays silently"
// (VC-terminal finding, 2026-08-17: first localStorage.setItem of a saved view = shadow store).
// Exit 0 = projection holds. Re-runnable; wire into make smoke.
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../apps/console/app/brain', import.meta.url).pathname;
const FORBIDDEN = /\b(localStorage|sessionStorage|indexedDB|openDatabase)\b/;

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(e) && files.push(p);
  }
})(ROOT);

const hits = files.flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .map((line, i) => (FORBIDDEN.test(line) ? `${f}:${i + 1}: ${line.trim()}` : null))
    .filter(Boolean),
);

if (hits.length) {
  console.error('BRAIN_PROJECTION: RED — browser storage in the projection surface:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`BRAIN_PROJECTION: GREEN — ${files.length} files, zero storage APIs. The Brain is a projection.`);
