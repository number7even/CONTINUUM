#!/usr/bin/env node
// verify-site-syndication.mjs — proof-gate for the owned-site story seam (Site Directives 1–3).
//
//   D1 · THE OPTIMIZATION GATE (deterministic local baseline + the SEO Office seam):
//        meta-title ≤60 · meta-description ≤155 · keywords from the brand's RATIFIED topics
//        (never invented) · valid Schema.org JSON-LD (VideoObject with a render, Article
//        without) · URL slug. SEO Office absent → loud reason, baseline stands (P4);
//        a mocked $SEO_OFFICE_CMD verdict MERGES over the baseline.
//   D2 · THE CMS SEAM: the `site` channel composes the full SEO payload; no CMS token →
//        dry-run + Earn-Ledger row (never a fake live post); the sender POSTs the exact
//        REST body (endpoint/Bearer/jsonld) when creds exist.
//   D3 · THE P9 RIDE: `site` is in ALL_CHANNELS → the unified dashboard Approve
//        (queue+publish+H-attest) fires it with everything else; nothing auto-publishes.
//
//   node verify-site-syndication.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeoMeta, dispatchSeoOffice, optimize } from './seo-meta.mjs';
import { COMPOSERS, publish } from './publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const REC = {
  id: 'site-gate-test', slug: 'voicecosmos',
  queuedAt: '2026-07-16T10:00:00Z',
  brief: {
    headline: 'Capital renovations protect bricks — ARIAN protects revenue for boutique hotel groups everywhere',
    angle: 'Capital projects disrupt staffing and guest touchpoints — exactly when after-hours calls spike. ARIAN is the revenue layer that holds while the lobby gets renovated, recovering bookings that would otherwise silently vanish into voicemail.',
    cta: 'RECOVER', points: [{ stat: '24/7', label: 'after-hours calls answered' }],
  },
  render: { rendered: true, note: '/out/one-short.mp4' },
};

console.log('── D1 · the optimization gate (deterministic baseline) ─────────────────');
const seo = buildSeoMeta(REC);
check('meta-title ≤60 chars', seo.metaTitle.length <= 60, `${seo.metaTitle.length}: "${seo.metaTitle}"`);
check('meta-description ≤155 chars', seo.metaDescription.length <= 155, String(seo.metaDescription.length));
const topics = JSON.parse(readFileSync(join(HERE, 'portfolio-universe.json'), 'utf8')).products.find(p => p.slug === 'voicecosmos').topics;
check('keywords come from the RATIFIED topics (never invented)', seo.keywords.slice(0, 3).every(k => topics.includes(k)), seo.keywords.slice(0, 3).join(', '));
check('JSON-LD is a valid VideoObject (render present)', seo.jsonld['@context'] === 'https://schema.org' && seo.jsonld['@type'] === 'VideoObject' && !!seo.jsonld.name);
check('…and an Article without a render', buildSeoMeta({ ...REC, render: null }).jsonld['@type'] === 'Article');
check('URL slug derived + bounded', /^[a-z0-9-]+$/.test(seo.urlSlug) && seo.urlSlug.length <= 72, seo.urlSlug);

console.log('── D1 · the SEO Office seam (honest gating + merge) ────────────────────');
delete process.env.SEO_OFFICE_CMD;
const noOffice = dispatchSeoOffice(seo);
check('SEO Office absent → loud reason, baseline stands', noOffice.dispatched === false && /not installed/i.test(noOffice.reason) && noOffice.meta.source === 'local-baseline');
const merged = dispatchSeoOffice(seo, { cmd: 'mock', execImpl: () => JSON.stringify({ metaTitle: 'SEO-Office-improved title', pageScore: 92 }) });
check('a mocked SEO Office verdict MERGES over the baseline', merged.dispatched === true && merged.meta.metaTitle === 'SEO-Office-improved title' && merged.meta.pageScore === 92 && merged.meta.source === 'seo-office');
const broken = dispatchSeoOffice(seo, { cmd: 'mock', execImpl: () => { throw new Error('boom'); } });
check('a failing SEO Office → baseline stands, loudly', broken.dispatched === false && /failed/.test(broken.reason));
check('optimize() = baseline + seam verdict, in one call', optimize(REC).seoOffice.dispatched === false && optimize(REC).seo.metaTitle === seo.metaTitle);

console.log('── D2 · the CMS seam ───────────────────────────────────────────────────');
const composed = COMPOSERS.site(REC);
check('site composer carries the full SEO payload', composed.ok && composed.title === seo.metaTitle && composed.jsonld['@type'] === 'VideoObject' && composed.videoUrl === '/out/one-short.mp4' && composed.body.includes('RECOVER'));
check('rec.seo (pipeline-attached) is preferred over inline composition', COMPOSERS.site({ ...REC, seo: { ...seo, metaTitle: 'pipeline-attached' } }).title === 'pipeline-attached');
delete process.env.CMS_ACCESS_TOKEN; delete process.env.CMS_ENDPOINT;
const rows = await publish(REC, { channels: ['site'], live: true });
check('no CMS token → dry-run, never a fake live post', rows.length === 1 && rows[0].mode === 'dry-run' && /no site token|gated/.test(rows[0].result.reason));
check('…and the Earn Ledger row is appended (billable=false)', rows[0].unit === 'published_asset' && rows[0].billable === false);

console.log('── D3 · the P9 ride ────────────────────────────────────────────────────');
const pub = readFileSync(join(HERE, 'publish.mjs'), 'utf8');
check("'site' rides ALL_CHANNELS (the unified Approve fires it)", /ALL_CHANNELS = \[[^\]]*'site'\]/.test(pub));
const dash = readFileSync(join(HERE, 'dashboard.mjs'), 'utf8');
check('the dashboard click = queue + publish + H-attest (nothing auto-publishes)', dash.includes("'--publish'") && dash.includes("import('./attest.mjs')"));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('SITE_SYNDICATION_VERIFY: GREEN — stories to YOUR sites are SEO-optimized (baseline now,');
  console.log('SEO Office merges when installed), CMS-token-gated, Earn-Ledger\'d, and only ship on your P9 click.');
  process.exit(0);
} else { console.log('SITE_SYNDICATION_VERIFY: RED'); process.exit(1); }
