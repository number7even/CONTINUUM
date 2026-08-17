#!/usr/bin/env node
// verify-brain-projection.mjs — a PROJECTION SURFACE must hold no state of its own
// (CONTINUUM_ENGINE_OBLIGATIONS: no shadow stores). Fails when a browser-storage API
// appears in the scanned surface.
//
// SCOPE (ruling 2026-08-17, VC-terminal): this law applies to projection surfaces —
// the Brain, HyperFrames panels that render spine state — NOT to a whole product
// front-end. Auth/session/theme/accessibility persistence in app contexts is
// legitimate; pointing this guard at all of src/ teaches teams to bypass it.
//
//   node scripts/verify-brain-projection.mjs                 # default: the Brain
//   node scripts/verify-brain-projection.mjs --path <dir>    # e.g. a repo's src/hyperframes
//
// Unknown flags are a HARD ERROR (a silently-ignored flag produced a false GREEN on
// 2026-08-17 — a guard that ignores its arguments is the failure class it exists to catch).
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_ROOT = new URL('../apps/console/app/brain', import.meta.url).pathname;
const FORBIDDEN = /\b(localStorage|sessionStorage|indexedDB|openDatabase)\b/;

let root = DEFAULT_ROOT;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--path') {
    root = resolve(argv[++i] ?? '');
  } else {
    console.error(`BRAIN_PROJECTION: RED — unknown argument '${argv[i]}'. Refusing to scan (no silent flags).`);
    process.exit(2);
  }
}
if (!root || !existsSync(root)) {
  console.error(`BRAIN_PROJECTION: RED — scan path does not exist: ${root}`);
  process.exit(2);
}

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(e) && files.push(p);
  }
})(root);

if (files.length === 0) {
  console.error(`BRAIN_PROJECTION: RED — zero source files under ${root}; an empty scan is not a pass.`);
  process.exit(2);
}

const hits = files.flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .map((line, i) => (FORBIDDEN.test(line) ? `${f}:${i + 1}: ${line.trim()}` : null))
    .filter(Boolean),
);

if (hits.length) {
  console.error(`BRAIN_PROJECTION: RED — browser storage in projection surface (${root}):\n` + hits.join('\n'));
  process.exit(1);
}
console.log(`BRAIN_PROJECTION: GREEN — ${files.length} files under ${root}, zero storage APIs.`);
