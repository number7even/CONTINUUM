#!/usr/bin/env node
/**
 * AMF L5 b-roll compositor — stitch AI b-roll clips into one timeline, overlay
 * the captioned video (with a darkening scrim so captions stay legible), mux the
 * voice. Pure FFmpeg — deterministic, CPU-only.
 *
 * Inputs:
 *   - scenes.json  (from broll.mjs — clip per scene with timings)
 *   - captions.mp4 (from render.mjs but with a TRANSPARENT/scrim background)
 *   - voice.wav
 * Output: final.mp4  (b-roll behind, captions on top, voice).
 *
 * Usage: node compose-broll.mjs <scenes.json> <captions.mp4> <voice.wav> <out.mp4>
 *
 * Note: this is the assembly logic. The full proof run wires broll.mjs (gen) →
 * a scrim-caption render → this compositor. Gated upstream on FAL_KEY.
 */
import { execSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const [, , scenesPath, captionsMp4, voiceWav, outMp4] = process.argv;
if (!scenesPath || !captionsMp4 || !outMp4) {
  console.error('usage: node compose-broll.mjs <scenes.json> <captions.mp4> <voice.wav> <out.mp4>');
  process.exit(2);
}

const { scenes } = JSON.parse(readFileSync(scenesPath, 'utf8'));
const brollDir = dirname(scenesPath);
const tmp = mkdtempSync(join(tmpdir(), 'amf-broll-'));

// 1. Build the b-roll base track: each clip trimmed/padded to its scene duration,
//    scaled+cropped to 1080x1920, concatenated in order.
const parts = [];
scenes.forEach((sc, i) => {
  const inClip = resolve(brollDir, sc.file);
  const part = join(tmp, `part-${i}.mp4`);
  // scale to cover 1080x1920, crop center, set exact duration (loop if clip shorter)
  execSync(
    `ffmpeg -y -stream_loop -1 -i "${inClip}" -t ${sc.durationSec} ` +
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30" ` +
    `-an -c:v libx264 -pix_fmt yuv420p "${part}"`,
    { stdio: 'ignore' },
  );
  parts.push(part);
});

const listFile = join(tmp, 'list.txt');
execSync(`printf '%s\\n' ${parts.map((p) => `"file '${p}'"`).join(' ')} > "${listFile}"`);
const brollTrack = join(tmp, 'broll.mp4');
execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -pix_fmt yuv420p "${brollTrack}"`, { stdio: 'ignore' });

// 2. Overlay the captioned video (which has a dark scrim baked in, alpha or
//    blend) on top of the b-roll, then mux the voice. The captions video is
//    full-frame; we blend it with 'overlay' assuming its bg scrim is dark and
//    captions opaque. For a clean key we use blend=screen on text-only, but the
//    robust path: caption video already has a semi-transparent dark bg → use
//    overlay with format that respects its alpha (prores/webm) OR blend lighten.
//    Here we blend the caption luma over b-roll (captions are bright text on
//    near-black → 'screen' blend drops the black, keeps the text).
const finalOut = resolve(outMp4);
execSync(
  `ffmpeg -y -i "${brollTrack}" -i "${captionsMp4}" -i "${voiceWav}" ` +
  `-filter_complex "[1:v]format=gbrp[cap];[0:v][cap]blend=all_mode=screen:shortest=1[v]" ` +
  `-map "[v]" -map 2:a:0 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${finalOut}"`,
  { stdio: 'inherit' },
);

console.error(`[L5] ✓ b-roll composite → ${finalOut}`);
console.log(finalOut);
