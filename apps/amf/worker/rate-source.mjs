/**
 * rate-source.mjs — the Hand-1 ratification ritual (P9: machine proposes, human disposes).
 *
 * Given a candidate feed + a product, it SAMPLES the live feed and measures TOPICAL FIT
 * against that product's Portfolio-Universe vocabulary (topics + keywords + sales_signals).
 * It then PROPOSES a tier band — but never assigns authority itself. Authority (is this a
 * primary/trade source you trust?) is the human's call, encoded by hand into
 * portfolio-universe.json. The machine cannot generate trust (P9); it can only tell you
 * whether a feed is even ON-TOPIC before you spend a tier on it.
 *
 *   node rate-source.mjs --url https://skift.com/feed/ --brand voicecosmos   # fit to one product
 *   node rate-source.mjs --url https://krebsonsecurity.com/feed/             # which product does it fit?
 *   node rate-source.mjs --smoke
 *
 * Deliberately has NO --apply: it will not write to the universe. Encoding a source is a
 * human ratification step, not an automated one. Copy the paste-ready line yourself.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from './adapter-news.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'from', 'into', 'its', 'has', 'have', 'will', 'not']);
const terms = (t) => [...new Set((String(t).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)))];
export const loadUniverse = () => JSON.parse(readFileSync(resolve(HERE, 'portfolio-universe.json'), 'utf8'));
export const productTerms = (p) => [...new Set([...(p.topics || []), ...(p.keywords || []), ...(p.sales_signals || [])].flatMap((s) => terms(s)))];

/** Fraction of a product's vocabulary that appears anywhere in the feed's recent text. */
export function fitScore(feedText, p) {
  const pt = productTerms(p);
  const lc = feedText.toLowerCase();
  const matched = pt.filter((t) => lc.includes(t));
  return { fraction: pt.length ? matched.length / pt.length : 0, matched, total: pt.length };
}
export function proposeTier(fraction) {
  if (fraction >= 0.30) return { band: 'T1–T2', note: 'strong topical fit — assign T1 if a primary/trade source, else T2' };
  if (fraction >= 0.12) return { band: 'T2–T3', note: 'moderate fit — T2 only if authoritative, else T3' };
  return { band: 'reject / T3', note: 'weak fit — likely noise for this product; reject, or T3 at most' };
}

/** Fetch + parse a feed's recent items. Throws on unreachable (caller decides). */
export async function sampleFeed(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'continuum-rate-source/0.1' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

async function run() {
  const a = process.argv, get = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  const url = get('--url'), brand = get('--brand');
  if (!url) { console.error('usage: node rate-source.mjs --url <feed> [--brand <slug>]'); process.exit(2); }
  let items; try { items = await sampleFeed(url); } catch (e) { console.error(`\n❌ ${url}\n   unreachable: ${e.message} — cannot rate an unreachable feed (P4)\n`); process.exit(1); }
  const text = items.map((i) => `${i.title} ${i.content}`).join(' ');
  const newest = items.map((i) => i.published).filter(Boolean).sort().pop();
  console.error(`\nrate-source · ${url}`);
  console.error(`  reachable ✓ · ${items.length} items · newest ${newest ? newest.slice(0, 10) : '?'}`);
  if (!items.length) { console.error('  (no items parsed — feed may not be RSS/Atom)\n'); process.exit(1); }

  const uni = loadUniverse();
  const targets = brand ? uni.products.filter((p) => p.slug === brand) : uni.products.filter((p) => productTerms(p).length);
  if (brand && !targets.length) { console.error(`  no such product: ${brand}\n`); process.exit(2); }
  const scored = targets.map((p) => ({ p, fit: fitScore(text, p) })).sort((x, y) => y.fit.fraction - x.fit.fraction);

  if (brand) {
    const { p, fit } = scored[0], tier = proposeTier(fit.fraction);
    console.error(`  fit → ${p.slug}: ${(fit.fraction * 100).toFixed(0)}% (${fit.matched.length}/${fit.total} vocab terms)`);
    console.error(`  matched: ${fit.matched.slice(0, 14).join(', ') || '(none)'}`);
    console.error(`\n  PROPOSAL (ratify before encoding — authority is YOUR call, P9):`);
    console.error(`    proposed tier: ${tier.band} — ${tier.note}`);
    console.error(`    paste into ${p.slug}.feeds[]:  {"url": "${url}", "tier": <1|2|3>, "name": "<source>"}\n`);
  } else {
    console.error(`  which pool does this feed belong to? (topical fit, best first):`);
    for (const { p, fit } of scored.slice(0, 5)) console.error(`    ${(fit.fraction * 100).toFixed(0).padStart(3)}%  ${p.slug.padEnd(14)} ${fit.matched.slice(0, 6).join(', ')}`);
    console.error(`\n  → assign to the top-fit product; you set the tier (authority is human-rated, P9).\n`);
  }
  process.exit(0);
}

async function smoke() {
  const xml = '<?xml version="1.0"?><rss version="2.0"><channel>' +
    '<item><title>Hotel no-show revenue leak</title><description>Boutique hotels lose bookings to after-hours calls; a concierge recovers occupancy.</description><link>https://ex/1</link><pubDate>Tue, 01 Jul 2026 08:00:00 GMT</pubDate></item>' +
    '<item><title>Direct booking vs OTA commission</title><description>Reservations and guest reservation revenue.</description><link>https://ex/2</link><pubDate>Tue, 01 Jul 2026 07:00:00 GMT</pubDate></item>' +
    '</channel></rss>';
  const items = parseFeed(xml);
  const text = items.map((i) => `${i.title} ${i.content}`).join(' ');
  const uni = loadUniverse();
  const vc = uni.products.find((p) => p.slug === 'voicecosmos');
  const vid = uni.products.find((p) => p.slug === 'voiceidvault');
  const fitVc = fitScore(text, vc), fitVid = fitScore(text, vid);
  const scored = uni.products.filter((p) => productTerms(p).length).map((p) => ({ slug: p.slug, f: fitScore(text, p).fraction })).sort((x, y) => y.f - x.f);
  const ok = fitVc.fraction > fitVid.fraction && scored[0].slug === 'voicecosmos' && proposeTier(fitVc.fraction).band.length > 0;
  console.error(`\nrate-source smoke — hospitality feed rated against the portfolio`);
  console.error(`  voicecosmos fit ${(fitVc.fraction * 100).toFixed(0)}% > voiceidvault ${(fitVid.fraction * 100).toFixed(0)}%`);
  console.error(`  best-fit product: ${scored[0].slug} (${(scored[0].f * 100).toFixed(0)}%) · proposed ${proposeTier(fitVc.fraction).band}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — a hospitality feed rates highest to voicecosmos; machine proposes, human assigns tier\n`);
  process.exit(ok ? 0 : 1);
}

// only run the CLI when invoked directly — safe to `import { fitScore, ... }` elsewhere
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
