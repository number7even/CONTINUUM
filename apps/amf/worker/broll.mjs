#!/usr/bin/env node
/**
 * AMF L4-visual — AI b-roll generation (fal.ai, on-the-fly, authentic).
 *
 * Per scene (derived from the script segments + timing), generate a short
 * vertical video clip from a prompt via fal.ai LTX ($0.02/clip), download it,
 * and emit a scene manifest the compositor layers behind the captions.
 *
 * "Authentic + on the fly": each clip is generated fresh per script — unique to
 * this video, never a shared stock loop. No GPU needed (fal.ai hosts it); the
 * same prompts move to a self-hosted ComfyUI GPU later for $0/clip.
 *
 * Gated on FAL_KEY (P1/P9 — operator secret). Clean exit if unset (P6).
 *
 * Usage: node broll.mjs <payload.json> <out-dir>
 * Emits: <out-dir>/broll/scene-NN.mp4  and  <out-dir>/broll/scenes.json
 */
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { fal } from '@fal-ai/client';

const MODEL = process.env.FAL_VIDEO_MODEL || 'fal-ai/ltx-video';
const SECS_PER_SCENE = Number(process.env.AMF_SCENE_SECS || 4); // group captions into ~4s scenes

function hasFalKey() {
  return Boolean(process.env.FAL_KEY);
}

/** Turn a transcript segment into a visual b-roll prompt (cinematic, no text). */
function visualPrompt(text) {
  // keep it concrete + cinematic; the captions carry the words, b-roll sets the mood
  return `Cinematic vertical b-roll, 9:16, moody tech aesthetic, shallow depth of field, ` +
    `subtle camera motion. Scene illustrating: ${text.replace(/["\n]/g, ' ').slice(0, 180)}. ` +
    `No text, no captions, no words on screen.`;
}

/** Group word/segment timings into scenes of ~SECS_PER_SCENE. */
function buildScenes(payload) {
  const segs = payload.segments?.length ? payload.segments : [{ text: payload.transcript, start: 0, end: payload.durationSec }];
  const scenes = [];
  let cur = null;
  for (const s of segs) {
    if (!cur) { cur = { start: s.start, end: s.end, text: s.text }; continue; }
    if (s.end - cur.start <= SECS_PER_SCENE) { cur.end = s.end; cur.text += ' ' + s.text; }
    else { scenes.push(cur); cur = { start: s.start, end: s.end, text: s.text }; }
  }
  if (cur) scenes.push(cur);
  return scenes;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
  const fileStream = createWriteStream(dest);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
  }
  await new Promise((r) => fileStream.end(r));
}

async function main() {
  const payloadPath = process.argv[2];
  const outDir = resolve(process.argv[3] || './out');
  if (!payloadPath) { console.error('usage: node broll.mjs <payload.json> <out-dir>'); process.exit(2); }
  if (!hasFalKey()) {
    console.error('FAL_KEY not set — b-roll generation skipped. Set FAL_KEY to enable AI b-roll (fal.ai, ~$0.02/clip).');
    process.exit(3);
  }

  const payload = JSON.parse((await import('node:fs')).readFileSync(payloadPath, 'utf8'));
  const brollDir = resolve(outDir, 'broll');
  mkdirSync(brollDir, { recursive: true });

  const scenes = buildScenes(payload);
  console.error(`[L4-visual] ${scenes.length} scenes → generating b-roll via ${MODEL} (~$${(scenes.length * 0.02).toFixed(2)})`);

  const manifest = [];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const prompt = visualPrompt(sc.text);
    console.error(`[L4-visual] scene ${i + 1}/${scenes.length} (${sc.start.toFixed(1)}-${sc.end.toFixed(1)}s): ${sc.text.slice(0, 50)}…`);
    const result = await fal.subscribe(MODEL, {
      input: { prompt, aspect_ratio: '9:16' },
    });
    const url = result?.data?.video?.url || result?.data?.videos?.[0]?.url;
    if (!url) throw new Error(`no video url in fal result for scene ${i}`);
    const file = `scene-${String(i).padStart(2, '0')}.mp4`;
    await download(url, resolve(brollDir, file));
    manifest.push({ index: i, start: sc.start, end: sc.end, durationSec: +(sc.end - sc.start).toFixed(2), file, prompt });
  }

  writeFileSync(resolve(brollDir, 'scenes.json'), JSON.stringify({ scenes: manifest }, null, 2));
  console.error(`[L4-visual] ✓ ${manifest.length} clips → ${brollDir}/scenes.json`);
  console.log(resolve(brollDir, 'scenes.json'));
}

main().catch((e) => { console.error(`b-roll error: ${e.message}`); process.exit(1); });
