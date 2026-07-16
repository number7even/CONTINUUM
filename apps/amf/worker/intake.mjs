#!/usr/bin/env node
/**
 * intake.mjs — the VIDEO INTAKE SEAM (Rank-1 lack: the doorway the human fuel walks through).
 *
 * Accepts your RAW phone walk-and-talk MP4 and carries it through the factory:
 *
 *   1. NORMALIZE   — any orientation/size → 1080x1920 9:16 (scale + center-crop), h264+aac,
 *                    your ORIGINAL voice preserved (loudness-normalized; it IS the moat).
 *   2. TRANSCRIBE  — word-level timestamps via `npx hyperframes transcribe` (local Whisper).
 *                    Unavailable → captions are SKIPPED LOUDLY (P4: no fake even-spread sync
 *                    on real speech; a wrongly-timed karaoke reads as broken).
 *   3. CAPTIONS    — the proven caption engine (render.mjs → HyperFrames glyphs) renders on
 *                    near-black, colorkeyed out, overlaid over your footage above a subtle
 *                    scrim (compose-broll's technique, footage as the base).
 *   4. GRADE       — a mild deterministic cinematic grade (contrast+saturation trim, gentle
 *                    vignette). Never a look-change: your face, slightly sharpened.
 *   5. WELD + PARK — T (verify-artifact, sha-pinned) → A-claim + V (Ollama linesman) via
 *                    weld-artifact → the brief parks in the Review Dashboard (P9: your leap).
 *
 *   node intake.mjs <raw.mp4> --brand voicecosmos [--day 3] [--title "..."] [--no-captions]
 *
 * Env: AMF_INTAKE_WORDS=<payload.json>  (pre-computed word timestamps — used by the gate)
 *      AMF_INTAKE_SKIP_WELD=1           (stop after the render — used by the gate)
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import './env.mjs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, ...opts });

/** Probe a media file: streams + dimensions + duration. */
export function probe(file) {
  const j = JSON.parse(sh(`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height -show_entries format=duration -of json "${file}"`));
  const video = (j.streams ?? []).find(s => s.codec_type === 'video');
  const audio = (j.streams ?? []).find(s => s.codec_type === 'audio');
  return { video, audio, duration: Number(j.format?.duration ?? 0) };
}

/** ffmpeg filter: any input geometry → 1080x1920 (cover-scale + center crop). Pure. */
export function normalizeFilter(w, h) {
  // scale to COVER 1080x1920, then center-crop — portrait phones pass ~unchanged,
  // landscape gets an honest center punch-in (frame yourself center per the checklist).
  return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1`;
}

/** The mild deterministic grade — contrast/saturation trim + gentle vignette. Pure. */
export const GRADE = 'eq=contrast=1.06:saturation=1.08:brightness=-0.01,vignette=PI/5';

/** Step 1+4 — normalize + grade + loudness-normalize the ORIGINAL voice. */
export function normalize(rawPath, outPath) {
  const p = probe(rawPath);
  if (!p.video) throw new Error(`intake: no video stream in ${rawPath}`);
  if (!p.audio) throw new Error(`intake: no audio stream in ${rawPath} — the recording IS the voice; record with sound`);
  sh(`ffmpeg -y -v error -i "${rawPath}" -vf "${normalizeFilter(p.video.width, p.video.height)},${GRADE}" ` +
     `-af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k "${outPath}"`);
  return probe(outPath);
}

/** Step 2 — word timestamps. Injected file (gate) → local whisper → null (skip loudly). */
export function transcribeWords(videoPath, workDir) {
  if (process.env.AMF_INTAKE_WORDS && existsSync(process.env.AMF_INTAKE_WORDS)) {
    return JSON.parse(readFileSync(process.env.AMF_INTAKE_WORDS, 'utf8'));
  }
  try {
    const out = join(workDir, 'transcript.json');
    sh(`npx --yes hyperframes@latest transcribe "${videoPath}" -o "${out}" --json`, { timeout: 600_000 });
    const t = JSON.parse(readFileSync(out, 'utf8'));
    const words = (t.words ?? t.segments?.flatMap(s => s.words ?? []) ?? [])
      .map(w => ({ word: w.word ?? w.text, start: +w.start, end: +w.end }))
      .filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
    return words.length ? words : null;
  } catch { return null; }
}

/** Step 3 — captions over the footage: render glyphs on near-black → colorkey → scrim → overlay. */
export function overlayCaptions(footage, words, durationSec, outPath, workDir) {
  const payload = { jobId: 'intake', enhancedAudioUrl: '', durationSec, transcript: words.map(w => w.word).join(' '), segments: [], words, wordLevelSource: 'whisper', status: 'ready-for-assembly' };
  const payloadPath = join(workDir, 'payload.json');
  writeFileSync(payloadPath, JSON.stringify(payload));
  const renderDir = join(workDir, 'render');
  sh(`node "${join(HERE, 'render.mjs')}" "${payloadPath}" "${renderDir}"`, { timeout: 600_000, stdio: 'inherit' });
  const capsMp4 = sh(`ls -t "${join(renderDir, 'proj', 'renders')}"/*.mp4 2>/dev/null | head -1`).trim();
  if (!capsMp4) throw new Error('intake: caption render produced no mp4');
  // colorkey the near-black caption bg out; scrim under the caption band; ORIGINAL audio kept.
  sh(`ffmpeg -y -v error -i "${footage}" -i "${capsMp4}" -filter_complex ` +
     `"[0:v]drawbox=y=ih-480:h=480:color=black@0.35:t=fill[base];` +
     `[1:v]scale=1080:1920,colorkey=0x0b0b0f:0.18:0.05[caps];` +
     `[base][caps]overlay=0:0:shortest=1[v]" ` +
     `-map "[v]" -map 0:a -c:v libx264 -preset medium -crf 20 -c:a copy "${outPath}"`);
  return outPath;
}

/** The whole seam. Returns the session receipt. */
export async function intake({ raw, brand, day = null, title = null, captions = true }) {
  if (!existsSync(raw)) throw new Error(`intake: no such file ${raw}`);
  const work = mkdtempSync(join(tmpdir(), 'amf-intake-'));
  const outDir = join(HERE, 'out', 'fuel');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const slugName = `${brand}-wt-${stamp}-${createHash('sha256').update(raw + Date.now()).digest('hex').slice(0, 6)}`;
  const receipt = { brand, day, raw: resolve(raw), steps: [] };

  // 1+4 · normalize + grade (the original voice survives — loudnorm only).
  const normalized = join(work, 'normalized.mp4');
  const np = normalize(raw, normalized);
  receipt.steps.push({ step: 'normalize+grade', ok: true, dims: `${np.video.width}x${np.video.height}`, duration: +np.duration.toFixed(1) });

  // 2 · transcribe (or skip loudly).
  let words = null;
  if (captions) {
    words = transcribeWords(normalized, work);
    receipt.steps.push(words
      ? { step: 'transcribe', ok: true, words: words.length }
      : { step: 'transcribe', ok: false, note: 'whisper unavailable — captions SKIPPED (P4: no fake sync on real speech)' });
  } else receipt.steps.push({ step: 'transcribe', ok: false, note: 'captions disabled by flag' });

  // 3 · captions overlay (only with real words).
  const finalPath = join(outDir, `${slugName}.mp4`);
  if (words) {
    overlayCaptions(normalized, words, np.duration, finalPath, work);
    receipt.steps.push({ step: 'captions-overlay', ok: true });
  } else {
    sh(`cp "${normalized}" "${finalPath}"`);
    receipt.steps.push({ step: 'captions-overlay', ok: false, note: 'shipped clean (no captions)' });
  }
  receipt.artifact = finalPath;
  receipt.sha256 = createHash('sha256').update(readFileSync(finalPath)).digest('hex');

  // 5 · T check → park in review → weld (A-claim + V linesman).
  const t = execSync(`node "${join(HERE, 'verify-artifact.mjs')}" "${finalPath}" --sha ${receipt.sha256}`, { encoding: 'utf8' }).trim();
  receipt.steps.push({ step: 'T-check', ok: /GREEN/.test(t), out: t.slice(0, 120) });

  const brief = {
    id: slugName, status: 'pending', queuedAt: new Date().toISOString(), slug: brand, brand,
    format: 'walk-and-talk', headline: title ?? `Walk-and-talk — ${brand}${day ? ` day ${day}` : ''} (${stamp})`,
    cta: 'REVIEW', drafted: 'human-fuel',
    points: receipt.steps.map(s => ({ stat: s.step, label: s.ok ? 'ok' : (s.note ?? 'skipped') })),
    render: { rendered: true, tool: 'intake.mjs', note: finalPath },
    angle: 'Operator recording — the human core. Machine packaging only; the voice is untouched.',
  };
  const pendingDir = join(HERE, 'out', 'review-queue', 'pending');
  mkdirSync(pendingDir, { recursive: true });
  const briefPath = join(pendingDir, `${slugName}.json`);
  writeFileSync(briefPath, JSON.stringify(brief, null, 2));
  receipt.steps.push({ step: 'park-review', ok: true, brief: briefPath });

  if (process.env.AMF_INTAKE_SKIP_WELD !== '1') {
    const w = execSync(`node "${join(HERE, 'weld-artifact.mjs')}" "${finalPath}" --brief "${briefPath}" --project ${process.env.CONTINUUM_PROJECT_ID || 'graph-demo'}`, { encoding: 'utf8' });
    receipt.steps.push({ step: 'weld A+V', ok: true, out: w.split('\n').filter(Boolean).slice(-2).join(' · ') });
  } else receipt.steps.push({ step: 'weld A+V', ok: false, note: 'skipped by env (gate mode)' });

  return receipt;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv;
  const raw = a[2];
  const arg = (f, d) => { const i = a.indexOf(f); return i > 0 ? a[i + 1] : d; };
  if (!raw || raw.startsWith('--')) { console.error('usage: node intake.mjs <raw.mp4> --brand <slug> [--day N] [--title "..."] [--no-captions]'); process.exit(2); }
  const receipt = await intake({ raw, brand: arg('--brand', 'voicecosmos'), day: arg('--day', null), title: arg('--title', null), captions: !a.includes('--no-captions') });
  console.log('\n═ INTAKE RECEIPT ═');
  for (const s of receipt.steps) console.log(`  ${s.ok ? '✓' : '○'} ${s.step}${s.note ? ` — ${s.note}` : ''}${s.dims ? ` — ${s.dims} · ${s.duration}s` : ''}${s.words ? ` — ${s.words} words` : ''}`);
  console.log(`\nartifact: ${receipt.artifact}\nsha256:   ${receipt.sha256.slice(0, 16)}…`);
  console.log(`P9: review + approve →  node ${join(HERE, 'review.mjs')} --approve ${basename(receipt.artifact, '.mp4')} --publish  (or the dashboard)`);
}
