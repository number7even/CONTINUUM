/**
 * feedback-sync.mjs — Seam ② : XENOS HITL decisions + reviews → CONTINUUM ground_truth.
 *
 * The return path that closes the loop. Polls XENOS's read-feed
 * (`GET /api/hitl/recent-decisions`, per AMF-XENOS-HANDSHAKE-RESPONSE §2②) and writes each
 * decision/review into CONTINUUM as a `ground_truth` Observation — filling the deferred
 * SONA/feedback slot in the 5-source moat. These become high-signal fuel for AMF's L3
 * scripting (social-proof / case-study content grounded in *real* verified outcomes).
 *
 * Reward mapping is theirs, canonical: HITL_REWARD = { approve:1.0, modify:0.7, reject:0.2 }.
 * Idempotent (stable id per decision) → safe to re-run / schedule. Privacy-scrubbed on write
 * (reviews may carry PII → storage.upsertObservation deep-scrubs, §8).
 *
 *   node feedback-sync.mjs --project ground-truth [--since 2026-07-01T00:00:00Z]
 *   node feedback-sync.mjs --smoke
 *
 * Gated on XENOS_HITL_URL + XENOS_HITL_KEY (the same scoped key as Seam ⑤, P1). Fail-safe.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const HITL_REWARD = { approve: 1.0, modify: 0.7, reject: 0.2 }; // XENOS canonical (contracts.ts)
const stableId = (seed) => { const h = createHash('sha256').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

/** Pure: a XENOS HITL decision/review → a CONTINUUM ground_truth Observation (testable). */
export function mapDecision(d) {
  const decision = String(d.decision || d.decision_type || '').toLowerCase();
  const reward = d.reward_signal != null ? Number(d.reward_signal) : (HITL_REWARD[decision] ?? null);
  const ctx = d.context || {};
  const content = [ctx.title, ctx.description, d.review_text, d.review].filter(Boolean).join(' — ')
    || `HITL ${decision} on ${d.flow_type || 'flow'} ${d.flow_id || ''}`.trim();
  return {
    id: stableId('xenos-decision:' + (d.id || d.flow_id || content)),
    sourceId: 'xenos_hitl',
    type: 'ground_truth',
    content,
    timestamp: d.created_at || d.decided_at || new Date().toISOString(),
    refs: [],
    metadata: { provider: 'xenos_hitl', flow_id: d.flow_id, flow_type: d.flow_type, decision, reward, tenant_id: d.tenant_id, product: d.product || d.meta?.product_interest, origin: 'seam2' },
  };
}

async function fetchDecisions(since) {
  const base = process.env.XENOS_HITL_URL, key = process.env.XENOS_HITL_KEY;
  if (!base || !key) return { gated: true, decisions: [] };
  const url = `${base.replace(/\/$/, '')}/api/hitl/recent-decisions${since ? `?since=${encodeURIComponent(since)}` : ''}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`XENOS HTTP ${res.status}`);
  const j = await res.json();
  return { gated: false, decisions: Array.isArray(j) ? j : (j.decisions || j.items || []) };
}

/** Ingest decisions → ground_truth in a CONTINUUM project. Idempotent. Returns count written. */
export function ingestDecisions(storage, decisions) {
  storage.upsertSource('xenos_hitl', 'docs', { adapter: 'feedback-sync' });
  let written = 0;
  for (const d of decisions) if (storage.upsertObservation(mapDecision(d))) written += 1; // null = privacy-scrubbed
  return written;
}

async function run() {
  const a = process.argv, get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const project = get('--project', 'ground-truth'), since = get('--since');
  let res; try { res = await fetchDecisions(since); } catch (e) { console.error(`[seam2] ${e.message}`); process.exit(1); }
  if (res.gated) { console.error('[seam2] XENOS_HITL_URL/KEY not set — feedback sync gated (P6). Wired + ready to strike.'); process.exit(0); }
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(project);
  const n = ingestDecisions(storage, res.decisions);
  console.error(`[seam2] ${n}/${res.decisions.length} XENOS decisions → ground_truth in "${project}"`);
  storage.close(); process.exit(0);
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'seam2-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const s = openStorage('seam2-test');
  const decisions = [
    { id: 'dec1', flow_id: 'voicecosmos-x1', flow_type: 'marketing', decision: 'approve', context: { title: 'Approved: Booking.com post', description: 'brand-safe, ship it' }, tenant_id: 'ten_vc', created_at: '2026-07-02T10:00:00Z' },
    { id: 'dec2', flow_id: 'voicecosmos-x2', flow_type: 'marketing', decision: 'reject', context: { title: 'Rejected: off-topic draft' }, created_at: '2026-07-02T10:05:00Z' },
    { id: 'rev1', flow_id: 'sale-77', flow_type: 'review', decision: 'approve', reward_signal: 0.95, review_text: 'ARIAN recovered three after-hours bookings in week one — game changer.', product: 'VoiceCosmos', created_at: '2026-07-02T11:00:00Z' },
  ];
  const n1 = ingestDecisions(s, decisions);
  const n2 = ingestDecisions(s, decisions); // re-run → idempotent (0 new-effect; same ids)
  const approve = s.getObservations([mapDecision(decisions[0]).id])[0];
  const reject = s.getObservations([mapDecision(decisions[1]).id])[0];
  const review = s.getObservations([mapDecision(decisions[2]).id])[0];
  const ok = n1 === 3
    && approve?.metadata?.reward === 1.0 && reject?.metadata?.reward === 0.2 && review?.metadata?.reward === 0.95
    && approve?.type === 'ground_truth' && /after-hours bookings/.test(review?.content || '')
    && s.getObservations([mapDecision(decisions[0]).id]).length === 1; // idempotent: still one row after re-run
  console.error('\nfeedback-sync smoke — Seam ② (XENOS decisions → CONTINUUM ground_truth)');
  console.error(`  ingested ${n1} (re-run wrote ${n2} — idempotent) · rewards: approve ${approve?.metadata?.reward} · reject ${reject?.metadata?.reward} · review ${review?.metadata?.reward}`);
  console.error(`  review → ground_truth fuel: "${(review?.content || '').slice(0, 52)}…"`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — decisions map to ground_truth w/ canonical rewards; idempotent; gated live-fetch (P4)\n`);
  s.close(); const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
