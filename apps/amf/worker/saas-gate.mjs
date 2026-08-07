#!/usr/bin/env node
/**
 * saas-gate.mjs — the Multi-Tenant Payment Gate (SaaS Directive 1).
 *
 * The HARD gate between external users and the factory's generative pipelines: no active,
 * verified subscription → no generation. Same seam discipline as publish.mjs / vault-guard:
 *
 *   • The tenant store is local + off-repo (P1): $CONTINUUM_DATA_DIR/amf-tenants.json —
 *     tenantId → { email, brandSlug, subscription: { status, stripeCustomerId, stripeSubId,
 *     currentPeriodEnd }, provisionedAt }.
 *   • Stripe is TOKEN-GATED (P4): with STRIPE_SECRET_KEY, subscription status is verified
 *     LIVE against the Stripe API (REST via fetch — zero deps); without it, only an explicit
 *     operator-granted comp ("comped": true, granted by the HUMAN via CLI) passes the gate.
 *     The gate NEVER pretends a payment it can't verify.
 *   • Webhook seam: verifyStripeSignature() (HMAC-SHA256, timing-safe, tolerance-windowed)
 *     + applyStripeEvent() keep the local store in sync with subscription lifecycle events.
 *   • The enforcement primitive every pipeline calls: requireActiveTenant(store, tenantId)
 *     — throws loudly on missing/lapsed; HOUSE brands (no tenant field) are never gated.
 *
 *   CLI:  node saas-gate.mjs --list
 *         node saas-gate.mjs --comp <tenantId>          (operator grant — P9, off-Stripe)
 *         node saas-gate.mjs --check <tenantId>
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_PATH = () => join(process.env.CONTINUUM_DATA_DIR || join(homedir(), '.continuum'), 'amf-tenants.json');
const STRIPE_API = process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1';

// ── the tenant store (local, off-repo — P1) ──────────────────────────────────
export function loadTenants(path = STORE_PATH()) {
  if (!existsSync(path)) return { tenants: {} };
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return { tenants: {} }; }
}
export function saveTenants(store, path = STORE_PATH()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/** Register a tenant (pre-payment: status starts 'unpaid' — the gate stays closed). */
export function registerTenant(store, { email, brandSlug }) {
  const tenantId = randomUUID();
  store.tenants[tenantId] = {
    email, brandSlug,
    subscription: { status: 'unpaid', stripeCustomerId: null, stripeSubId: null, currentPeriodEnd: null, comped: false },
    provisionedAt: new Date().toISOString(),
  };
  return tenantId;
}

// ── the HARD gate ─────────────────────────────────────────────────────────────
const ACTIVE = new Set(['active', 'trialing']);

/** Is this tenant's subscription active RIGHT NOW (local view)? Pure. */
export function subscriptionActive(t, now = Date.now()) {
  if (!t) return false;
  if (t.subscription?.comped) return true;                                 // operator grant (P9)
  if (!ACTIVE.has(t.subscription?.status)) return false;
  const end = t.subscription?.currentPeriodEnd;
  return !end || new Date(end).getTime() > now;                            // lapsed period → closed
}

/** THE enforcement primitive. Pipelines call this before generating for a tenant brand.
 *  Throws loudly (never a silent pass). House brands carry no tenantId → never gated. */
export function requireActiveTenant(store, tenantId, now = Date.now()) {
  if (!tenantId) return { house: true };                                   // house brand — not a tenant
  const t = store.tenants[tenantId];
  if (!t) throw new Error(`saas-gate: unknown tenant ${tenantId} — no access to the generative pipeline`);
  if (!subscriptionActive(t, now)) {
    throw new Error(`saas-gate: tenant ${tenantId} (${t.brandSlug}) subscription is ${t.subscription?.status ?? 'absent'} — the factory is GATED until an active, verified subscription exists`);
  }
  return { house: false, tenant: t };
}

// ── Stripe seam (REST via fetch — zero deps; token-gated, P4) ────────────────
/** Verify LIVE against Stripe. No STRIPE_SECRET_KEY → { verified:false } (never pretend). */
export async function verifyWithStripe(t, { fetchImpl = fetch } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { verified: false, reason: 'no STRIPE_SECRET_KEY — live verification gated (comp or local status only)' };
  if (!t?.subscription?.stripeSubId) return { verified: false, reason: 'tenant has no stripe subscription id' };
  const r = await fetchImpl(`${STRIPE_API}/subscriptions/${t.subscription.stripeSubId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return { verified: false, reason: `stripe HTTP ${r.status}` };
  const sub = await r.json();
  return { verified: true, status: sub.status, currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null };
}

/** Stripe webhook signature check — HMAC-SHA256 over `${t}.${payload}`, timing-safe,
 *  5-minute tolerance. Returns false on ANY malformation (never throws to the caller). */
export function verifyStripeSignature(payload, sigHeader, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  try {
    const parts = Object.fromEntries(String(sigHeader).split(',').map(kv => kv.split('=')));
    const ts = Number(parts.t);
    if (!ts || Math.abs(now / 1000 - ts) > toleranceSec) return false;
    const expected = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
    const got = Buffer.from(parts.v1 ?? '', 'hex');
    const want = Buffer.from(expected, 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  } catch { return false; }
}

/** Apply a verified Stripe event to the local store (subscription lifecycle sync). */
export function applyStripeEvent(store, event) {
  const type = event?.type ?? '';
  const obj = event?.data?.object ?? {};
  const subId = obj.id ?? obj.subscription;
  const entry = Object.entries(store.tenants).find(([, t]) => t.subscription?.stripeSubId === subId || (obj.customer && t.subscription?.stripeCustomerId === obj.customer));
  if (!entry) return { applied: false, reason: 'no matching tenant' };
  const [tenantId, t] = entry;
  if (/^customer\.subscription\.(created|updated)$/.test(type)) {
    t.subscription.status = obj.status ?? t.subscription.status;
    t.subscription.stripeSubId = obj.id ?? t.subscription.stripeSubId;
    if (obj.current_period_end) t.subscription.currentPeriodEnd = new Date(obj.current_period_end * 1000).toISOString();
  } else if (type === 'customer.subscription.deleted') {
    t.subscription.status = 'canceled';
  } else if (type === 'invoice.payment_failed') {
    t.subscription.status = 'past_due';
  } else {
    return { applied: false, reason: `unhandled event ${type}` };
  }
  return { applied: true, tenantId, status: t.subscription.status };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv; const cmd = a[2]; const id = a[3];
  const store = loadTenants();
  if (cmd === '--list') {
    const rows = Object.entries(store.tenants);
    if (!rows.length) console.log('(no tenants)');
    for (const [tid, t] of rows) console.log(`${tid}  ${t.brandSlug}  ${t.email}  ${t.subscription.comped ? 'COMPED' : t.subscription.status}  active=${subscriptionActive(t)}`);
  } else if (cmd === '--comp' && id) {
    if (!store.tenants[id]) { console.error(`unknown tenant ${id}`); process.exit(1); }
    store.tenants[id].subscription.comped = true;                          // the HUMAN's grant (P9)
    saveTenants(store);
    console.log(`✓ comped ${id} (${store.tenants[id].brandSlug}) — operator grant, off-Stripe`);
  } else if (cmd === '--check' && id) {
    try { requireActiveTenant(store, id); console.log('ACTIVE — the gate is open'); }
    catch (e) { console.log(`GATED — ${e.message}`); process.exit(1); }
  } else {
    console.error('usage: node saas-gate.mjs --list | --comp <tenantId> | --check <tenantId>');
    process.exit(2);
  }
}
