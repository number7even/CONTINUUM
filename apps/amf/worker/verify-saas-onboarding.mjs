#!/usr/bin/env node
// verify-saas-onboarding.mjs — proof-gate for the SaaS seam (Directives 1–4), hermetic:
// temp tenant store + temp universe/registry copies + an injected calendar spy.
//
//   D1 · PAYMENT GATE: unpaid → structurally refused (402 path) · comped/active → open ·
//        lapsed period → closed · unknown tenant → thrown · house brands never gated ·
//        Stripe live-verify is HONEST without a key · webhook sigs (valid/forged/expired)
//   D2 · PACKET FORM: incomplete packets refused field-by-field · a complete packet writes
//        the brand with a FULL identity that the uniqueness-law bridge accepts end-to-end ·
//        duplicate slug refused (define-once)
//   D3 · CALENDAR WIRING: onboarding completion fires calendar.mjs for the new slug
//   D4 · XENOS PROVISIONING: a real UUID lands in xenos-registry with status
//        "provisional-local" — loud, awaiting XENOS ratification (never silent)
//
//   node verify-saas-onboarding.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'amf-saas-'));
process.env.CONTINUUM_DATA_DIR = TMP;                                       // tenant store → temp
const UNI = join(TMP, 'universe.json'); copyFileSync(join(HERE, 'portfolio-universe.json'), UNI);
const REG = join(TMP, 'registry.json'); copyFileSync(join(HERE, 'xenos-registry.json'), REG);

const { loadTenants, saveTenants, registerTenant, requireActiveTenant, subscriptionActive, verifyWithStripe, verifyStripeSignature, applyStripeEvent } = await import('./saas-gate.mjs');
const { validatePacket, onboard } = await import('./onboard-portal.mjs');
const { brandIdentity } = await import('./brand-tokens.mjs');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── D1 · the payment gate ───────────────────────────────────────────────');
const store = loadTenants();
const tid = registerTenant(store, { email: 'guest@acme.com', brandSlug: 'acme-hotels' }); saveTenants(store);
let gated = false; try { requireActiveTenant(store, tid); } catch (e) { gated = /GATED|unpaid/i.test(e.message); }
check('unpaid tenant → the factory is GATED (thrown, loud)', gated);
let unknown = false; try { requireActiveTenant(store, 'no-such-tenant'); } catch { unknown = true; }
check('unknown tenant → refused', unknown);
check('house brand (no tenantId) → never gated', requireActiveTenant(store, null).house === true);
store.tenants[tid].subscription.comped = true;                               // the operator's grant (P9)
check('comped tenant → the gate opens', subscriptionActive(store.tenants[tid]));
store.tenants[tid].subscription = { status: 'active', currentPeriodEnd: '2020-01-01T00:00:00Z', comped: false };
check('active-but-LAPSED period → closed', !subscriptionActive(store.tenants[tid]));
store.tenants[tid].subscription = { status: 'active', currentPeriodEnd: '2099-01-01T00:00:00Z', comped: false, stripeSubId: 'sub_x' };
check('active + future period → open', subscriptionActive(store.tenants[tid]));
delete process.env.STRIPE_SECRET_KEY;
const v = await verifyWithStripe(store.tenants[tid]);
check('no STRIPE_SECRET_KEY → verified:false, honest reason (never pretend)', v.verified === false && /gated/i.test(v.reason));
const secret = 'whsec_test';
const payload = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_x', status: 'past_due' } } });
const now = 1700000000000; const ts = Math.floor(now / 1000);
const sig = `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex')}`;
check('webhook: valid signature accepted', verifyStripeSignature(payload, sig, secret, { now }));
check('webhook: forged signature rejected', !verifyStripeSignature(payload, `t=${ts},v1=${'0'.repeat(64)}`, secret, { now }));
check('webhook: expired timestamp rejected', !verifyStripeSignature(payload, sig, secret, { now: now + 10 * 60 * 1000 }));
const applied = applyStripeEvent(store, JSON.parse(payload));
check('event sync: subscription.updated → past_due applied to the store', applied.applied && store.tenants[tid].subscription.status === 'past_due');

console.log('── D2 · the packet is structural ───────────────────────────────────────');
const GOOD = {
  email: 'guest@acme.com', tenantId: tid, slug: 'acme-hotels',
  angle: 'Boutique hotel group recovering after-hours booking revenue across 12 properties',
  topics: 't1,t2,t3,t4,t5,t6', keywords: 'k1,k2,k3,k4', feeds: 'https://example.com/feed',
  voice_rules: 'Warm authority. Never hype. Speak to owners, not guests.',
  color_canvas: '#0a0a12', color_ink: '#f0ece5', color_muted: '#8a8fa0', color_accent: '#f2b25c',
  font_display: 'Fraunces', font_body: 'Inter', font_mono: 'IBM Plex Mono',
  style_preset: 'biennale-yellow', tts_voice: 'supertonic',
};
check('complete packet validates clean', validatePacket(GOOD).length === 0);
check('topics <6 refused', validatePacket({ ...GOOD, topics: 't1,t2' }).some(i => /topics/.test(i)));
check('bad hex refused', validatePacket({ ...GOOD, color_accent: 'orange' }).some(i => /accent/.test(i)));
check('missing voice kernel refused', validatePacket({ ...GOOD, voice_rules: '' }).some(i => /voice_kernel/.test(i)));

console.log('── the full transaction (D1→D2→D4→D3) ──────────────────────────────────');
store.tenants[tid].subscription = { status: 'active', currentPeriodEnd: '2099-01-01T00:00:00Z', comped: false };
saveTenants(store);
let calFired = null;
const res = onboard(GOOD, { store, universePath: UNI, registryPath: REG, fireCalendar: (slug) => { calFired = slug; return { fired: true }; } });
check('onboarding succeeds end-to-end', res.ok === true, JSON.stringify({ tenant: !!res.tenantId, xenos: res.xenosTenant?.status }));
check('D4: XENOS UUID minted as provisional-local (loud)', /^[0-9a-f-]{36}$/.test(res.xenosTenant?.uuid ?? '') && res.xenosTenant.status === 'provisional-local');
const reg = JSON.parse(readFileSync(REG, 'utf8'));
check('…and written into the registry with the ratification note', reg.map['acme-hotels']?.owner_tenant_id === res.xenosTenant.uuid && /XENOS must ratify/.test(reg.map['acme-hotels'].note));
check('D3: the calendar fired for the new brand', calFired === 'acme-hotels');
const id = brandIdentity('acme-hotels', UNI);
check('the written packet passes the uniqueness-law bridge end-to-end', id.identity.style_preset === 'biennale-yellow' && id.identity.colors.accent === '#f2b25c');
const uni = JSON.parse(readFileSync(UNI, 'utf8'));
check('the brand carries its tenant hook (the gate follows it into the pipeline)', uni.products.find(p => p.slug === 'acme-hotels')?.tenant === tid);
const dup = onboard(GOOD, { store, universePath: UNI, registryPath: REG, fireCalendar: () => ({}) });
check('re-onboarding the same slug refused (define-once)', dup.ok === false || dup.stage === 'validate', dup.ok ? 'DUPLICATED' : (dup.issues?.[0] ?? dup.stage));

console.log('── an UNPAID user cannot onboard at all ────────────────────────────────');
const tid2 = registerTenant(store, { email: 'free@rider.com', brandSlug: 'free-rider' }); saveTenants(store);
const blocked = onboard({ ...GOOD, slug: 'free-rider', tenantId: tid2 }, { store, universePath: UNI, registryPath: REG, fireCalendar: () => ({}) });
check('payment gate blocks the packet write (stage=payment-gate)', blocked.ok === false && blocked.stage === 'payment-gate');
check('…and no brand was written', !JSON.parse(readFileSync(UNI, 'utf8')).products.some(p => p.slug === 'free-rider'));

rmSync(TMP, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('SAAS_ONBOARDING_VERIFY: GREEN — no subscription → no factory; no complete packet → no brand;');
  console.log('onboarding mints a LOUD provisional XENOS tenant and fires the 30-day calendar automatically.');
  process.exit(0);
} else { console.log('SAAS_ONBOARDING_VERIFY: RED'); process.exit(1); }
