/**
 * review.mjs — the human APPROVAL GATE (P4/P7/P9). Where autopilot drafts wait for you.
 *
 * The autopilot runs the whole chain (ingest → match → draft) unattended and drops briefs
 * into out/review-queue/pending/. NOTHING moves toward publish without a human decision here.
 * That is the deliberate boundary: the machine proposes tirelessly; the leap to publish is
 * the human's (P9). Approving optionally renders the asset in-brand (the only place render
 * spend is committed).
 *
 *   node review.mjs --list                    # pending drafts (what the autopilot produced)
 *   node review.mjs --show <id>               # full brief for one draft
 *   node review.mjs --approve <id> [--render] # approve (→ approved/); --render builds the asset now
 *   node review.mjs --reject <id> [reason]    # reject (→ rejected/)
 *   node review.mjs --smoke
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const REVIEW = process.env.AMF_REVIEW_DIR || join(HERE, 'out', 'review-queue');
const dir = (s) => join(REVIEW, s);
const ensure = () => ['pending', 'approved', 'rejected'].forEach((s) => mkdirSync(dir(s), { recursive: true }));

// The project the Authorship Ledger (type='decision' Observations) is written into.
const DECISION_PROJECT = process.env.AMF_DECISION_PROJECT || 'amf';

/** Canonical JSON (sorted keys) — the exact-draft hash a decision seals; re-derivable for tamper checks. */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
/** The hash that binds "which exact draft was approved" — over the brief the human saw. */
function draftContentHash(rec) {
  return 'sha256:' + createHash('sha256').update(canonical(rec.brief ?? rec)).digest('hex');
}

/**
 * Seal the P9 decision into CONTINUUM's Authorship Ledger — the SAME core primitive the MCP tool uses.
 * Atomic with the review action: the caller seals FIRST and only commits the bucket move on success,
 * so there is never an approved draft on disk with no cryptographic provenance in the ledger.
 */
async function sealReviewDecision(rec, verdict, rationale) {
  try {
    const { openStorage, sealDecision } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
    const contentHash = draftContentHash(rec);
    const storage = openStorage(DECISION_PROJECT);
    const sealed = sealDecision(storage, {
      verdict,
      subject: { kind: 'amf-draft', id: rec.id, title: rec.brief?.headline ?? rec.slug ?? rec.id, contentHash },
      operator: process.env.CONTINUUM_OPERATOR || process.env.AMF_OPERATOR || 'operator',
      rationale,
      refs: [],
    });
    storage.close?.();
    return { ok: true, decisionId: sealed.id, contentHash };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
const listPending = () => (existsSync(dir('pending')) ? readdirSync(dir('pending')).filter((f) => f.endsWith('.json')) : []);
const findFile = (id) => { for (const s of ['pending', 'approved', 'rejected']) { const p = join(dir(s), `${id}.json`); if (existsSync(p)) return { path: p, bucket: s }; } return null; };

function move(id, to, patch) {
  const f = findFile(id); if (!f) { console.error(`no such draft: ${id}`); process.exit(1); }
  const rec = { ...JSON.parse(readFileSync(f.path, 'utf8')), ...patch };
  mkdirSync(dir(to), { recursive: true });
  writeFileSync(join(dir(to), `${id}.json`), JSON.stringify(rec, null, 2));
  if (f.bucket !== to) rmSync(f.path);
  return rec;
}

/** Render an approved brief in-brand (the only place render is committed). Best-effort. */
function render(rec) {
  const map = { report: ['produce-report.mjs', 'AMF_REPORT_JSON'], post: ['produce-post.mjs', 'AMF_POST_JSON'] };
  const [script, envKey] = map[rec.format] || map.post;
  const env = { ...process.env, AMF_BRAND: rec.slug, [envKey]: JSON.stringify(rec.brief) };
  const r = spawnSync('node', [join(HERE, script), '--brand', rec.slug], { env, encoding: 'utf8' });
  return { rendered: r.status === 0, tool: script, note: r.status === 0 ? 'asset in out/' : (r.stderr || '').slice(-160) };
}

// ── reusable gate actions (CLI + the Pulse return-path both call these) ───────
export const draftBucket = (id) => { ensure(); return findFile(id)?.bucket || null; };

/** Approve a draft → approved/ (optionally render). Async: SEALS the P9 decision into the ledger
 *  FIRST, then commits the move — atomic, so approve ≠ approved-without-provenance. Idempotent. */
export async function approveDraft(id, { render: doRender = false } = {}) {
  ensure(); const f = findFile(id);
  if (!f || f.bucket !== 'pending') return { ok: false, reason: f ? `already ${f.bucket}` : 'not found' };
  const pending = JSON.parse(readFileSync(f.path, 'utf8'));
  const seal = await sealReviewDecision(pending, 'accept');
  if (!seal.ok) return { ok: false, reason: `seal failed (P9 not sealed → not approved): ${seal.error}` };
  let rec = move(id, 'approved', { status: 'approved', approvedAt: new Date().toISOString(), decisionId: seal.decisionId, contentHash: seal.contentHash });
  let render_ = null;
  if (doRender) { render_ = render(rec); rec = move(id, 'approved', { render: render_ }); }
  return { ok: true, slug: rec.slug, decisionId: seal.decisionId, contentHash: seal.contentHash, render: render_ };
}
/** Reject a draft → rejected/. Async: seals the reject decision (with the reason) before the move. */
export async function rejectDraft(id, reason = 'unspecified') {
  ensure(); const f = findFile(id);
  if (!f || f.bucket !== 'pending') return { ok: false, reason: f ? `already ${f.bucket}` : 'not found' };
  const pending = JSON.parse(readFileSync(f.path, 'utf8'));
  const seal = await sealReviewDecision(pending, 'reject', reason);
  if (!seal.ok) return { ok: false, reason: `seal failed (P9 not sealed → not rejected): ${seal.error}` };
  move(id, 'rejected', { status: 'rejected', rejectedAt: new Date().toISOString(), reason, decisionId: seal.decisionId, contentHash: seal.contentHash });
  return { ok: true, decisionId: seal.decisionId };
}

async function run() {
  ensure();
  const a = process.argv, cmd = a[2], id = a[3];
  if (cmd === '--list') {
    const files = listPending();
    if (!files.length) { console.error('\n[review] no pending drafts. Autopilot idle or all reviewed.\n'); return; }
    console.error(`\n[review] ${files.length} pending draft(s) awaiting your approval:\n`);
    for (const f of files) { const r = JSON.parse(readFileSync(join(dir('pending'), f), 'utf8')); console.error(`  ${r.id}\n     ${r.slug} · "${(r.brief?.headline || '').slice(0, 60)}" · cta=${r.brief?.cta || '?'} · ${r.queuedAt?.slice(0, 16)}`); }
    console.error(`\n  → node review.mjs --approve <id> [--render] | --reject <id>\n`);
  } else if (cmd === '--show') {
    const f = findFile(id); if (!f) { console.error(`no such draft: ${id}`); process.exit(1); }
    console.log(readFileSync(f.path, 'utf8'));
  } else if (cmd === '--approve') {
    const res = await approveDraft(id, { render: a.includes('--render') });
    if (!res.ok) { console.error(`[review] cannot approve ${id}: ${res.reason}`); process.exit(1); }
    console.error(`[review] ✅ approved ${id} (${res.slug}) · sealed decision ${res.decisionId?.slice(0, 8)} · ${res.contentHash?.slice(0, 20)}…`);
    if (res.render) console.error(`[review] render via ${res.render.tool}: ${res.render.rendered ? '✅ ' + res.render.note : '⚠️ ' + res.render.note}`);
    if (a.includes('--publish')) {
      // The Layer-5 closure: the P9 approval IS the publish trigger. publish() is honest
      // per channel — a token sends live, no token appends a dry-run Earn-Ledger row (P4).
      const rec = JSON.parse(readFileSync(join(dir('approved'), `${id}.json`), 'utf8'));
      const { publish } = await import('./publish.mjs');
      const rows = await publish(rec, { live: true });
      for (const r of rows) console.error(`[publish] ${r.channel}: ${r.mode}${r.result?.reason ? ` — ${r.result.reason}` : ''}`);
      const liveN = rows.filter(r => r.mode === 'live').length;
      console.error(`[review] publish seam fired: ${liveN} live · ${rows.length - liveN} gated/dry-run (Earn Ledger updated)`);
    } else {
      console.error('[review] NOTE: publish not requested — pass --publish to fire the seam on approval (P7: approved ≠ published).');
    }
  } else if (cmd === '--reject') {
    const res = await rejectDraft(id, a.slice(4).join(' ') || 'unspecified');
    if (!res.ok) { console.error(`[review] cannot reject ${id}: ${res.reason}`); process.exit(1); }
    console.error(`[review] ✗ rejected ${id} · sealed decision ${res.decisionId?.slice(0, 8)}`);
  } else { console.error('usage: node review.mjs --list | --show <id> | --approve <id> [--render] | --reject <id> [reason]'); process.exit(2); }
}

async function smoke() {
  ensure();
  const { enqueueForReview } = await import('./pipeline.mjs');
  const id = enqueueForReview({ slug: 'voiceidvault', format: 'post', brief: { headline: 'Why deepfake detection is the future of identity verification', cta: 'REPORT', points: [] } });
  const listed = listPending().some((f) => f.includes(id));
  const rec = move(id, 'approved', { status: 'approved' });
  const gone = !listPending().some((f) => f.includes(id));
  const approved = existsSync(join(dir('approved'), `${id}.json`));
  rmSync(join(dir('approved'), `${id}.json`), { force: true });
  const ok = listed && gone && approved && rec.status === 'approved';
  console.error(`\nreview smoke — approval gate`);
  console.error(`  queued ${id} · listed=${listed} · approved-moved=${approved} · left-pending=${gone}`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — draft queues pending, approve moves it out; publish stays human (P7)\n`);
  process.exit(ok ? 0 : 1);
}

// only run the CLI when invoked directly — safe to `import { approveDraft, ... }` (Pulse return-path)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error("review error:", e.message); process.exit(1); });
}
