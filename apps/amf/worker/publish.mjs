/**
 * publish.mjs — the syndication publisher (Sprint 2: "it goes online").
 *
 * The pipeline ended at the human gate: approved drafts sat in out/review-queue/approved/
 * and the operator pushed them to channels by hand ("approved ≠ published", review.mjs:86).
 * This closes that last seam — approved brief → per-channel copy → publish → Earn Ledger.
 *
 * DISCIPLINE (matches adapter-news / stage-j / vault-guard):
 *   • Composers are PURE + deterministic — the per-channel formatting (length limits,
 *     hashtags, title/description) is the real IP (Blueprint Layer 4/6). Testable with
 *     zero network.
 *   • Sends are DRY-RUN-GATED: no channel token in env → print the exact request we WOULD
 *     make and mark it dry-run. NEVER claim a live post we can't prove (P4/P8). A channel
 *     goes live the moment its token lands — wired now, gated until then.
 *   • Video channels (youtube/instagram/tiktok) require a rendered asset (rec.render). No
 *     asset → dry-run notes "needs render", never a broken upload.
 *   • Every attempt appends one row to out/ledger.jsonl — the Earn Ledger (Blueprint L9):
 *     the billable unit today is `published_asset`; it becomes `qualified_lead` when the
 *     XENOS loop lands.
 *
 *   node publish.mjs --publish <id> [--channels x,linkedin] [--live]   publish one approved draft
 *   node publish.mjs --ready                                            list approved drafts awaiting publish
 *   node publish.mjs --ledger [n]                                       tail the Earn Ledger
 *   node publish.mjs --smoke                                            deterministic proof (no network)
 *
 * Channel tokens (presence flips a channel dry-run → live):
 *   X_BEARER_TOKEN · LINKEDIN_ACCESS_TOKEN+LINKEDIN_AUTHOR_URN ·
 *   YOUTUBE_ACCESS_TOKEN · IG_ACCESS_TOKEN / TIKTOK_ACCESS_TOKEN
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeoMeta } from './seo-meta.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPROVED = join(HERE, 'out', 'review-queue', 'approved');
const LEDGER = join(HERE, 'out', 'ledger.jsonl');
const ALL_CHANNELS = ['x', 'linkedin', 'youtube', 'instagram', 'tiktok', 'site'];

const clip = (s, n) => { s = (s || '').trim(); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'; };
const hashtags = (rec) => (rec.slug ? [rec.slug.replace(/[^a-z0-9]/gi, '')] : []).concat(['AI']).slice(0, 3).map((t) => '#' + t);
const firstSource = (rec) => (rec.brief?.sources || [])[0] || '';
/** A source URL is postable only if it's short and not a tracking-redirect blob (news.google RSS). */
const cleanSource = (rec, max = 100) => { const u = firstSource(rec); return u && u.length <= max && !/news\.google\.com\/rss|\/articles\/CBM/i.test(u) ? u : ''; };
const pointsLines = (rec) => (rec.brief?.points || []).filter((p) => p && (p.label || p.stat)).map((p) => `• ${p.stat && p.stat !== '—' ? p.stat + ' — ' : ''}${p.label || ''}`.trim());

// ── PURE per-channel composers — the real, testable IP ────────────────────────
/** @returns {{ok:boolean, needsAsset?:boolean, reason?:string, text?:string, title?:string, description?:string, tags?:string[]}} */
export const COMPOSERS = {
  x(rec) {
    const b = rec.brief || {};
    const tags = hashtags(rec).join(' ');
    const url = cleanSource(rec);                                   // dropped if a google-news redirect
    const budget = 280 - tags.length - 2 - (url ? url.length + 1 : 0);   // headline gets what's left, never negative
    const body = clip(b.headline, Math.max(40, budget));
    return { ok: true, text: [body, '', tags, url].filter(Boolean).join('\n').trim() };
  },
  linkedin(rec) {
    const b = rec.brief || {};
    const pts = pointsLines(rec);
    const text = [clip(b.headline, 220), '', ...(pts.length ? pts : [b.angle || '']), '', b.cta ? `→ ${b.cta}` : '', cleanSource(rec, 200), '', hashtags(rec).join(' ')]
      .filter((l) => l).join('\n').trim();
    return { ok: true, text: clip(text, 3000) };
  },
  youtube(rec) {
    if (!rec.render?.rendered) return { ok: false, needsAsset: true, reason: 'youtube needs a rendered video (approve with --render)' };
    const b = rec.brief || {};
    return { ok: true, title: clip(b.headline, 100), description: clip([b.angle, '', ...pointsLines(rec), '', b.cta ? `→ ${b.cta}` : '', firstSource(rec)].join('\n'), 5000), tags: (b.keywords || [rec.slug, 'AI']).slice(0, 15) };
  },
  instagram(rec) {
    if (!rec.render?.rendered) return { ok: false, needsAsset: true, reason: 'instagram reel needs a rendered 9:16 video' };
    return { ok: true, text: clip(`${rec.brief?.headline || ''}\n\n${(rec.brief?.cta || '')}\n\n${hashtags(rec).join(' ')}`, 2200) };
  },
  tiktok(rec) {
    if (!rec.render?.rendered) return { ok: false, needsAsset: true, reason: 'tiktok needs a rendered 9:16 video' };
    return { ok: true, text: clip(`${rec.brief?.headline || ''} ${hashtags(rec).join(' ')}`, 2200) };
  },
  /** owned_site_story — publish to YOUR OWN site's CMS, SEO-optimized (Site Directive 2).
   *  Carries the optimization gate's output: meta-title/description, AI-citable keywords,
   *  Schema.org JSON-LD (rec.seo when the pipeline attached it; else the deterministic
   *  local baseline is composed inline — pure either way). */
  site(rec) {
    const seo = rec.seo ?? buildSeoMeta(rec);
    const b = rec.brief || {};
    return {
      ok: true,
      title: seo.metaTitle,
      description: seo.metaDescription,
      keywords: seo.keywords,
      jsonld: seo.jsonld,
      slug: seo.urlSlug,
      body: [b.angle, '', ...pointsLines(rec), '', b.cta ? `→ ${b.cta}` : ''].filter(Boolean).join('\n'),
      videoUrl: rec.render?.rendered ? (rec.render?.note ?? null) : null,
      text: seo.metaTitle,
    };
  },
};

// ── send layer — dry-run unless the channel's token is present ─────────────────
function credFor(channel) {
  const e = process.env;
  switch (channel) {
    case 'x': return e.X_BEARER_TOKEN ? { token: e.X_BEARER_TOKEN } : null;
    case 'linkedin': return e.LINKEDIN_ACCESS_TOKEN && e.LINKEDIN_AUTHOR_URN ? { token: e.LINKEDIN_ACCESS_TOKEN, author: e.LINKEDIN_AUTHOR_URN } : null;
    case 'youtube': return e.YOUTUBE_ACCESS_TOKEN ? { token: e.YOUTUBE_ACCESS_TOKEN } : null;
    case 'instagram': return e.IG_ACCESS_TOKEN ? { token: e.IG_ACCESS_TOKEN } : null;
    case 'tiktok': return e.TIKTOK_ACCESS_TOKEN ? { token: e.TIKTOK_ACCESS_TOKEN } : null;
    // owned_site_story: your OWN CMS (WordPress/Webflow/Next.js API). Both the endpoint and
    // the token must land before a live push — else dry-run, exactly like the socials.
    case 'site': return e.CMS_ACCESS_TOKEN && e.CMS_ENDPOINT ? { token: e.CMS_ACCESS_TOKEN, endpoint: e.CMS_ENDPOINT } : null;
    default: return null;
  }
}

/** Real API dispatch — only reached when creds exist AND --live is set. */
async function sendLive(channel, composed, cred, rec) {
  if (channel === 'x') {
    const r = await fetch('https://api.twitter.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: composed.text }) });
    return { httpStatus: r.status, ok: r.ok, id: (await r.json().catch(() => ({})))?.data?.id };
  }
  if (channel === 'linkedin') {
    const body = { author: cred.author, lifecycleState: 'PUBLISHED', specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: composed.text }, shareMediaCategory: 'NONE' } }, visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' } };
    const r = await fetch('https://api.linkedin.com/v2/ugcPosts', { method: 'POST', headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' }, body: JSON.stringify(body) });
    return { httpStatus: r.status, ok: r.ok, id: r.headers.get('x-restli-id') };
  }
  if (channel === 'site') {
    // Generic REST POST to YOUR CMS endpoint: the SEO-optimized story payload, Bearer-authed.
    const body = {
      title: composed.title, slug: composed.slug, description: composed.description,
      keywords: composed.keywords, jsonld: composed.jsonld, body: composed.body,
      videoUrl: composed.videoUrl, brand: rec.slug, sourceId: rec.id, status: 'publish',
    };
    const r = await fetch(cred.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { httpStatus: r.status, ok: r.ok, id: (await r.json().catch(() => ({})))?.id ?? null };
  }
  // youtube / instagram / tiktok: resumable/container uploads need the asset bytes + OAuth
  // scopes; wired as an explicit not-yet-implemented live path so it declines loudly rather
  // than pretending. Composer + dry-run are proven; live upload lands with the token + asset.
  return { httpStatus: null, ok: false, reason: `${channel} live upload not yet implemented — composer+dry-run ready; needs asset-bytes upload + OAuth scope` };
}

function ledgerRow(row) { mkdirSync(dirname(LEDGER), { recursive: true }); appendFileSync(LEDGER, JSON.stringify(row) + '\n'); }

/** Publish one approved record across the requested channels. Returns per-channel results. */
export async function publish(rec, { channels = ALL_CHANNELS, live = false } = {}) {
  const out = [];
  for (const channel of channels) {
    const composer = COMPOSERS[channel];
    if (!composer) { out.push({ channel, mode: 'error', reason: 'unknown channel' }); continue; }
    const composed = composer(rec);
    const cred = credFor(channel);
    const canLive = live && !!cred && composed.ok;
    let mode, result;
    if (!composed.ok) { mode = 'blocked'; result = { reason: composed.reason }; }
    else if (canLive) { mode = 'live'; result = await sendLive(channel, composed, cred, rec).catch((e) => ({ ok: false, reason: e.message })); if (result.ok === false) mode = 'live-failed'; }
    else { mode = 'dry-run'; result = { reason: cred ? 'dry-run (pass --live to send)' : `no ${channel} token — gated`, preview: clip(composed.text || composed.title || '', 120) }; }
    const row = { ts: new Date().toISOString(), id: rec.id, slug: rec.slug, channel, mode, unit: 'published_asset', billable: mode === 'live', result };
    ledgerRow(row);
    out.push(row);
  }
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function readApproved(id) { const p = join(APPROVED, `${id}.json`); if (!existsSync(p)) { console.error(`[publish] no approved draft: ${id} (approve it first: node review.mjs --approve ${id})`); process.exit(1); } return JSON.parse(readFileSync(p, 'utf8')); }
function listReady() { return existsSync(APPROVED) ? readdirSync(APPROVED).filter((f) => f.endsWith('.json')) : []; }

async function run() {
  const a = process.argv, cmd = a[2];
  if (cmd === '--ready') {
    const files = listReady();
    if (!files.length) { console.error('\n[publish] no approved drafts awaiting publish. Approve one: node review.mjs --approve <id>\n'); return; }
    console.error(`\n[publish] ${files.length} approved draft(s) ready:\n`);
    for (const f of files) { const r = JSON.parse(readFileSync(join(APPROVED, f), 'utf8')); console.error(`  ${r.id} · ${r.slug} · "${clip(r.brief?.headline, 56)}"${r.render?.rendered ? ' · 🎬 rendered' : ''}`); }
    console.error(`\n  → node publish.mjs --publish <id> [--channels x,linkedin] [--live]\n`);
  } else if (cmd === '--ledger') {
    if (!existsSync(LEDGER)) { console.error('[publish] no ledger yet.'); return; }
    const rows = readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean);
    const n = Number(a[3]) || 20;
    console.error(`\n[Earn Ledger] last ${Math.min(n, rows.length)} of ${rows.length} events:\n`);
    for (const line of rows.slice(-n)) { const r = JSON.parse(line); console.error(`  ${r.ts.slice(0, 16)} · ${r.slug} → ${r.channel} · ${r.mode}${r.billable ? ' 💶' : ''}`); }
  } else if (cmd === '--publish') {
    const id = a[3]; if (!id) { console.error('usage: node publish.mjs --publish <id> [--channels x,linkedin] [--live]'); process.exit(2); }
    const rec = readApproved(id);
    const chArg = a[a.indexOf('--channels') + 1]; const channels = a.includes('--channels') ? chArg.split(',').map((s) => s.trim()) : ALL_CHANNELS;
    const live = a.includes('--live');
    if (rec.brief?.verify && !a.includes('--checked')) console.error(`[publish] ⚠️ brand gate: "${rec.brief.verify}". Pass --checked once verified.`);
    const results = await publish(rec, { channels, live });
    console.error(`\n[publish] ${rec.slug} (${id}) — ${live ? 'LIVE where credentialed' : 'dry-run'}:\n`);
    for (const r of results) console.error(`  ${r.channel.padEnd(10)} ${r.mode}${r.billable ? ' 💶' : ''} — ${r.result.reason || (r.result.ok ? 'posted id ' + r.result.id : '')}`);
    console.error(`\n  ledger: out/ledger.jsonl (${results.length} rows appended)\n`);
  } else { console.error('usage: node publish.mjs --ready | --publish <id> [--channels ..] [--live] [--checked] | --ledger [n] | --smoke'); process.exit(2); }
}

async function smoke() {
  console.error('\npublish smoke — composer + dry-run gate + Earn Ledger (no network)\n');
  const rec = { id: 'smoke-thenine-x', slug: 'thenine', brief: { headline: 'AI usefulness depends on whether we can trust it to act alone — the case for verifiable autonomy', points: [{ stat: '9', label: 'principles' }], cta: 'DETAILS', angle: 'Trust must be provable.', sources: ['https://example.com/a'], keywords: ['trust', 'AI'], verify: 'check brand' } };
  const before = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).length : 0;
  const results = await publish(rec, { channels: ALL_CHANNELS, live: false });

  const x = COMPOSERS.x(rec), li = COMPOSERS.linkedin(rec), yt = COMPOSERS.youtube(rec);
  const xOk = x.ok && x.text.length <= 280;
  const liOk = li.ok && li.text.length <= 3000 && li.text.includes('DETAILS');
  const ytGated = !yt.ok && yt.needsAsset;                        // no render → correctly blocked
  const allDry = results.every((r) => r.mode === 'dry-run' || r.mode === 'blocked');
  const noBillable = results.every((r) => !r.billable);          // dry-run never bills
  const after = readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).length;
  const ledgerGrew = after - before === results.length;

  const ok = xOk && liOk && ytGated && allDry && noBillable && ledgerGrew;
  console.error(`  x ≤280           : ${xOk} (${x.text.length} chars)`);
  console.error(`  linkedin+cta     : ${liOk}`);
  console.error(`  youtube gated    : ${ytGated} (no render → blocked, not faked)`);
  console.error(`  all dry-run      : ${allDry} · none billable: ${noBillable}`);
  console.error(`  ledger appended  : ${ledgerGrew} (+${after - before} rows)`);
  console.error(`\n  ${ok ? '✅ PASS' : '❌ FAIL'} — approved brief → per-channel copy → dry-run → Earn Ledger; live gated on tokens (P4)\n`);
  process.exit(ok ? 0 : 1);
}

// only run the CLI when invoked directly — safe to `import { COMPOSERS, publish }` (orchestrators, pulse-return)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error('[publish] error:', e.message); process.exit(1); });
}
