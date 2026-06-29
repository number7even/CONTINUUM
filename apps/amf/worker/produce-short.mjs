#!/usr/bin/env node
/**
 * produce-short.mjs — the AMF "one-short" producing-slice MVP.
 *
 * Runs L3→L5 end-to-end and emits ONE real 1080x1920 MP4 through the REAL
 * compose-broll.mjs compositor. The fuel/model/GPU-gated stages are honestly
 * STUBBED with FFmpeg-generated placeholders so the assembly MECHANICS are proven
 * NOW, before any of:
 *   • your voice recording + Supertonic/whisperx  (L4 — STUB: silent + even timings)
 *   • a licensed b-roll library / ComfyUI GPU swarm (L4-vis — STUB: FFmpeg test footage)
 *   • a rented StudioMunich face                    (avatar — omitted; voice-over-b-roll MVP)
 *
 * The moment those land, swap the stubs for the real workers — the L5 composite
 * stage (compose-broll.mjs) does not change.
 *
 *   node apps/amf/worker/produce-short.mjs
 *
 * Requires: ffmpeg (verified 8.1). No GPU, no secrets, no network.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'one-short.mp4');
const sh = (c) => execSync(c, { stdio: 'ignore', shell: '/bin/bash' });

// ── L3 (script) — STUB sample. Production: AI Director from your manifesto/Brand DNA.
const SCRIPT = [
  'Memory was the tax we kept paying.',
  'Every session started cold. Every promise, unverified.',
  'So we built an engine that proves before it claims.',
  'A task is done only when its shell command exits zero.',
  'This short was assembled by that engine. Verify, then dissolve.',
];
const SECS_PER_LINE = 2.2;
const TOTAL = +(SCRIPT.length * SECS_PER_LINE).toFixed(2);
const INK = '232b2d'; // Inkwell bg (keyed out by compose-broll's colorkey)

const work = mkdtempSync(join(tmpdir(), 'amf-short-'));
mkdirSync(OUT_DIR, { recursive: true });
let stage = 0;
const step = (label) => console.log(`  [${++stage}] ${label}`);

console.log(`\nAMF one-short producing slice · total=${TOTAL}s · work=${work}\n`);

// ── L4 (voice + word timing) — STUB: quiet tone + even line timings ──────────────
step('L4 voice  — STUB (silent-ish tone; real = your recording → Supertonic → Auphonic)');
const voiceWav = join(work, 'voice.wav');
sh(`ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${TOTAL}" -af "volume=0.04" -ar 44100 -ac 1 "${voiceWav}"`);
const lines = SCRIPT.map((text, i) => ({ text, start: +(i * SECS_PER_LINE).toFixed(2), end: +((i + 1) * SECS_PER_LINE - 0.1).toFixed(2) }));
console.log(`      payload: ${lines.length} caption lines, wordLevelSource="none" (stub — no whisperx)`);

// ── L5a (captions) — caption-position PLACEHOLDER bars (MVP) ──────────────────────
// This ffmpeg build lacks text libs (no libfreetype/libass → no drawtext/ass/subtitles),
// so the MVP draws creme caption-position BARS per line via `drawbox` (available) on the
// Inkwell bg, timed to each line — proving the caption-track timing + colorkey-overlay
// stage of the compositor. PRODUCTION renders real word-synced glyphs via the existing
// composeVideo() → HyperFrames (headless Chrome, no ffmpeg text libs needed).
step('L5 captions — PLACEHOLDER bars (no ffmpeg text libs; production = composeVideo → HyperFrames)');
const boxes = lines.map((l) => {
  const bw = Math.min(Math.max(l.text.length * 26, 220), 920);
  return `drawbox=x=(1080-${bw})/2:y=900:w=${bw}:h=96:color=0xc89a72@0.92:t=fill:enable='between(t,${l.start},${l.end})'`;
}).join(',');
const captionsMp4 = join(work, 'captions.mp4');
sh(`ffmpeg -y -f lavfi -i "color=c=0x${INK}:s=1080x1920:r=30:d=${TOTAL}" -vf "${boxes}" -c:v libx264 -pix_fmt yuv420p "${captionsMp4}"`);

// ── L5b (b-roll) — STUB FFmpeg test footage (real = licensed library / ComfyUI) ──
step('L4-vis b-roll — STUB FFmpeg test footage (real = licensed clips / ComfyUI swarm)');
const per = +(TOTAL / 3).toFixed(2);
const sources = [
  `gradients=s=1080x1920:d=${per}:speed=0.08:c0=0x1a2a2a:c1=0x3f4e4f`,
  `mandelbrot=s=1080x1920:rate=30`,
  `testsrc2=s=1080x1920:d=${per}:r=30`,
];
const scenes = [];
sources.forEach((src, i) => {
  const f = `broll-${i}.mp4`;
  sh(`ffmpeg -y -f lavfi -i "${src}" -t ${per} -c:v libx264 -pix_fmt yuv420p "${join(work, f)}"`);
  scenes.push({ file: f, durationSec: per });
});
const scenesPath = join(work, 'scenes.json');
writeFileSync(scenesPath, JSON.stringify({ scenes }, null, 2));

// ── L5c (composite) — the REAL compositor, unchanged from production ─────────────
step('L5 composite — REAL compose-broll.mjs (b-roll → colorkey captions → mux voice → 9:16)');
execSync(`node "${join(HERE, 'compose-broll.mjs')}" "${scenesPath}" "${captionsMp4}" "${voiceWav}" "${OUT}"`, { stdio: 'inherit' });

// ── prove it's a real artifact ──────────────────────────────────────────────────
console.log('\n  Verifying the output is a real 9:16 MP4…');
const probe = execSync(
  `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name -show_entries format=duration -of default=noprint_wrappers=1 "${OUT}"`,
  { encoding: 'utf8' },
);
const hasAudio = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "${OUT}" || true`, { encoding: 'utf8' }).trim();
console.log(probe.split('\n').filter(Boolean).map((l) => `      ${l}`).join('\n'));
console.log(`      audio stream: ${hasAudio || '(none)'}`);

const ok = /width=1080/.test(probe) && /height=1920/.test(probe) && !!hasAudio && existsSync(OUT);
rmSync(work, { recursive: true, force: true });
console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'} — one short produced → ${OUT}`);
console.log('   REAL: L5 assembly (compose-broll.mjs) · 9:16 vertical · b-roll concat/scale/crop · caption-track colorkey-overlay · voice mux');
console.log('   STUB: voice (your recording→Supertonic→Auphonic) · word-timing (whisperx) · b-roll (licensed/ComfyUI) · face (StudioMunich VAULT)');
console.log('   GAP : caption TEXT — this ffmpeg lacks libfreetype/libass (drew placeholder bars). Real glyphs = composeVideo → HyperFrames (exists), or an ffmpeg built with libass.\n');
process.exit(ok ? 0 : 1);
