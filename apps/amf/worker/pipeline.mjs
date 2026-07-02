/**
 * pipeline.mjs — the callable L4/L5 producing-slice seam for the event loop.
 *
 * Wraps the PROVEN produce-short.mjs CLI (does not rewrite it): sets the AMF_*
 * env from the job's state document, spawns the CLI, and returns the asset path
 * on exit 0. The event loop depends only on this `produceShort()`.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'produce-short.mjs');
const ASSET = join(HERE, 'out', 'one-short.mp4');
const REVIEW = join(HERE, 'out', 'review-queue');

/** Run a worker CLI synchronously, capturing stdout. Reuses the PROVEN tools, no rewrite. */
function cli(script, args) {
  const r = spawnSync('node', [join(HERE, script), ...args], { encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status ?? 1, out: r.stdout || '', err: r.stderr || '' };
}

/** Write a drafted brief to the review queue (the human APPROVAL GATE — P4/P7). Returns id. */
export function enqueueForReview(item) {
  mkdirSync(join(REVIEW, 'pending'), { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const id = `${item.slug}-${day}-${createHash('sha256').update(JSON.stringify(item) + Date.now()).digest('hex').slice(0, 6)}`;
  writeFileSync(join(REVIEW, 'pending', `${id}.json`), JSON.stringify({ id, status: 'pending', queuedAt: new Date().toISOString(), ...item }, null, 2));
  return id;
}

/**
 * The FULL per-product content chain (the autopilot's unit of work):
 *   ingest demand-driven pool → match (boolean gate + 5-D rank) → draft brief → QUEUE FOR APPROVAL.
 * Render + publish are deliberately downstream of the human gate (review.mjs). Never throws on
 * "no signal" — an empty tick is a valid outcome, not a failure.
 */
export async function runProductChain(slug, { project, ingest = true } = {}) {
  project = project || slug;
  if (ingest) cli('adapter-news.mjs', ['--provider', 'googlenews', '--brand', slug, '--project', project]);
  const m = cli('content-matcher.mjs', ['--project', project, '--brand', slug]);
  const match = (m.out || '').match(/\{[\s\S]*\}\s*$/);
  if (m.code !== 0 || !match) return { slug, ok: false, reason: 'no on-brand signal this tick' };
  let brief; try { brief = JSON.parse(match[0]); } catch { return { slug, ok: false, reason: 'brief parse error' }; }
  const reviewId = enqueueForReview({ slug, brief });
  return { slug, ok: true, reviewId, headline: brief.headline };
}

/**
 * Run the faceless voice-over-b-roll pipeline. opts (all optional → stubs):
 *   { scriptPath, voicePath, brollPaths: string|string[], auphonicKey, auphonicPreset }
 * Returns { assetPath, ok }. Throws on non-zero exit or missing asset.
 */
export async function produceShort(opts = {}) {
  const env = { ...process.env };
  if (opts.scriptPath) env.AMF_SCRIPT = opts.scriptPath;
  if (opts.voicePath) env.AMF_VOICE = opts.voicePath;
  if (opts.brollPaths) env.AMF_BROLL = Array.isArray(opts.brollPaths) ? opts.brollPaths.join(',') : opts.brollPaths;
  if (opts.auphonicKey) env.AUPHONIC_API_KEY = opts.auphonicKey;
  if (opts.auphonicPreset) env.AUPHONIC_PRESET_UUID = opts.auphonicPreset;

  await new Promise((resolve, reject) => {
    const p = spawn('node', [CLI], { env, stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`produce-short.mjs exited ${code}`))));
  });

  if (!existsSync(ASSET)) throw new Error('pipeline finished but no asset at ' + ASSET);
  return { assetPath: ASSET, ok: true };
}
