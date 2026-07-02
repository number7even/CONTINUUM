/**
 * pulse-return.mjs — the RETURN PATH: Pulse approve → AMF render (Seam ⑤, reverse direction).
 *
 * Seam ⑤ pushes AMF drafts INTO the XENOS Operational Pulse (`pulse.mjs`). This closes the
 * loop the other way: when the operator decides in the Pulse, AMF acts. It reuses the same
 * decision feed Seam ② polls (`GET /api/hitl/recent-decisions`) — for a `marketing` draft:
 *   • **approve** → render the asset in-brand (produce-post/report) + move to approved/
 *   • **reject**  → move to rejected/
 * Matched by `flow_id` == the AMF reviewId. Idempotent: only acts on drafts still `pending`
 * (a re-poll of an already-approved draft is skipped), so it's safe to run on a schedule.
 *
 *   node pulse-return.mjs [--since 2026-07-02T00:00:00Z]
 *   node pulse-return.mjs --smoke
 *
 * Gated on XENOS_HITL_URL + XENOS_HITL_KEY (same scoped key as Seams ⑤/②). Fail-safe: a Pulse
 * outage never touches the local queue; render failures are best-effort (P6). Publish stays
 * manual — approved+rendered ≠ published (P7).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { fileURLToPath } from 'node:url';
import { fetchDecisions } from './feedback-sync.mjs';
import { approveDraft, rejectDraft, draftBucket } from './review.mjs';

/** Route XENOS decisions → AMF gate actions. render:false in tests to skip the heavy render. */
export async function processDecisions(decisions, { render = true } = {}) {
  const out = { rendered: [], rejected: [], skipped: [] };
  for (const d of decisions || []) {
    if (String(d.flow_type || '') !== 'marketing') continue; // only AMF draft approvals
    const id = d.flow_id; if (!id) continue;
    const bucket = draftBucket(id);
    if (bucket !== 'pending') { out.skipped.push({ id, reason: bucket ? `already ${bucket}` : 'no local draft' }); continue; }
    const decision = String(d.decision || d.decision_type || '').toLowerCase();
    if (decision === 'approve') { const r = approveDraft(id, { render }); out.rendered.push({ id, slug: r.slug, rendered: r.render?.rendered ?? render }); }
    else if (decision === 'reject') { rejectDraft(id, (d.context && d.context.title) || 'rejected in Pulse'); out.rejected.push({ id }); }
    else out.skipped.push({ id, reason: `decision=${decision || '?'}` });
  }
  return out;
}

async function run() {
  const a = process.argv, get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  let res; try { res = await fetchDecisions(get('--since')); } catch (e) { console.error(`[return] ${e.message}`); process.exit(1); }
  if (res.gated) { console.error('[return] XENOS_HITL_URL/KEY not set — Pulse return-path gated (P6). Wired + ready to strike.'); process.exit(0); }
  const out = await processDecisions(res.decisions);
  console.error(`[return] rendered ${out.rendered.length} · rejected ${out.rejected.length} · skipped ${out.skipped.length}`);
  for (const r of out.rendered) console.error(`   ▶ rendered ${r.slug} (${r.id}) — approved in Pulse → asset in out/ (publish stays manual, P7)`);
  process.exit(0);
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { enqueueForReview } = await import('./pipeline.mjs');
  // seed two pending drafts
  const idA = enqueueForReview({ slug: 'voicecosmos', format: 'post', brief: { headline: 'Booking.com cost', cta: 'REPORT', points: [] } });
  const idR = enqueueForReview({ slug: 'voiceidvault', format: 'post', brief: { headline: 'deepfake detection', cta: 'DETAILS', points: [] } });
  const decisions = [
    { flow_id: idA, flow_type: 'marketing', decision: 'approve', context: { title: 'ship it' } },
    { flow_id: idR, flow_type: 'marketing', decision: 'reject', context: { title: 'off-brand' } },
    { flow_id: 'sale-77', flow_type: 'review', decision: 'approve' }, // non-marketing → ignored (that's Seam ②)
  ];
  const first = await processDecisions(decisions, { render: false }); // render:false → test routing, not the heavy Chrome render
  const second = await processDecisions(decisions, { render: false }); // re-poll → idempotent (both already moved)
  const ok = first.rendered.length === 1 && first.rendered[0].id === idA
    && first.rejected.length === 1 && first.rejected[0].id === idR
    && draftBucket(idA) === 'approved' && draftBucket(idR) === 'rejected'
    && second.rendered.length === 0 && second.rejected.length === 0 && second.skipped.length >= 2; // idempotent
  // cleanup
  const { rmSync } = await import('node:fs'); const { dirname, join } = await import('node:path');
  const HERE = dirname(fileURLToPath(import.meta.url));
  for (const b of ['approved', 'rejected', 'pending']) for (const id of [idA, idR]) rmSync(join(HERE, 'out', 'review-queue', b, `${id}.json`), { force: true });
  console.error('\npulse-return smoke — the RETURN PATH (Pulse approve → AMF render / reject)');
  console.error(`  marketing approve(${idA.slice(0, 14)}…) → rendered+approved · reject(${idR.slice(0, 14)}…) → rejected · review flow → ignored (Seam ②)`);
  console.error(`  re-poll: rendered ${second.rendered.length} rejected ${second.rejected.length} skipped ${second.skipped.length} (idempotent — already-decided drafts skipped)`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — Pulse decisions drive AMF; only pending acted on; publish stays human (P7)\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
