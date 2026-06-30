/**
 * pipeline.mjs — the callable L4/L5 producing-slice seam for the event loop.
 *
 * Wraps the PROVEN produce-short.mjs CLI (does not rewrite it): sets the AMF_*
 * env from the job's state document, spawns the CLI, and returns the asset path
 * on exit 0. The event loop depends only on this `produceShort()`.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'produce-short.mjs');
const ASSET = join(HERE, 'out', 'one-short.mp4');

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
