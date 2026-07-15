#!/usr/bin/env node
/**
 * brand-tokens.mjs — the Brand Onboarding Packet → video pipeline bridge.
 *
 * Reads a brand's ratified `brand_identity` from portfolio-universe.json (the define-once
 * registry) and emits the `capture/extracted/tokens.json` a HyperFrames video project
 * consumes (build-frame.mjs remixes the chosen preset onto it). One edit in the packet
 * re-brands every future video for that product (P3).
 *
 * The uniqueness law (P4): a brand whose brand_identity is null has NOT been onboarded —
 * this bridge HARD-REFUSES it. No fallback palette, no template reuse: a brand never
 * renders in another brand's clothes. Onboard it first (define its unique packet).
 *
 *   node brand-tokens.mjs --brand voicecosmos --out videos/<project>/capture/extracted/
 *   import { brandIdentity, buildTokens } from './brand-tokens.mjs'
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Load a brand's packet from the registry. Throws (loud, P4) when absent or not onboarded. */
export function brandIdentity(slug, universePath = join(HERE, 'portfolio-universe.json')) {
  const j = JSON.parse(readFileSync(universePath, 'utf8'));
  const p = slug === 'personal' ? j.personal : (j.products ?? []).find(x => x.slug === slug);
  if (!p) throw new Error(`brand-tokens: unknown brand "${slug}" — not in portfolio-universe.json`);
  if (!p.brand_identity) {
    throw new Error(
      `brand-tokens: "${slug}" is NOT ONBOARDED — brand_identity is null. Each brand is UNIQUE: ` +
      `define its packet (colors, fonts, style_preset, logo, voice) in portfolio-universe.json first. ` +
      `No fallback is provided by design (a brand never renders in another brand's clothes).`,
    );
  }
  return { slug, angle: p.angle ?? p.positioning ?? '', identity: p.brand_identity };
}

/** The packet → the tokens.json shape build-frame.mjs consumes. Pure. */
export function buildTokens({ slug, angle, identity }) {
  const c = identity.colors ?? {};
  const f = identity.fonts ?? {};
  return {
    title: `${slug} — ${identity.style ?? 'brand'} identity (ratified: ${identity.ratified ?? 'unset'})`,
    description: angle,
    colors: [c.canvas, c.ink, c.accent, c.muted].filter(Boolean),
    fonts: [f.display, f.body, f.mono].filter(Boolean),
    // Extra keys ride along for consumers beyond build-frame (assemblers, caption skins):
    brand: {
      slug,
      display_case: identity.display_case ?? null,
      style_preset: identity.style_preset ?? null,
      logo: identity.logo ?? null,
      voice: identity.voice ?? null,
      caption_identity: identity.caption_identity ?? null,
    },
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const bi = process.argv.indexOf('--brand');
  const oi = process.argv.indexOf('--out');
  const slug = bi > 0 ? process.argv[bi + 1] : null;
  const outDir = oi > 0 ? resolve(process.argv[oi + 1]) : null;
  if (!slug) { console.error('usage: node brand-tokens.mjs --brand <slug|personal> [--out <dir>]'); process.exit(2); }
  let packet;
  try { packet = brandIdentity(slug); } catch (e) { console.error(String(e.message ?? e)); process.exit(1); }
  const tokens = buildTokens(packet);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
    console.log(`✓ ${slug} → ${join(outDir, 'tokens.json')} (preset: ${tokens.brand.style_preset ?? 'unset'})`);
  } else {
    console.log(JSON.stringify(tokens, null, 2));
  }
}
