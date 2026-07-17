#!/usr/bin/env node
// verify-publish-wire.mjs — proof-gate for the approve→publish seam (Layer-5 closure).
//
// Proves, against the REAL queue + CLI (the exact path the dashboard fires):
//   1. a queued test brief exists in pending
//   2. `review.mjs --approve <id> --publish` approves AND fires publish() in one act
//   3. with no channel tokens, EVERY channel lands as gated dry-run — never a fake "live"
//      claim (P4), and video channels note the missing render honestly
//   4. every attempt is appended to the Earn Ledger (out/ledger.jsonl), billable=false
//   5. the dashboard's approve spawns the same wire (--publish present in its args)
//   6. safety: no *_ACCESS_TOKEN in env before the run (the gate refuses to risk a live post)
//
//   node verify-publish-wire.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── safety preflight ────────────────────────────────────────────────────');
const risky = ['X_BEARER_TOKEN', 'LINKEDIN_ACCESS_TOKEN', 'YOUTUBE_ACCESS_TOKEN', 'IG_ACCESS_TOKEN', 'TIKTOK_ACCESS_TOKEN'].filter(k => process.env[k]);
check('no live channel tokens in env (gate refuses to risk a real post)', risky.length === 0, risky.join(',') || 'clean');
if (risky.length) { console.log('PUBLISH_WIRE_VERIFY: SKIPPED (live tokens present — run only in a tokenless env)'); process.exit(1); }

console.log('── enqueue → approve --publish (the dashboard\'s exact path) ───────────');
const { enqueueForReview } = await import('./pipeline.mjs');
const id = enqueueForReview({ slug: 'voicecosmos', format: 'post', brief: { headline: 'WIRE-TEST — approve fires publish', cta: 'RECOVER', points: [] } });
check('test brief queued in pending', existsSync(join(HERE, 'out', 'review-queue', 'pending', `${id}.json`)), id);

const r = spawnSync('node', [join(HERE, 'review.mjs'), '--approve', id, '--publish'], { encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
check('approve exits 0 and reports the seam fired', r.status === 0 && /publish seam fired/.test(out));
check('approved file moved out of pending', existsSync(join(HERE, 'out', 'review-queue', 'approved', `${id}.json`)));
check('0 live · all gated/dry-run (no fake "live" claim, P4)', /0 live/.test(out) && !/: live($| )/m.test(out));
check('every channel attempted (x/linkedin/youtube/instagram/tiktok)', ['x', 'linkedin', 'youtube', 'instagram', 'tiktok', 'site'].every(c => new RegExp(`\\[publish\\] ${c}:`).test(out)));
check('video channels honestly note the missing render', /(youtube|instagram|tiktok).*(render|asset)/i.test(out) || /blocked/.test(out));

console.log('── the Earn Ledger ─────────────────────────────────────────────────────');
const ledgerPath = join(HERE, 'out', 'ledger.jsonl');
const rows = existsSync(ledgerPath)
  ? readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => x.id === id)
  : [];
check('6 ledger rows appended for this approval (site included)', rows.length === 6, `rows=${rows.length}`);
check('all rows unit=published_asset · billable=false (dry-run)', rows.every(x => x.unit === 'published_asset' && x.billable === false));

console.log('── the dashboard fires the same wire ───────────────────────────────────');
const dash = readFileSync(join(HERE, 'dashboard.mjs'), 'utf8');
check("dashboard approve passes --publish", /--approve'\s*\?\s*\[[^\]]*'--publish'\]/.test(dash.replace(/\n/g, ' ')) || dash.includes("'--publish']"));

// cleanup the wire-test artifact (keep the ledger rows — the Earn Ledger is append-only)
rmSync(join(HERE, 'out', 'review-queue', 'approved', `${id}.json`), { force: true });

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('PUBLISH_WIRE_VERIFY: GREEN — the P9 approval fires the publish seam: all channels attempted,');
  console.log('honestly gated dry-run without tokens, Earn Ledger appended; goes LIVE the moment tokens land.');
  process.exit(0);
} else { console.log('PUBLISH_WIRE_VERIFY: RED'); process.exit(1); }
