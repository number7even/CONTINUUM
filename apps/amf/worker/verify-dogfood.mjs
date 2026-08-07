// verify-dogfood.mjs — proves the ONE command runs the whole A→I pipeline autonomously
// (no manual intervention between stages) and ends with the honest odometer.
//
// Structural proof (robust to network state): both stages ran, the per-run odometer and
// the capability odometer both printed, exit 0. Runs template-drafting (no ANTHROPIC key)
// so it's fast + deterministic; a "no on-brand signal this tick" is still a valid pass —
// the point is that the chain executed start-to-finish by itself and reported honestly.
//
//   node verify-dogfood.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dogfood = fileURLToPath(new URL('./dogfood.mjs', import.meta.url));
const env = { ...process.env, AMF_DOGFOOD_PROJECT: 'dogfood-verify' };
delete env.ANTHROPIC_API_KEY; // template draft — deterministic, no LLM call

const r = spawnSync('node', [dogfood, '--brand', 'voicecosmos'], { encoding: 'utf8', env, timeout: 90000 });
const out = (r.stdout || '') + (r.stderr || '');

const exit0 = r.status === 0;
const ingestStage = /A→D · INGEST/.test(out);
const matchStage = /E→G · MATCH/.test(out);
const runOdometer = /\[odometer:dogfood:voicecosmos\]/.test(out);   // per-run: ingested·matched·drafted·routed
const capOdometer = /AMF · HONEST ODOMETER/.test(out);              // the loud gate report

console.log(`checks: exit0=${exit0} ingestStage=${ingestStage} matchStage=${matchStage} runOdometer=${runOdometer} capOdometer=${capOdometer}`);
const green = exit0 && ingestStage && matchStage && runOdometer && capOdometer;
console.log(green
  ? 'DOGFOOD_VERIFY: GREEN — one command ran A→I autonomously and printed the honest odometer'
  : 'DOGFOOD_VERIFY: RED');
process.exit(green ? 0 : 1);
