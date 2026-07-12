// verify-render-hang.mjs — proves the render path can no longer hang forever.
//
// The bug: render.mjs ran `npx hyperframes init` and `npm run render` with NO timeout, so a
// wedged first-run browser download hung indefinitely — and a browser grandchild ignores the
// parent's SIGTERM. The fix: every heavy render step runs through a watchdog that SIGKILLs a
// stuck child at the timeout, then fails loud.
//
// Proof (fast + safe — no browser needed):
//   1. MECHANISM — a child that IGNORES SIGTERM (trap '' TERM; sleep 30) is still killed near
//      the timeout with killSignal:'SIGKILL', not after the full sleep. This is the exact
//      option render.mjs now uses.
//   2. WIRED — render.mjs's two culprit steps run through the hardened runner (SIGKILL +
//      RENDER_TIMEOUT_MS), no bare unguarded execSync.
//
//   node verify-render-hang.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 1 — MECHANISM: SIGTERM-ignoring child must be killed near the 2s timeout, not at 30s.
const t0 = Date.now();
let threw = false;
try {
  execSync(`bash -c "trap '' TERM; sleep 30"`, { timeout: 2000, killSignal: 'SIGKILL', stdio: 'ignore' });
} catch { threw = true; }
const elapsed = Date.now() - t0;
const killsStuckChild = threw && elapsed < 8000; // near 2s → no hang; NOT the full 30s

// 2 — WIRED: render.mjs uses the hardened guard; the two culprits are no longer bare.
const src = readFileSync(fileURLToPath(new URL('./render.mjs', import.meta.url)), 'utf8');
const hardGuard = /killSignal:\s*'SIGKILL'/.test(src) && /RENDER_TIMEOUT_MS/.test(src);
const initWrapped = !/execSync\('npx --yes hyperframes/.test(src);
const renderWrapped = !/execSync\('npm run render'/.test(src);

console.log(`checks: killsStuckChild=${killsStuckChild}(${elapsed}ms) hardGuard=${hardGuard} initWrapped=${initWrapped} renderWrapped=${renderWrapped}`);
const green = killsStuckChild && hardGuard && initWrapped && renderWrapped;
console.log(green
  ? 'RENDER_HANG_VERIFY: GREEN — a stuck render child is SIGKILLed near the timeout; no silent hang'
  : 'RENDER_HANG_VERIFY: RED');
process.exit(green ? 0 : 1);
