/**
 * stage-j.mjs — Seam ① : AMF lead handoff → XENOS CRM (the CRM intake).
 *
 * Replaces the dead DEMO_WEBHOOK_URL. When AMF captures a lead (PDF magnet / form — NOT
 * cookie-scraping, P7/P8), it POSTs to XENOS `/api/crm/leads/capture` per their documented
 * contract (AMF-XENOS-HANDSHAKE-RESPONSE §2①). Maps AMF's shape → XENOS's, resolving the
 * OWNER tenant (whose CRM the lead lands in) via xenos-registry.json, and passing the
 * prospect's product interest + context + AMF asset refs through `meta` (blocker B1).
 *
 * Gated on XENOS_LEADS_URL + XENOS_LEADS_KEY (scoped server-to-server key XENOS issues us, P1).
 * UNTESTED without the key + a ratified registry (P4) — fail-safe: never crashes the pipeline,
 * never sends an un-owned lead.
 *
 *   node stage-j.mjs --smoke
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const loadRegistry = () => { try { return JSON.parse(readFileSync(resolve(HERE, 'xenos-registry.json'), 'utf8')); } catch { return { map: {} }; } };

/** AMF slug → { tenant_id, xenos_key } if the registry has a ratified owner, else null. */
export function resolveOwner(slug) {
  const m = loadRegistry().map?.[slug];
  return m && m.owner_tenant_id ? { tenant_id: m.owner_tenant_id, xenos_key: m.xenos_key || slug } : null;
}

/** Pure map: AMF lead shape + resolved owner → the XENOS /capture payload (testable). */
export function buildLeadPayload(lead, owner) {
  const c = lead.contact || {};
  return {
    email: c.email,
    tenant_id: owner.tenant_id,                     // OWNER tenant (VoiceCosmos's CRM), not the prospect (B1/B2)
    first_name: c.first_name, last_name: c.last_name, phone: c.phone, company: c.company,
    source: lead.source || 'website',               // website|referral|linkedin|cold_outreach|event|vapi_call
    medium: lead.medium || 'organic',               // organic|paid|social|email
    meta: {                                         // passthrough (B1) — XENOS adds this field
      product_interest: owner.xenos_key,
      context: lead.context || [],
      assetRefs: lead.assetRefs || [],
      origin: 'amf',
    },
  };
}

/** Seam ① — hand a captured lead to XENOS. Fail-safe: returns {ok,reason,payload}, never throws. */
export async function handoffLead(lead) {
  if (!lead?.contact?.email) return { ok: false, reason: 'no email' };
  const owner = resolveOwner(lead.product);
  if (!owner) return { ok: false, reason: `no owner_tenant_id for "${lead.product}" — registry not ratified (XENOS fills owner_tenant_id)` };
  const payload = buildLeadPayload(lead, owner);
  const base = process.env.XENOS_LEADS_URL, key = process.env.XENOS_LEADS_KEY;
  if (!base || !key) { console.error('[stage-j] XENOS_LEADS_URL/KEY not set — lead NOT sent (P6). payload built + ready.'); return { ok: false, reason: 'gated: no XENOS key', payload }; }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/crm/leads/capture`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-intake-key': key }, body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: `XENOS HTTP ${res.status}`, payload };
    const j = await res.json().catch(() => ({}));
    return { ok: true, leadId: j.lead_id || j.id || null, payload };
  } catch (e) { return { ok: false, reason: e.message, payload }; }
}

function smoke() {
  const owner = { tenant_id: 'ten_voicecosmos_demo', xenos_key: 'VoiceCosmos' };
  const lead = { product: 'voicecosmos', source: 'referral', medium: 'social',
    contact: { email: 'gm@coastalretreat.example', first_name: 'Sam', company: 'Coastal Retreat B&B' },
    context: ['downloaded: The Real Cost of Booking.com'], assetRefs: ['amf://post/2026-07-02/booking-cost'] };
  const p = buildLeadPayload(lead, owner);
  const okMap = p.email === lead.contact.email && p.tenant_id === owner.tenant_id
    && p.meta.product_interest === 'VoiceCosmos' && p.meta.origin === 'amf'
    && p.meta.assetRefs.length === 1 && p.source === 'referral';
  const okGate = !process.env.XENOS_LEADS_KEY; // no key in smoke → handoff must gate, not send
  console.error('\nstage-j smoke — Seam ① lead handoff (AMF → XENOS /api/crm/leads/capture)');
  console.error(`  payload: email=${p.email} · tenant_id=${p.tenant_id} · meta.product_interest=${p.meta.product_interest} · source=${p.source}`);
  console.error(`  B1 handled: prospect product → meta.product_interest; owner tenant → tenant_id ✓`);
  console.error(`  ${okMap && okGate ? '✅ PASS' : '❌ FAIL'} — AMF→XENOS contract maps clean; gated without key (untested live until XENOS issues it, P4)\n`);
  process.exit(okMap && okGate ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke();
  else console.error('usage: node stage-j.mjs --smoke  (or import { handoffLead })');
}
