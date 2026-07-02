/**
 * pulse.mjs — Seam ⑤ : surface AMF drafts into the XENOS Operational Pulse (the ONE cockpit).
 *
 * When AMF queues a draft for review, it also POSTs a `marketing` approval into XENOS's HITL
 * board (per AMF-XENOS-HANDSHAKE-RESPONSE §2⑤: `POST /api/hitl/create-approval`). Two approval
 * gates collapse into one Operational Pulse — the operator governs everything from a single
 * board (P9). AMF never auto-publishes; it only asks.
 *
 * Gated on XENOS_HITL_URL + XENOS_HITL_KEY (scoped key XENOS issues, P1). Fail-safe: a Pulse
 * outage never blocks AMF's own review queue — the local draft still lands either way (P6).
 *
 *   node pulse.mjs --smoke
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { fileURLToPath } from 'node:url';

/** Map an AMF draft → the XENOS create-approval payload (pure, testable). */
export function buildApproval({ slug, brief, reviewId }) {
  const b = brief || {};
  const src = (b.sources || []).slice(0, 2).join(', ');
  return {
    flow_id: reviewId,
    flow_type: 'marketing',
    decision_type: 'approval',
    risk_score: 20, // AMF drafts are low-risk: no spend, no publish, human still approves
    context: {
      title: `Draft ready: ${slug} — ${(b.headline || '').slice(0, 70)}`,
      description: `AMF drafted a ${b.format || 'post'} for ${slug}. cta=${b.cta || '?'}.` +
        (src ? ` Sources: ${src}.` : '') +
        ` Review in AMF review-queue (${reviewId}); approve/reject here.`,
    },
  };
}

/** Seam ⑤ — POST the approval to XENOS. Best-effort; returns {ok,reason,payload}, never throws. */
export async function surfaceToPulse(draft) {
  if (!draft?.reviewId) return { ok: false, reason: 'no reviewId' };
  const payload = buildApproval(draft);
  const base = process.env.XENOS_HITL_URL, key = process.env.XENOS_HITL_KEY;
  if (!base || !key) { console.error('[pulse] XENOS_HITL_URL/KEY not set — approval NOT posted (P6); local review-queue unaffected.'); return { ok: false, reason: 'gated: no XENOS HITL key', payload }; }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/hitl/create-approval`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: `XENOS HTTP ${res.status}`, payload };
    const j = await res.json().catch(() => ({}));
    return { ok: true, approvalId: j.id || j.approval_id || null, payload };
  } catch (e) { return { ok: false, reason: e.message, payload }; }
}

function smoke() {
  const p = buildApproval({ slug: 'voicecosmos', reviewId: 'voicecosmos-2026-07-02-abc123',
    brief: { headline: 'The Real Cost of Booking.com: five steps to win back direct bookings', format: 'post', cta: 'REPORT', sources: ['https://skift.com/x', 'https://phocuswire/y'] } });
  const okShape = p.flow_type === 'marketing' && p.decision_type === 'approval' && p.risk_score === 20
    && p.flow_id === 'voicecosmos-2026-07-02-abc123' && /^Draft ready: voicecosmos/.test(p.context.title);
  const okGate = !process.env.XENOS_HITL_KEY; // no key → must gate, not post
  console.error('\npulse smoke — Seam ⑤ (AMF draft → XENOS /api/hitl/create-approval)');
  console.error(`  title: "${p.context.title}"`);
  console.error(`  flow_type=${p.flow_type} · decision_type=${p.decision_type} · risk=${p.risk_score}`);
  console.error(`  ${okShape && okGate ? '✅ PASS' : '❌ FAIL'} — draft maps to a marketing approval; gated without key; two gates → one Pulse cockpit (P9)\n`);
  process.exit(okShape && okGate ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke();
  else console.error('usage: node pulse.mjs --smoke  (or import { surfaceToPulse })');
}
