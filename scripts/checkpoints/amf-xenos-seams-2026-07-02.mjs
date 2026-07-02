/**
 * Checkpoint: AMF ⇄ XENOS amalgamation — all 3 seams built our-side — 2026-07-02.
 *
 * XENOS CRM (number7evencrm) accepted the amalgamation (federate-first). Our half of every
 * seam is now built, gated, and smoke-green — inject-and-run the moment XENOS issues keys:
 *   ① lead handoff   stage-j.mjs   → their POST /api/crm/leads/capture
 *   ⑤ one cockpit    pulse.mjs     → their POST /api/hitl/create-approval (wired into the chain)
 *   ② feedback loop  feedback-sync → their GET /api/hitl/recent-decisions → CONTINUUM ground_truth
 *
 * HONEST (P4): every seam is GATED on XENOS keys + fail-safe, and NOT live-verified — no key has
 * been issued, so the end-to-end dogfood thread is unproven. Cross-repo XENOS endpoints are
 * trusted from their handshake response, not verified from this repo.
 *
 * Every verifyCommand runs here and MUST exit 0 (verify-green at stamp time). Key-independent
 * (grep-based) so they re-prove after keys are injected too.
 *   node scripts/checkpoints/amf-xenos-seams-2026-07-02.mjs
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
const NOW = new Date().toISOString();
const L = 'apps/amf/worker @ 2026-07-02';
const e = (name, where, verifyCommand, description) => ({ name, where, verifyCommand, verifiedAt: NOW, landedAt: L, description });

const active = [
  e('seam-1-lead-handoff-BUILT', 'apps/amf/worker/stage-j.mjs',
    'test -f apps/amf/worker/stage-j.mjs && grep -q "handoffLead" apps/amf/worker/stage-j.mjs && grep -q "/api/crm/leads/capture" apps/amf/worker/stage-j.mjs && grep -q "XENOS_LEADS_KEY" apps/amf/worker/stage-j.mjs',
    'Seam ① lead handoff → XENOS POST /api/crm/leads/capture. Replaces the dead DEMO_WEBHOOK_URL. B1 handled (owner tenant → tenant_id; prospect product → meta.product_interest). Gated on XENOS_LEADS_URL/KEY, fail-safe. Re-prove: `node apps/amf/worker/stage-j.mjs --smoke`.'),
  e('seam-5-one-cockpit-BUILT', 'apps/amf/worker/pulse.mjs + pipeline.mjs',
    'test -f apps/amf/worker/pulse.mjs && grep -q "surfaceToPulse" apps/amf/worker/pulse.mjs && grep -q "/api/hitl/create-approval" apps/amf/worker/pulse.mjs && grep -q "XENOS_HITL_KEY" apps/amf/worker/pulse.mjs && grep -q "surfaceToPulse" apps/amf/worker/pipeline.mjs',
    'Seam ⑤ one cockpit — AMF drafts surface into the XENOS Operational Pulse (POST /api/hitl/create-approval) as marketing approvals. Wired into runProductChain; a Pulse outage never blocks the local review queue (P6). Two gates → one cockpit (P9). Re-prove: `node apps/amf/worker/pulse.mjs --smoke`.'),
  e('seam-2-feedback-loop-BUILT', 'apps/amf/worker/feedback-sync.mjs',
    'test -f apps/amf/worker/feedback-sync.mjs && grep -q "recent-decisions" apps/amf/worker/feedback-sync.mjs && grep -q "ground_truth" apps/amf/worker/feedback-sync.mjs && grep -q "HITL_REWARD" apps/amf/worker/feedback-sync.mjs',
    'Seam ② feedback loop — XENOS HITL decisions/reviews (GET /api/hitl/recent-decisions) → CONTINUUM ground_truth Observations, canonical HITL_REWARD (approve 1.0/modify 0.7/reject 0.2). Fills the deferred SONA slot; fuels L3 scripting. Idempotent, privacy-scrubbed, gated. Re-prove: `node apps/amf/worker/feedback-sync.mjs --smoke`.'),
  e('xenos-product-registry', 'apps/amf/worker/xenos-registry.json',
    'test -f apps/amf/worker/xenos-registry.json && grep -q "xenos_key" apps/amf/worker/xenos-registry.json && node -e "JSON.parse(require(\'fs\').readFileSync(\'apps/amf/worker/xenos-registry.json\'))"',
    'AMF 14 ↔ XENOS 9 product mapping (D1/B3). 5 confirmed, 2 flagged (sekago sector, fluxcore↔Photonflow), 6 AMF-only, 2 XENOS-only. Join key = xenos_key; owner_tenant_id is XENOS-to-fill. Drift explicit (P4).'),
  e('seams-GATED-not-live-verified', 'apps/amf/worker (the boundary that REMAINS)',
    'grep -q "gated: no XENOS" apps/amf/worker/stage-j.mjs && grep -q "gated: no XENOS" apps/amf/worker/pulse.mjs && grep -q "gated" apps/amf/worker/feedback-sync.mjs',
    'HONEST BOUNDARY: all 3 seams are GATED on XENOS keys + fail-safe, and NOT live-verified — no XENOS_LEADS_KEY / XENOS_HITL_KEY issued yet, and the read-feed is not exposed. The machine is inject-and-run; the end-to-end VoiceCosmos dogfood thread is UNPROVEN until XENOS issues keys (P4/P9). Not claimed live.'),
];

const reason =
  'AMF ⇄ XENOS CRM amalgamation — all 3 seams built our-side (2026-07-02). XENOS (number7evencrm) ' +
  'accepted federate-first; both their unblocker endpoints exist. Our half: ① lead handoff ' +
  '(stage-j.mjs → /api/crm/leads/capture, replaces the dead DEMO_WEBHOOK_URL, B1 solved), ⑤ one ' +
  'cockpit (pulse.mjs → /api/hitl/create-approval, wired into runProductChain, two gates → one ' +
  'Operational Pulse, P9), ② feedback loop (feedback-sync.mjs → /api/hitl/recent-decisions → ' +
  'CONTINUUM ground_truth, canonical HITL_REWARD, fills the deferred SONA slot). Plus the 14↔9 ' +
  'product registry (xenos-registry.json). Every seam is GATED + fail-safe + smoke-green. ' +
  'HONEST (P4/P9): NOT live-verified — no XENOS keys issued, the dogfood thread is unproven; ' +
  'XENOS endpoints trusted from their handshake response, not verified cross-repo. Track-B assets ' +
  '(reported rendered in the Studio tab) are operator-reported, not verified this stamp. Waiting ' +
  'on: XENOS_LEADS_KEY + meta passthrough, XENOS_HITL_KEY, the recent-decisions read-feed. ' +
  'Do not claim the amalgamation is live until the first VoiceCosmos thread runs green.';

const verifyAll = (entries) => entries.forEach((x) => {
  try { execSync(x.verifyCommand, { cwd: REPO_ROOT, stdio: 'ignore', shell: '/bin/bash' }); console.log(`  ✓ ${x.name}`); }
  catch { throw new Error(`verifyCommand FAILED (not verify-green): ${x.name}`); }
});
console.log('Verifying seam entries are green at stamp time…');
verifyAll(active);

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const storage = openStorage('continuum');
const snap = storage.recordCheckpoint({ reason, active, dormant: [], broken: [] });
console.log(`\n✅ Stamped ${snap.id}  ·  active=${snap.active.length}  ·  hash=${snap.hash.slice(0, 16)}…`);
storage.close();
