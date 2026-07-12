/**
 * dogfood.mjs — `make dogfood-voicecosmos`. The whole A→I pipeline in ONE command.
 *
 * Condenses the 5 manual CLI steps into one autonomous run: ingest → match+draft →
 * enqueue-for-review (the P9 human gate) — with NO manual intervention between stages —
 * and ends by printing the HONEST odometer: this run's ingested · matched · drafted ·
 * routed, plus every gate. It STOPS at the review gate: it never auto-approves and never
 * auto-publishes (P7/P9). A "no on-brand signal this tick" is reported honestly, not as a
 * crash.
 *
 *   node dogfood.mjs [--brand voicecosmos] [--project amf-dogfood]
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import './env.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilityReport, renderCapability, RunReport } from './odometer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const BRAND = arg('--brand', 'voicecosmos');
const PROJECT = arg('--project', process.env.AMF_DOGFOOD_PROJECT || 'amf-dogfood');

/** Run a pipeline stage as a subprocess; return its captured output. */
function stage(label, script, args) {
  console.log(`\n─── ${label} ─── ${script} ${args.join(' ')}`);
  const r = spawnSync('node', [resolve(HERE, script), ...args], { encoding: 'utf8', env: process.env });
  if (r.stderr) process.stderr.write(r.stderr);
  return { code: r.status ?? 1, out: r.stdout || '', err: r.stderr || '' };
}

/** Queue a brief to the review queue (I) — the P9 human gate. Inlined (no import coupling). */
function enqueueForReview(item) {
  const dir = resolve(HERE, 'out', 'review-queue', 'pending');
  mkdirSync(dir, { recursive: true });
  const id = `${item.slug}-${new Date().toISOString().slice(0, 10)}-${createHash('sha256').update(JSON.stringify(item) + Date.now()).digest('hex').slice(0, 6)}`;
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, status: 'pending', queuedAt: new Date().toISOString(), ...item }, null, 2));
  return id;
}

const rep = new RunReport(`dogfood:${BRAND}`);
console.log(`▶ AMF dogfood — ${BRAND} (project: ${PROJECT}) — A→I in one command; honest at the end.`);

// A→D · INGEST (googlenews, brand-derived query; key-free)
const ing = stage('A→D · INGEST', 'adapter-news.mjs', ['--provider', 'googlenews', '--brand', BRAND, '--project', PROJECT]);
const im = ing.err.match(/total (\d+) item/);
rep.ingested = im ? Number(im[1]) : 0;

// E→G · MATCH + DRAFT (boolean gate → 6-D rank → grounded draft)
const mat = stage('E→G · MATCH + DRAFT', 'content-matcher.mjs', ['--project', PROJECT, '--brand', BRAND]);
const km = mat.err.match(/stats kept=(\d+)/);
rep.matchedKept = km ? Number(km[1]) : 0;
let brief = null;
const bm = mat.out.match(/\{[\s\S]*\}\s*$/);
if (bm) { try { brief = JSON.parse(bm[0]); } catch { /* unparseable brief */ } }

// I · REVIEW GATE (P9) — QUEUE, do NOT auto-approve.
if (brief) {
  rep.drafted = 1;
  rep.draftMode = brief.drafted ?? null;
  const reviewId = enqueueForReview({ slug: BRAND, ...brief });
  rep.routed = 1;
  rep.notes.push(`queued for review: ${reviewId} — your leap (P9): approve with review.mjs`);
} else {
  rep.drafted = 0;
  rep.routed = 0;
  rep.notes.push('no on-brand signal this tick — ingest found nothing that passed the gate (honest, not a crash)');
}

// ── the honest odometer (per-run counts + every gate) ──
console.log('\n' + '═'.repeat(68));
console.log(rep.render());
rep.notes.forEach((n) => console.log(`   · ${n}`));
console.log('');
process.stdout.write(renderCapability(capabilityReport()));
console.log(`\nP9 (your leap):  node ${resolve(HERE, 'review.mjs')} --list  →  --approve --render`);
process.exit(0);
