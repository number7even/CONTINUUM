#!/usr/bin/env node
// verify-brand-packet.mjs — proof-gate for the Brand Onboarding Packet (define-once CI).
//
//   1. schema: every product carries brand_identity (a full packet, or explicit null = not onboarded)
//   2. voicecosmos is onboarded: 4 color roles + 3 font roles + a style_preset + a voice engine
//   3. the bridge emits valid tokens.json for an onboarded brand
//   4. THE UNIQUENESS LAW: the bridge HARD-REFUSES a non-onboarded brand (no fallback,
//      no template reuse — a brand never renders in another brand's clothes)
//   5. the bridge refuses an unknown slug
//   6. no two onboarded brands share an identical identity (each is UNIQUE)
//
//   node verify-brand-packet.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandIdentity, buildTokens } from './brand-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const j = JSON.parse(readFileSync(join(HERE, 'portfolio-universe.json'), 'utf8'));

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── schema ──────────────────────────────────────────────────────────────');
check('every product carries brand_identity (packet or explicit null)',
  j.products.every(p => 'brand_identity' in p), `${j.products.length} products`);
check('personal profile carries brand_identity', 'brand_identity' in j.personal);

const vc = j.products.find(p => p.slug === 'voicecosmos')?.brand_identity;
check('voicecosmos onboarded: 4 color roles', !!vc && ['canvas', 'ink', 'muted', 'accent'].every(k => /^#[0-9a-f]{6}$/i.test(vc.colors?.[k] ?? '')));
check('voicecosmos: 3 font roles + style_preset + voice engine',
  !!vc?.fonts?.display && !!vc?.fonts?.body && !!vc?.fonts?.mono && !!vc?.style_preset && !!vc?.voice?.engine,
  `${vc?.style_preset} · ${vc?.voice?.engine}`);

console.log('── the bridge ──────────────────────────────────────────────────────────');
const tokens = buildTokens(brandIdentity('voicecosmos'));
check('bridge emits tokens: colors[] + fonts[] + brand block',
  tokens.colors.length === 4 && tokens.fonts.length === 3 && tokens.brand.slug === 'voicecosmos',
  `colors=${tokens.colors.join(',')}`);
check('tokens carry the style_preset for build-frame', tokens.brand.style_preset === vc.style_preset);

console.log('── the uniqueness law (P4) ─────────────────────────────────────────────');
const notOnboarded = j.products.find(p => !p.brand_identity);
let refused = false, msg = '';
try { brandIdentity(notOnboarded.slug); } catch (e) { refused = true; msg = String(e.message); }
check(`non-onboarded brand ("${notOnboarded?.slug}") HARD-REFUSED`, refused && /NOT ONBOARDED/.test(msg));
let unknownRefused = false;
try { brandIdentity('no-such-brand'); } catch { unknownRefused = true; }
check('unknown slug refused', unknownRefused);

const onboarded = j.products.filter(p => p.brand_identity);
const sigs = onboarded.map(p => JSON.stringify([p.brand_identity.colors, p.brand_identity.fonts, p.brand_identity.style_preset]));
check('no two onboarded brands share an identical identity (each UNIQUE)',
  new Set(sigs).size === sigs.length, `${onboarded.length} onboarded`);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('BRAND_PACKET_VERIFY: GREEN — define-once CI: onboarded brands emit their unique tokens;');
  console.log('non-onboarded brands are refused loudly. No brand ever renders in another brand\'s clothes.');
  process.exit(0);
} else { console.log('BRAND_PACKET_VERIFY: RED'); process.exit(1); }
