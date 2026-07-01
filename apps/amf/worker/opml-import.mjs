/**
 * opml-import.mjs — Feedly sources → portfolio matching (the point of the whole exercise).
 *
 * You curate feeds in Feedly; Feedly's API is Enterprise-only, but "Export OPML" is FREE.
 * Drop that OPML here and this reads every source, checks it's reachable, and runs each
 * through the rate-source fit test against the whole Portfolio Universe — proposing which
 * product each feed belongs to and a tier band. It NEVER writes the universe: matching is
 * a proposal for you to ratify (P9 — the agent proposes, the human assigns authority).
 *
 *   node opml-import.mjs --file ~/feedly.opml            # match every source to the portfolio
 *   node opml-import.mjs --file ~/feedly.opml --brand voicecosmos   # only sources that fit one product
 *   node opml-import.mjs --smoke
 *
 * Output groups feeds under their best-fit product with a proposed tier + paste-ready line.
 * Cloudflare-walled feeds (Feedly can read them; a plain fetch can't) are flagged, not faked.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadUniverse, productTerms, fitScore, proposeTier, sampleFeed } from './rate-source.mjs';

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");

/** Parse OPML → [{ url, title, category }]. Category = nearest ancestor outline's text. */
export function parseOpml(xml) {
  const feeds = [];
  // walk <outline …> tags in order, tracking the last non-feed outline as the category
  const re = /<outline\b([^>]*?)(\/?)>/gi; let m, category = '';
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const xmlUrl = (attrs.match(/xmlUrl\s*=\s*"([^"]*)"/i) || [])[1];
    const text = decode((attrs.match(/(?:text|title)\s*=\s*"([^"]*)"/i) || [])[1] || '');
    if (xmlUrl) feeds.push({ url: decode(xmlUrl), title: text || decode(xmlUrl), category });
    else if (text && m[2] !== '/') category = text; // a grouping outline (Feedly folder)
  }
  return feeds;
}

async function assess(feed, products) {
  let items, reach = true, note = '';
  try { items = await sampleFeed(feed.url); } catch (e) { reach = false; note = e.message; items = []; }
  if (!reach) return { ...feed, reach, note, best: null };
  if (!items.length) return { ...feed, reach, note: 'reachable but 0 items parsed (Cloudflare interstitial or non-RSS)', best: null };
  const text = items.map((i) => `${i.title} ${i.content}`).join(' ');
  const scored = products.map((p) => ({ slug: p.slug, priority: p.priority, fit: fitScore(text, p).fraction })).sort((a, b) => b.fit - a.fit);
  return { ...feed, reach, items: items.length, best: scored[0], runnerUp: scored[1] };
}

async function run() {
  const a = process.argv, get = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  const file = get('--file'), brand = get('--brand');
  if (!file) { console.error('usage: node opml-import.mjs --file <feedly.opml> [--brand <slug>]'); process.exit(2); }
  let xml; try { xml = readFileSync(file, 'utf8'); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(1); }
  const feeds = parseOpml(xml);
  if (!feeds.length) { console.error('no <outline xmlUrl="…"> feeds found in the OPML'); process.exit(1); }
  const products = loadUniverse().products.filter((p) => productTerms(p).length);
  console.error(`\nopml-import · ${feeds.length} sources from ${file}`);
  console.error(`  matching against ${products.length} portfolio products (reachability + topical fit)…\n`);

  const results = [];
  for (const f of feeds) results.push(await assess(f, products));

  // group by best-fit product (or flag unreachable / weak)
  const byProduct = new Map(); const flagged = [];
  for (const r of results) {
    if (!r.best || r.best.fit < 0.10) { flagged.push(r); continue; }
    if (brand && r.best.slug !== brand) continue;
    if (!byProduct.has(r.best.slug)) byProduct.set(r.best.slug, []);
    byProduct.get(r.best.slug).push(r);
  }
  const ordered = [...byProduct.entries()].sort((x, y) => (products.find((p) => p.slug === x[0])?.priority || 9) - (products.find((p) => p.slug === y[0])?.priority || 9));
  for (const [slug, list] of ordered) {
    console.error(`● ${slug}  (P${products.find((p) => p.slug === slug)?.priority})`);
    for (const r of list.sort((x, y) => y.best.fit - x.best.fit)) {
      const t = proposeTier(r.best.fit).band;
      console.error(`    ${(r.best.fit * 100).toFixed(0).padStart(3)}%  ${t.padEnd(11)} ${r.title.slice(0, 34).padEnd(34)}  {"url":"${r.url}","tier":?,"name":"${r.title.slice(0, 24)}"}`);
    }
  }
  if (!brand && flagged.length) {
    console.error(`\n⚠ ${flagged.length} source(s) unmatched / unreachable (ratify manually or drop):`);
    for (const r of flagged.slice(0, 30)) console.error(`    ${r.reach ? (r.best ? `weak ${(r.best.fit * 100).toFixed(0)}%` : 'no-fit').padEnd(9) : 'UNREACH'.padEnd(9)} ${r.title.slice(0, 34).padEnd(34)} ${r.note ? '· ' + r.note.slice(0, 40) : r.url}`);
  }
  console.error(`\n→ tiers are YOURS to assign (authority is human-rated, P9). Paste the ratified lines into portfolio-universe.json feeds[].\n`);
  process.exit(0);
}

async function smoke() {
  const opml = `<?xml version="1.0"?><opml version="1.0"><body>
    <outline text="Security">
      <outline type="rss" text="Krebs on Security" xmlUrl="https://krebsonsecurity.com/feed/"/>
      <outline type="rss" text="A vendor blog about hotel booking &amp; occupancy" xmlUrl="https://example.test/hotel"/>
    </outline>
    <outline text="AI Engineering">
      <outline type="rss" text="Simon Willison" xmlUrl="https://simonwillison.net/atom/everything/"/>
    </outline>
  </body></opml>`;
  const feeds = parseOpml(opml);
  const okParse = feeds.length === 3 && feeds[0].url === 'https://krebsonsecurity.com/feed/' && feeds[0].category === 'Security' && feeds[1].title.includes('&');
  console.error(`\nopml-import smoke — parse Feedly OPML (folders → categories, entity-decoded)`);
  console.error(`  parsed ${feeds.length}/3 feeds · first category="${feeds[0].category}" · entity-decode ${feeds[1].title.includes('&') ? '✓' : '✗'}`);
  console.error(`  ${okParse ? '✅ PASS' : '❌ FAIL'} — OPML → feed list ready for rate-source matching (live fetch happens in run())\n`);
  process.exit(okParse ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
