#!/usr/bin/env node
/**
 * produce-short.mjs — the AMF "one-short" producing-slice MVP.
 *
 * Runs L3→L5 end-to-end and emits ONE real 1080x1920 MP4:
 *   captions  → REAL text glyphs via composeVideo → HyperFrames (headless Chrome)
 *   composite → REAL compose-broll.mjs (b-roll → colorkey caption overlay → voice mux → 9:16)
 *
 * Accepts real inputs (env), falls back to honest stubs so the MECHANICS are
 * provable with no fuel:
 *   AMF_SCRIPT=<file>     one caption line per row   (else: sample script)
 *   AMF_VOICE=<file>      real voice recording wav/mp3 (else: quiet tone stub)
 *   AMF_BROLL=<a,b,c>     real/licensed b-roll clips  (else: ffmpeg test footage)
 *   AUPHONIC_API_KEY + AUPHONIC_PRESET_UUID  → enhance the voice (gated; see note)
 *
 * Word-level timing is even-spread (wordLevelSource="none") until whisperx is
 * wired — honest: the glyphs are real, the per-word *timing* is a stub.
 *
 *   node apps/amf/worker/produce-short.mjs
 *
 * Requires: ffmpeg + node (HyperFrames pulled via npx on first run). No GPU, no secrets.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'one-short.mp4');
const sh = (c) => execSync(c, { stdio: 'ignore', shell: '/bin/bash' });
const cap = (c) => execSync(c, { encoding: 'utf8', shell: '/bin/bash' }).trim();
const probeDur = (f) => parseFloat(cap(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`)) || 0;

const work = mkdtempSync(join(tmpdir(), 'amf-short-'));
mkdirSync(OUT_DIR, { recursive: true });
let n = 0;
const step = (s) => console.log(`  [${++n}] ${s}`);
const real = [], stub = [];

console.log(`\nAMF one-short producing slice · work=${work}\n`);

// ── L3 (script) — real file or sample ────────────────────────────────────────
const SCRIPT = process.env.AMF_SCRIPT && existsSync(process.env.AMF_SCRIPT)
  ? readFileSync(process.env.AMF_SCRIPT, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  : [
      'Memory was the tax we kept paying.',
      'Every session started cold. Every promise, unverified.',
      'So we built an engine that proves before it claims.',
      'A task is done only when its shell command exits zero.',
      'Verify, then dissolve.',
    ];
process.env.AMF_SCRIPT ? real.push('script') : stub.push('script (sample)');

// ── L4 (voice) — real recording (+ optional Auphonic) or stub tone ───────────
step('L4 voice');
let voiceWav = join(work, 'voice.wav');
let TOTAL;
if (process.env.AMF_VOICE && existsSync(process.env.AMF_VOICE)) {
  // normalise to wav 44.1k mono; honour real duration
  sh(`ffmpeg -y -i "${process.env.AMF_VOICE}" -ar 44100 -ac 1 "${voiceWav}"`);
  voiceWav = await maybeAuphonic(voiceWav);
  TOTAL = +probeDur(voiceWav).toFixed(2);
  real.push('voice (your recording)');
  console.log(`      real voice · ${TOTAL}s`);
} else {
  TOTAL = +(SCRIPT.length * 2.2).toFixed(2);
  sh(`ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${TOTAL}" -af "volume=0.04" -ar 44100 -ac 1 "${voiceWav}"`);
  stub.push('voice (quiet tone → swap: recording→Supertonic→Auphonic)');
  console.log(`      STUB tone · ${TOTAL}s`);
}

// ── word-level timings (even-spread stub; real glyphs) ───────────────────────
const allWords = SCRIPT.join(' ').split(/\s+/).filter(Boolean);
const dt = TOTAL / allWords.length;
const words = allWords.map((w, i) => ({ word: w, start: +(i * dt).toFixed(2), end: +((i + 1) * dt - 0.02).toFixed(2) }));

// ── L5 captions — REAL glyphs via composeVideo → HyperFrames ─────────────────
step('L5 captions — REAL text glyphs (composeVideo → HyperFrames, headless Chrome)');
const payload = {
  jobId: 'one-short', enhancedAudioUrl: '', durationSec: TOTAL,
  transcript: SCRIPT.join(' '), segments: [], words, wordLevelSource: 'none',
  status: 'ready-for-assembly',
};
const payloadPath = join(work, 'payload.json');
writeFileSync(payloadPath, JSON.stringify(payload));
const renderDir = join(work, 'render');
execSync(`node "${join(HERE, 'render.mjs')}" "${payloadPath}" "${renderDir}"`, { stdio: 'inherit' });
const captionsMp4 = cap(`ls -t "${join(renderDir, 'proj', 'renders')}"/*.mp4 2>/dev/null | head -1`);
if (!captionsMp4 || !existsSync(captionsMp4)) { console.error('HyperFrames produced no captions mp4'); process.exit(1); }
real.push('captions (real glyphs)');
stub.push('word-timing (even-spread → swap: whisperx)');

// ── L4-vis b-roll — real/licensed clips or stub footage ──────────────────────
step('L4-vis b-roll');
const per = +(TOTAL / 3).toFixed(2);
let scenes;
if (process.env.AMF_BROLL) {
  const clips = process.env.AMF_BROLL.split(',').map((s) => s.trim()).filter((p) => existsSync(p));
  if (!clips.length) { console.error('AMF_BROLL set but no clips exist'); process.exit(1); }
  scenes = clips.map((file) => ({ file: resolve(file), durationSec: +(TOTAL / clips.length).toFixed(2) }));
  real.push(`b-roll (${clips.length} licensed clips)`);
} else {
  scenes = [];
  [`gradients=s=1080x1920:d=${per}:speed=0.08:c0=0x1a2a2a:c1=0x3f4e4f`, `mandelbrot=s=1080x1920:rate=30`, `testsrc2=s=1080x1920:d=${per}:r=30`]
    .forEach((src, i) => { const f = `broll-${i}.mp4`; sh(`ffmpeg -y -f lavfi -i "${src}" -t ${per} -c:v libx264 -pix_fmt yuv420p "${join(work, f)}"`); scenes.push({ file: f, durationSec: per }); });
  stub.push('b-roll (ffmpeg test footage → swap: licensed / ComfyUI)');
}
const scenesPath = join(work, 'scenes.json');
writeFileSync(scenesPath, JSON.stringify({ scenes }, null, 2));

// ── L5 composite — the REAL compositor ───────────────────────────────────────
step('L5 composite — REAL compose-broll.mjs (b-roll → colorkey glyphs → voice mux → 9:16)');
execSync(`node "${join(HERE, 'compose-broll.mjs')}" "${scenesPath}" "${captionsMp4}" "${voiceWav}" "${OUT}"`, { stdio: 'inherit' });

// ── prove it ─────────────────────────────────────────────────────────────────
const probe = cap(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name -show_entries format=duration -of default=noprint_wrappers=1 "${OUT}"`);
const audio = cap(`ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${OUT}" || true`);
console.log('\n' + probe.split('\n').filter(Boolean).map((l) => `      ${l}`).join('\n') + `\n      audio stream: ${audio || '(none)'}`);
const ok = /width=1080/.test(probe) && /height=1920/.test(probe) && !!audio && existsSync(OUT);
rmSync(work, { recursive: true, force: true });
console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'} — one short → ${OUT}`);
console.log(`   REAL: ${real.join(' · ')}`);
console.log(`   STUB: ${stub.join(' · ')}`);
process.exit(ok ? 0 : 1);

/**
 * Auphonic enhance (gated, best-effort, honestly labelled). Runs ONLY when both
 * AUPHONIC_API_KEY and AUPHONIC_PRESET_UUID are set. Untested without a key — on
 * any failure it returns the raw audio (P6 safely-endable, P4 no false claim).
 */
async function maybeAuphonic(wav) {
  const key = process.env.AUPHONIC_API_KEY, preset = process.env.AUPHONIC_PRESET_UUID;
  if (!key || !preset) { console.log('      Auphonic: skipped (set AUPHONIC_API_KEY + AUPHONIC_PRESET_UUID to enhance)'); return wav; }
  try {
    const H = { Authorization: `Bearer ${key}` };
    const BASE = 'https://auphonic.com/api';
    const created = await (await fetch(`${BASE}/productions.json`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ preset, metadata: { title: 'amf-one-short' } }) })).json();
    const uuid = created?.data?.uuid; if (!uuid) throw new Error('no uuid');
    const form = new FormData(); form.append('input_file', new Blob([readFileSync(wav)]), 'voice.wav');
    await fetch(`${BASE}/production/${uuid}/upload.json`, { method: 'POST', headers: H, body: form });
    await fetch(`${BASE}/production/${uuid}/start.json`, { method: 'POST', headers: H });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const p = (await (await fetch(`${BASE}/production/${uuid}.json`, { headers: H })).json())?.data;
      if (p?.status === 3 && p.output_files?.[0]) {
        const out = join(work, 'voice-auphonic.wav');
        const bytes = Buffer.from(await (await fetch(p.output_files[0].download_url, { headers: H })).arrayBuffer());
        writeFileSync(out, bytes); console.log('      Auphonic: ✓ enhanced'); real.push('Auphonic enhance');
        return out;
      }
      if (p?.status === 2) throw new Error('Auphonic production errored');
    }
    throw new Error('timeout');
  } catch (e) {
    console.log(`      Auphonic: failed (${e.message}) → using raw voice`);
    return wav;
  }
}
