/**
 * Checkpoint: AMF ⇄ XENOS amalgamation — bidirectional loop BUILT (supersedes 2824c90a) — 2026-07-02.
 *
 * Every direction of the revenue loop is now built our-side, smoke-green, and securely gated.
 * The exact verifiable state is NOT "live" and NOT "pending build" — it is:
 *   ▎ BUILT · GATED · AWAITING XENOS KEYS.
 *
 *   AMF → XENOS:  ① lead handoff (stage-j)      ⑤ push draft → Pulse (pulse)
 *   XENOS → AMF:  ② feedback → ground_truth      return-path: Pulse approve → AMF render
 *   + the 14↔9 product registry (xenos-registry.json)
 *
 * HONEST (P4/P9): no XENOS key issued; the end-to-end VoiceCosmos dogfood thread is UNPROVEN.
 * XENOS endpoints trusted from their handshake response, not verified cross-repo. Track-B assets
 * are operator-reported, not verified. Publish stays a manual human act (approved ≠ published, P7).
 *
 * Every verifyCommand runs here and MUST exit 0 (verify-green at stamp time). Key-independent
 * (grep-based) so they re-prove after keys are injected too.
 *   node scripts/checkpoints/amf-xenos-loop-2026-07-02.mjs
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
    'AMF→XENOS Seam ① lead handoff → POST /api/crm/leads/capture. Replaces dead DEMO_WEBHOOK_URL. B1 solved. Gated on XENOS_LEADS_URL/KEY, fail-safe. Re-prove: `node apps/amf/worker/stage-j.mjs --smoke`.'),
  e('seam-5-one-cockpit-BUILT', 'apps/amf/worker/pulse.mjs + pipeline.mjs',
    'test -f apps/amf/worker/pulse.mjs && grep -q "surfaceToPulse" apps/amf/worker/pulse.mjs && grep -q "/api/hitl/create-approval" apps/amf/worker/pulse.mjs && grep -q "surfaceToPulse" apps/amf/worker/pipeline.mjs',
    'AMF→XENOS Seam ⑤ push — drafts surface into the XENOS Operational Pulse (POST /api/hitl/create-approval). Wired into runProductChain; Pulse outage never blocks the queue (P6). Two gates → one cockpit (P9). Re-prove: `node apps/amf/worker/pulse.mjs --smoke`.'),
  e('seam-2-feedback-loop-BUILT', 'apps/amf/worker/feedback-sync.mjs',
    'test -f apps/amf/worker/feedback-sync.mjs && grep -q "recent-decisions" apps/amf/worker/feedback-sync.mjs && grep -q "ground_truth" apps/amf/worker/feedback-sync.mjs && grep -q "HITL_REWARD" apps/amf/worker/feedback-sync.mjs',
    'XENOS→AMF Seam ② feedback — HITL decisions/reviews (GET /api/hitl/recent-decisions) → CONTINUUM ground_truth, canonical HITL_REWARD. Fills the deferred SONA slot; fuels L3. Idempotent, privacy-scrubbed, gated. Re-prove: `node apps/amf/worker/feedback-sync.mjs --smoke`.'),
  e('return-path-pulse-render-BUILT', 'apps/amf/worker/pulse-return.mjs + review.mjs',
    'test -f apps/amf/worker/pulse-return.mjs && grep -q "processDecisions" apps/amf/worker/pulse-return.mjs && grep -q "recent-decisions" apps/amf/worker/pulse-return.mjs && grep -q "approveDraft" apps/amf/worker/pulse-return.mjs && grep -q "export function approveDraft" apps/amf/worker/review.mjs',
    'XENOS→AMF RETURN PATH — a marketing approve in the Pulse (same /recent-decisions feed) → AMF renders the draft in-brand + moves to approved/; reject → rejected/. Matched by flow_id==reviewId. Idempotent (only acts on pending). Publish stays manual — approved+rendered ≠ published (P7). Re-prove: `node apps/amf/worker/pulse-return.mjs --smoke`.'),
  e('xenos-product-registry', 'apps/amf/worker/xenos-registry.json',
    'test -f apps/amf/worker/xenos-registry.json && grep -q "xenos_key" apps/amf/worker/xenos-registry.json && node -e "JSON.parse(require(\'fs\').readFileSync(\'apps/amf/worker/xenos-registry.json\'))"',
    'AMF 14 ↔ XENOS 9 product mapping (D1/B3). 5 confirmed, 2 flagged (sekago sector, fluxcore↔Photonflow), 6 AMF-only, 2 XENOS-only. Join key = xenos_key; owner_tenant_id is XENOS-to-fill. Drift explicit (P4).'),
  e('amalgamation-BUILT-GATED-awaiting-keys', 'apps/amf/worker (the honest state of the whole block)',
    'grep -q "gated: no XENOS" apps/amf/worker/stage-j.mjs && grep -q "gated: no XENOS" apps/amf/worker/pulse.mjs && grep -q "gated" apps/amf/worker/feedback-sync.mjs && grep -q "gated" apps/amf/worker/pulse-return.mjs',
    'HONEST STATE: the entire amalgamation is BUILT · GATED · AWAITING XENOS KEYS. All 4 seam-directions + registry are our-side complete, smoke-green, fail-safe — and NOT live-verified. Blocked ONLY on: XENOS_LEADS_KEY + meta passthrough, XENOS_HITL_KEY, the /api/hitl/recent-decisions read-feed. The moment those land → inject to .env.local (P1) → run the VoiceCosmos dogfood thread → THEN a new checkpoint flips this to live-verified. Not claimed live (P4/P9).'),
];

const reason =
  'AMF ⇄ XENOS CRM amalgamation — bidirectional loop BUILT (supersedes 2824c90a), 2026-07-02. ' +
  'Exact verifiable state: BUILT · GATED · AWAITING XENOS KEYS — not "live", not "pending build". ' +
  'Both directions complete our-side: AMF→XENOS [① lead handoff stage-j → /api/crm/leads/capture; ' +
  '⑤ push draft pulse → /api/hitl/create-approval, wired into the chain], XENOS→AMF [② feedback ' +
  'feedback-sync → /api/hitl/recent-decisions → CONTINUUM ground_truth (canonical HITL_REWARD); ' +
  'return-path pulse-return → same feed, marketing approve → AMF render, reject → rejected]. Plus ' +
  'the 14↔9 product registry. Every seam gated + fail-safe + smoke-green. One /recent-decisions ' +
  'feed serves both ② and the return path (no redundant polling). Publish stays a manual human ' +
  'act (approved+rendered ≠ published, P7). HONEST (P4/P9): NOT live-verified — no XENOS keys ' +
  'issued, dogfood thread unproven; XENOS endpoints trusted from their handshake, not verified ' +
  'cross-repo; Track-B assets operator-reported. Ball is in XENOS court: XENOS_LEADS_KEY (+meta), ' +
  'XENOS_HITL_KEY, expose the read-feed. Then inject → flip the switch → prove the loop end-to-end.';

const verifyAll = (entries) => entries.forEach((x) => {
  try { execSync(x.verifyCommand, { cwd: REPO_ROOT, stdio: 'ignore', shell: '/bin/bash' }); console.log(`  ✓ ${x.name}`); }
  catch { throw new Error(`verifyCommand FAILED (not verify-green): ${x.name}`); }
});
console.log('Verifying the 6 amalgamation entries are green at stamp time…');
verifyAll(active);

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const storage = openStorage('continuum');
const snap = storage.recordCheckpoint({ reason, active, dormant: [], broken: [] });
console.log(`\n✅ Stamped ${snap.id}  ·  active=${snap.active.length}  ·  hash=${snap.hash.slice(0, 16)}…`);
storage.close();
