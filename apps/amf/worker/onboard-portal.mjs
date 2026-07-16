#!/usr/bin/env node
/**
 * onboard-portal.mjs — the Self-Serve Brand Onboarding Portal (SaaS Directives 2+3+4).
 *
 * Replaces hand-editing portfolio-universe.json with a web form that FORCES a complete
 * Brand Onboarding Packet before any access to the factory:
 *
 *   D2 · the form captures the EXACT schema the factory requires — Position (angle,
 *        topics ≥6, keywords), Feeds, Voice Kernel (verbal rules), Brand Identity
 *        (4 color roles, 3 font roles, style preset, TTS voice; logo optional at signup).
 *        An incomplete packet is STRUCTURALLY REFUSED (the Uniqueness Law upstream:
 *        brand-tokens.mjs already hard-refuses any brand without a full identity).
 *   D1 · the PAYMENT GATE wraps submission: no active/comped subscription on the
 *        registered tenant → the packet is NOT written and the factory stays closed.
 *   D4 · XENOS provisioning: a real owner tenant UUID is minted into xenos-registry.json
 *        with status "provisional-local" — LOUD, never silent: the registry's own comment
 *        says owner_tenant_id is XENOS's to confirm; until their API ratifies it, Stage-J
 *        carries the UUID but the odometer keeps reporting it as provisional (the silent
 *        0/13 vanish becomes a visible, queued hand-off).
 *   D3 · the moment the packet lands, calendar.mjs --brand <slug> fires automatically —
 *        the 30-day cadence lands on the tenant's board on day one.
 *
 *   node onboard-portal.mjs [--port 8791]
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTenants, saveTenants, registerTenant, requireActiveTenant } from './saas-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const UNIVERSE = join(HERE, 'portfolio-universe.json');
const REGISTRY = join(HERE, 'xenos-registry.json');

const csv = (s) => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** D2 — validate a submitted packet against the factory's exact schema. Returns issues[]. */
export function validatePacket(p) {
  const issues = [];
  if (!/^[a-z][a-z0-9-]{2,30}$/.test(p.slug ?? '')) issues.push('slug: lowercase kebab, 3–31 chars');
  if (!p.angle || p.angle.trim().length < 20) issues.push('position.angle: required (≥20 chars — the real business angle, not a slogan)');
  if (csv(p.topics).length < 6) issues.push('position.topics: ≥6 required (the calendar generator needs a topic pool)');
  if (csv(p.keywords).length < 4) issues.push('position.keywords: ≥4 required');
  if (csv(p.feeds).length < 1) issues.push('feeds: ≥1 authority source or signal query required');
  if (!p.voice_rules || p.voice_rules.trim().length < 20) issues.push('voice_kernel: required (how the brand sounds — rules, not vibes)');
  for (const role of ['canvas', 'ink', 'muted', 'accent']) if (!HEX.test(p[`color_${role}`] ?? '')) issues.push(`identity.colors.${role}: hex #rrggbb required`);
  for (const role of ['display', 'body', 'mono']) if (!(p[`font_${role}`] ?? '').trim()) issues.push(`identity.fonts.${role}: required`);
  if (!(p.style_preset ?? '').trim()) issues.push('identity.style_preset: required (the frame preset to remix)');
  if (!(p.tts_voice ?? '').trim()) issues.push('identity.voice: TTS engine/voice required');
  return issues;
}

/** D4 — mint a PROVISIONAL owner tenant UUID into the XENOS registry. Loud, never silent. */
export function provisionXenosTenant(slug, xenosKey, registryPath = REGISTRY) {
  const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
  const existing = reg.map[slug];
  if (existing?.owner_tenant_id) return existing.owner_tenant_id;          // already provisioned — never re-mint
  const uuid = randomUUID();
  reg.map[slug] = {
    ...(existing ?? {}),                                                    // preserve a confirmed xenos_key/status context
    xenos_key: existing?.xenos_key ?? xenosKey ?? slug,
    owner_tenant_id: uuid,
    status: 'provisional-local',
    note: `UUID minted locally at signup ${new Date().toISOString().slice(0, 10)} — XENOS must ratify (their registry comment: owner_tenant_id is XENOS's to fill). Stage-J carries it; odometer reports it provisional until confirmed.`,
  };
  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
  return uuid;
}

/** Identity-only validation — for COMPLETING an existing brand (position/feeds already
 *  ratified in the registry; only the identity block is missing). Same rigor, smaller set. */
export function validateIdentity(p, { needsVoiceKernel = false } = {}) {
  const issues = [];
  for (const role of ['canvas', 'ink', 'muted', 'accent']) if (!HEX.test(p[`color_${role}`] ?? '')) issues.push(`identity.colors.${role}: hex #rrggbb required`);
  for (const role of ['display', 'body', 'mono']) if (!(p[`font_${role}`] ?? '').trim()) issues.push(`identity.fonts.${role}: required`);
  if (!(p.style_preset ?? '').trim()) issues.push('identity.style_preset: required');
  if (!(p.tts_voice ?? '').trim()) issues.push('identity.voice: TTS engine/voice required');
  if (needsVoiceKernel && (!p.voice_rules || p.voice_rules.trim().length < 20)) issues.push('voice_kernel: required (this brand has none yet)');
  return issues;
}

/** COMPLETE an existing brand's missing identity (the "edit, don't re-onboard" path made
 *  real). Refuses if the brand already HAS an identity — a ratified identity is edited by
 *  the human in the registry, never silently overwritten. */
export function completeIdentity(p, universePath = UNIVERSE) {
  const uni = JSON.parse(readFileSync(universePath, 'utf8'));
  const prod = uni.products.find(x => x.slug === p.slug);
  if (!prod) throw new Error(`no such brand "${p.slug}"`);
  if (prod.brand_identity) throw new Error(`brand "${p.slug}" already has a ratified identity — edit it deliberately in the registry, never via re-onboarding`);
  const issues = validateIdentity(p, { needsVoiceKernel: !prod.voice_kernel });
  if (issues.length) return { ok: false, issues };
  prod.brand_identity = {
    ratified: `identity completed ${new Date().toISOString().slice(0, 10)} (position/feeds pre-existing)`,
    colors: { canvas: p.color_canvas, ink: p.color_ink, muted: p.color_muted, accent: p.color_accent },
    fonts: { display: p.font_display, body: p.font_body, mono: p.font_mono },
    display_case: p.display_case || null,
    style_preset: p.style_preset,
    style: p.style || null,
    logo: p.logo_path || null,
    logo_note: p.logo_path ? null : 'not supplied — renders run without a mark until deposited',
    voice: { engine: p.tts_voice.split(':')[0], ref: p.tts_voice.split(':')[1] ?? null },
    caption_identity: null,
  };
  if (p.voice_rules?.trim()) prod.voice_kernel = p.voice_rules;
  writeFileSync(universePath, JSON.stringify(uni, null, 2) + '\n');
  return { ok: true };
}

/** Write the completed packet into the define-once registry (the factory's source of truth). */
export function writePacket(p, tenantId, universePath = UNIVERSE) {
  const uni = JSON.parse(readFileSync(universePath, 'utf8'));
  if (uni.products.some(x => x.slug === p.slug)) throw new Error(`brand "${p.slug}" already exists — packets are define-once (edit, don't re-onboard)`);
  uni.products.push({
    slug: p.slug, priority: 2, geo: false, confidence: 'self-serve',
    sector: p.sector || p.angle.slice(0, 60),
    angle: p.angle,
    topics: csv(p.topics), keywords: csv(p.keywords),
    sales_signals: csv(p.sales_signals ?? ''),
    signal_query: csv(p.topics).slice(0, 6),
    feeds: csv(p.feeds).map(url => ({ url, tier: 2 })),
    own_feeds: [],
    voice_kernel: p.voice_rules,
    ...(tenantId ? { tenant: tenantId } : {}),                            // house brands carry NO tenant → never gated
    brand_identity: {
      ratified: `self-serve onboarding ${new Date().toISOString().slice(0, 10)}`,
      colors: { canvas: p.color_canvas, ink: p.color_ink, muted: p.color_muted, accent: p.color_accent },
      fonts: { display: p.font_display, body: p.font_body, mono: p.font_mono },
      display_case: p.display_case || null,
      style_preset: p.style_preset,
      style: p.style || null,
      logo: p.logo_path || null,
      logo_note: p.logo_path ? null : 'not supplied at signup — renders run without a mark until deposited',
      voice: { engine: p.tts_voice.split(':')[0], ref: p.tts_voice.split(':')[1] ?? null },
      caption_identity: null,
    },
  });
  writeFileSync(universePath, JSON.stringify(uni, null, 2) + '\n');
}

/** D3 — fire the calendar the moment onboarding completes. */
export function triggerCalendar(slug, { profile = 'company' } = {}) {
  const child = spawn('node', [join(HERE, 'calendar.mjs'), '--brand', slug, '--profile', profile], { stdio: 'ignore', detached: true });
  child.unref();
  return { fired: true, cmd: `calendar.mjs --brand ${slug} --profile ${profile}` };
}

/** The full onboarding transaction: gate → validate → packet → provision → calendar.
 *  house:true = the OPERATOR onboarding their OWN platform (locally, P9): the payment gate
 *  is skipped and NO tenant field is written — house brands are never gated in the pipeline.
 *  Completeness + uniqueness + provisioning + auto-calendar apply identically. */
export function onboard(input, { store = loadTenants(), universePath = UNIVERSE, registryPath = REGISTRY, fireCalendar = triggerCalendar, house = false } = {}) {
  // Route FIRST: an existing brand with a null identity is a COMPLETION, not a new packet —
  // its position/feeds are already ratified, so only identity-level validation applies.
  const uniPre = JSON.parse(readFileSync(universePath, 'utf8'));
  const existing = uniPre.products.find(x => x.slug === input.slug);
  const isCompletion = !!existing && !existing.brand_identity;
  if (existing && existing.brand_identity) {
    return { ok: false, stage: 'duplicate', issues: [`brand "${input.slug}" already exists with a ratified identity — packets are define-once (edit deliberately, don't re-onboard)`] };
  }

  // D2 — completeness is structural (full packet for new brands; identity-set for completions).
  const issues = isCompletion ? validateIdentity(input, { needsVoiceKernel: !existing.voice_kernel }) : validatePacket(input);
  if (issues.length) return { ok: false, stage: 'validate', issues };

  // D1 — no active subscription, no factory (external tenants only).
  let tenantId = null;
  if (!house) {
    tenantId = input.tenantId;
    if (!tenantId) { tenantId = registerTenant(store, { email: input.email ?? '(unset)', brandSlug: input.slug }); saveTenants(store); }
    try { requireActiveTenant(store, tenantId); }
    catch (e) { return { ok: false, stage: 'payment-gate', tenantId, issues: [e.message] }; }
  }

  // packet (new) or identity block (completion) + D4 + D3.
  const mode = isCompletion ? 'identity-completed' : 'new-brand';
  if (isCompletion) {
    const c = completeIdentity(input, universePath);
    if (!c.ok) return { ok: false, stage: 'validate', tenantId, issues: c.issues };
  } else {
    try { writePacket(input, tenantId, universePath); }
    catch (e) { return { ok: false, stage: 'duplicate', tenantId, issues: [String(e.message)] }; }
  }
  const xenosUuid = provisionXenosTenant(input.slug, input.xenos_key, registryPath);
  const cal = fireCalendar(input.slug);
  return { ok: true, mode, house, tenantId, slug: input.slug, xenosTenant: { uuid: xenosUuid, status: 'provisional-local' }, calendar: cal };
}

// ── the form (zero-dep) ───────────────────────────────────────────────────────
const FIELD = (n, l, ph, req = true) => `<label>${l}${req ? ' *' : ''}<input name="${n}" placeholder="${ph}" ${req ? 'required' : ''}></label>`;
export function formHtml(msg = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>AMF · Brand Onboarding</title><style>
  body{background:#05070a;color:#e5e7eb;font-family:ui-sans-serif,system-ui;max-width:760px;margin:0 auto;padding:28px}
  h1{color:#5eead4;font-size:20px;letter-spacing:1px} h2{font-size:13px;color:#a78bfa;letter-spacing:2px;margin-top:26px}
  label{display:block;font-size:12px;color:#94a3b8;margin:10px 0} input,textarea{width:100%;background:#0b1220;border:1px solid #262828;color:#e5e7eb;padding:8px;border-radius:6px;font-size:13px}
  button{margin-top:20px;background:rgba(94,234,212,.15);border:1px solid #5eead4;color:#5eead4;padding:10px 22px;border-radius:8px;font-weight:700;cursor:pointer}
  .msg{padding:10px;border:1px solid #f59e0b55;border-radius:8px;color:#fbbf24;font-size:12.5px;white-space:pre-wrap}
  .law{font-size:11px;color:#6b7280}</style></head><body>
  <h1>AMF · BRAND ONBOARDING PACKET</h1>
  <p class="law">Define once — consumed by everything downstream. The factory structurally refuses un-onboarded brands
  (the Uniqueness Law): no generic content, ever. * = required; an incomplete packet is not accepted.</p>
  ${msg ? `<div class="msg">${msg}</div>` : ''}
  <form method="POST" action="/api/onboard">
    <h2>ACCOUNT</h2>
    ${FIELD('email', 'Email', 'you@company.com')}${FIELD('tenantId', 'Tenant ID (returning subscriber)', 'leave blank on first signup', false)}
    <h2>POSITION</h2>
    ${FIELD('slug', 'Brand slug', 'acme-hotels')}${FIELD('angle', 'Business angle (the REAL one)', 'What you sell, to whom, why it wins — ≥20 chars')}
    ${FIELD('topics', 'Topics (≥6, comma-separated)', 'booking recovery, no-show, ...')}${FIELD('keywords', 'Keywords (≥4)', 'hotel, spa, ...')}
    ${FIELD('sales_signals', 'Sales signals', 'revenue leak, staffing cost', false)}
    <h2>FEEDS</h2>
    ${FIELD('feeds', 'Authority feeds / signal queries (≥1)', 'https://... , https://...')}
    <h2>VOICE KERNEL</h2>
    <label>Voice rules * <textarea name="voice_rules" rows="3" required placeholder="How the brand sounds: tone, banned phrases, POV — rules, not vibes"></textarea></label>
    <h2>BRAND IDENTITY (unique — no templates)</h2>
    ${FIELD('color_canvas', 'Canvas #hex', '#05070a')}${FIELD('color_ink', 'Ink #hex', '#e5e7eb')}${FIELD('color_muted', 'Muted #hex', '#94a3b8')}${FIELD('color_accent', 'Accent #hex', '#5eead4')}
    ${FIELD('font_display', 'Display font', 'Barlow')}${FIELD('font_body', 'Body font', 'Inter')}${FIELD('font_mono', 'Mono font', 'IBM Plex Mono')}
    ${FIELD('style_preset', 'Style preset', 'broadside')}${FIELD('tts_voice', 'TTS voice (engine:ref)', 'supertonic')}${FIELD('logo_path', 'Logo path', 'assets/brands/<slug>/logo.svg', false)}
    <button type="submit">Complete the packet → unlock the factory</button>
  </form></body></html>`;
}

export const portalServer = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/onboard') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const p = Object.fromEntries(new URLSearchParams(body));
      const result = onboard(p, { house: process.env.AMF_PORTAL_HOUSE === '1' });
      if (!result.ok) {
        res.writeHead(result.stage === 'payment-gate' ? 402 : 422, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));
        return;
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
    });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(formHtml());
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8791;
  portalServer.listen(port, () => console.log(`AMF onboarding portal → http://localhost:${port}  (packet → gate → provision → calendar)`));
}
