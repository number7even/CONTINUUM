#!/usr/bin/env node
/**
 * verify-artifact.mjs — T's mechanical check for a produced AMF video artifact.
 *
 * Exit 0 iff the file exists, is h264, is 1080x1920 (9:16), has audio, has duration > 0,
 * and (if --sha given) matches the pinned SHA-256 — so the claim is bound to these exact
 * bytes, and a silent re-render/tamper flips the ledger to REFUTED on re-test.
 *
 *   node verify-artifact.mjs <file.mp4> [--sha <hex>]
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
const si = process.argv.indexOf('--sha');
const wantSha = si > 0 ? process.argv[si + 1] : null;

const fail = (why) => { console.error(`ARTIFACT_CHECK: RED — ${why}`); process.exit(1); };
if (!file) fail('usage: verify-artifact.mjs <file.mp4> [--sha <hex>]');
if (!existsSync(file)) fail(`missing file: ${file}`);

let probe;
try {
  probe = execSync(
    `ffprobe -v error -show_entries stream=codec_type,codec_name,width,height -show_entries format=duration -of json "${file}"`,
    { encoding: 'utf8', timeout: 30_000 },
  );
} catch { fail('ffprobe failed'); }
const j = JSON.parse(probe);
const video = (j.streams ?? []).find((s) => s.codec_type === 'video');
const audio = (j.streams ?? []).find((s) => s.codec_type === 'audio');
const duration = Number(j.format?.duration ?? 0);

if (!video) fail('no video stream');
if (video.codec_name !== 'h264') fail(`codec ${video.codec_name} ≠ h264`);
if (video.width !== 1080 || video.height !== 1920) fail(`${video.width}x${video.height} ≠ 1080x1920 (9:16)`);
if (!audio) fail('no audio stream');
if (!(duration > 0)) fail('duration is 0');

const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
if (wantSha && sha !== wantSha) fail(`sha ${sha.slice(0, 12)}… ≠ pinned ${wantSha.slice(0, 12)}… (bytes changed since the claim)`);

console.log(`ARTIFACT_CHECK: GREEN — h264 1080x1920 ${duration.toFixed(1)}s audio=✓ sha=${sha.slice(0, 12)}…`);
process.exit(0);
