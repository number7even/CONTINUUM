#!/usr/bin/env node
/**
 * seo-meta.mjs — the AMF → SEO optimization gate (Site-Syndication Directive 1).
 *
 * HONEST SCOPE (P4, verified 2026-07-16): "SEO Office" (./.seo-office/, the 25-specialist
 * orchestrator) is NOT installed on this machine — no directory, no CLI. So this module is
 * built the way every partner seam is built:
 *
 *   • buildSeoMeta(rec, packet?) — the DETERMINISTIC LOCAL BASELINE, real value now:
 *     meta-title (≤60), meta-description (≤155), AI-citable keywords (packet topics ∩ brief),
 *     a valid Schema.org JSON-LD block (VideoObject when a render exists, Article otherwise),
 *     and a URL slug. Pure, testable, no network.
 *   • dispatchSeoOffice(payload) — the SEAM: when $SEO_OFFICE_CMD lands (the orchestrator's
 *     CLI — page-analyzer + schema-validator), the payload is piped to it and its verdict
 *     MERGES OVER the baseline. Absent → { dispatched:false } with a loud reason; the
 *     baseline stands. Wired now, gated until the install exists — never pretended.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const clip = (s, n) => { s = String(s ?? '').trim(); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'; };

/** Deterministic local SEO baseline for an AMF artifact record. Pure. */
export function buildSeoMeta(rec, universePath = join(HERE, 'portfolio-universe.json')) {
  const b = rec.brief ?? rec;
  const slug = rec.slug ?? rec.brand ?? 'brand';
  let product = null;
  try { product = JSON.parse(readFileSync(universePath, 'utf8')).products.find(p => p.slug === slug) ?? null; } catch { /* registry optional for pure use */ }

  const headline = b.headline ?? '(untitled)';
  const metaTitle = clip(headline, 60);
  const metaDescription = clip(b.angle ?? (b.points ?? []).map(p => p.label).join('. ') ?? headline, 155);
  // AI-citable keywords: the brand's ratified topics first (the demand-led terms), then
  // brief keywords — deduped, ≤10. Never invented beyond the registry + the brief.
  const seen = new Set(); const keywords = [];
  for (const k of [...(product?.topics ?? []), ...(b.keywords ?? []), slug]) {
    const key = String(k).toLowerCase();
    if (!seen.has(key) && keywords.length < 10) { seen.add(key); keywords.push(k); }
  }
  const urlSlug = headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);

  const hasVideo = !!rec.render?.rendered;
  const jsonld = hasVideo
    ? {
        '@context': 'https://schema.org', '@type': 'VideoObject',
        name: metaTitle, description: metaDescription,
        uploadDate: (rec.queuedAt ?? new Date().toISOString()).slice(0, 10),
        contentUrl: rec.render?.note ?? undefined,
        keywords: keywords.join(', '),
        publisher: { '@type': 'Organization', name: b.brand ?? slug },
      }
    : {
        '@context': 'https://schema.org', '@type': 'Article',
        headline: metaTitle, description: metaDescription,
        datePublished: (rec.queuedAt ?? new Date().toISOString()).slice(0, 10),
        keywords: keywords.join(', '),
        author: { '@type': 'Organization', name: b.brand ?? slug },
      };

  return { metaTitle, metaDescription, keywords, urlSlug, jsonld, source: 'local-baseline' };
}

/** The SEO Office seam — env-gated on $SEO_OFFICE_CMD (its future CLI). The command receives
 *  the payload JSON on stdin and must print a JSON verdict; its fields merge OVER the
 *  baseline. Absent/failed → the baseline stands, loudly noted. */
export function dispatchSeoOffice(payload, { cmd = process.env.SEO_OFFICE_CMD, execImpl = execSync } = {}) {
  if (!cmd) {
    return { dispatched: false, reason: 'SEO_OFFICE_CMD not set — SEO Office is not installed on this machine (verified 2026-07-16); the deterministic local baseline stands', meta: payload };
  }
  try {
    const out = execImpl(cmd, { input: JSON.stringify(payload), encoding: 'utf8', timeout: 120_000 });
    const verdict = JSON.parse(String(out).trim().split('\n').pop());
    return { dispatched: true, meta: { ...payload, ...verdict, source: 'seo-office' } };
  } catch (e) {
    return { dispatched: false, reason: `SEO Office dispatch failed (${String(e.message).slice(0, 80)}) — baseline stands`, meta: payload };
  }
}

/** The optimization gate the pipeline calls: baseline → (optional) SEO Office merge. */
export function optimize(rec) {
  const baseline = buildSeoMeta(rec);
  const d = dispatchSeoOffice(baseline);
  return { seo: d.meta, seoOffice: { dispatched: d.dispatched, reason: d.reason ?? null } };
}

// CLI:  node seo-meta.mjs <brief.json>
if (import.meta.url === `file://${process.argv[1]}`) {
  const f = process.argv[2];
  if (!f) { console.error('usage: node seo-meta.mjs <brief.json>'); process.exit(2); }
  const rec = JSON.parse(readFileSync(f, 'utf8'));
  console.log(JSON.stringify(optimize(rec), null, 2));
}
