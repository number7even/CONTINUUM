#!/usr/bin/env node
/**
 * AMF L5 render stage — L5 payload (voice + word timestamps) → MP4.
 *
 * Reads payload.json from the L4 voice stage, builds a HyperFrames composition
 * (9:16, Inkwell brand, karaoke word-synced captions + the synthesized voice
 * track), and renders a deterministic MP4 via `npx hyperframes render`.
 *
 * Runs on the worker (CPU/MPS — headless Chrome + FFmpeg). No GPU needed.
 *
 * Usage: node render.mjs <payload.json> <out-dir>
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';

const INK = '#232b2d', AULAIT = '#f6f3ec', CREME = '#c89a72', LUNAR = '#3f4e4f', MUTED = '#9aa09a';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function composeVideo(payload, audioFile, opts = {}) {
  const W = opts.width ?? 1080, H = opts.height ?? 1920, per = opts.wordsPerLine ?? 5;
  const header = opts.brandHeader ?? 'AMF · HEADLESS HIVE', footer = opts.footer ?? 'amf.continuum.rest';
  const words = payload.words?.length ? payload.words : [];
  const total = (words.length ? words[words.length - 1].end : payload.durationSec) + 0.6;
  const lines = [];
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per));
  let clips = '', tl = '';
  lines.forEach((ln, li) => {
    const id = `line${li}`, lstart = ln[0].start, lend = ln[ln.length - 1].end;
    const spans = ln.map((w, wi) => `<span id="${id}w${wi}" style="opacity:0.32">${esc(w.word)}</span>`).join(' ');
    clips += `\n      <div id="${id}" class="cap" data-start="${lstart.toFixed(2)}" data-duration="${(lend - lstart).toFixed(2)}" data-track-index="1">${spans}</div>`;
    ln.forEach((w, wi) => { tl += `\n      tl.to("#${id}w${wi}",{color:"${CREME}",opacity:1,duration:0.08},${w.start.toFixed(2)});`; });
    tl += `\n      tl.fromTo("#${id}",{opacity:0,y:30},{opacity:1,y:0,duration:0.3},${lstart.toFixed(2)});`;
    tl += `\n      tl.to("#${id}",{opacity:0,duration:0.25},${(lend + 0.05).toFixed(2)});`;
  });
  // Audio is muxed onto the rendered video with FFmpeg after render (robust +
  // deterministic), NOT embedded in the composition — HyperFrames' in-comp audio
  // muxing is finicky and the FFmpeg path is guaranteed. So: no <audio> element.
  const audioEl = '';
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=${W}, height=${H}"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:${INK};font-family:-apple-system,"Segoe UI",Roboto,sans-serif}
#brand{position:absolute;top:90px;left:0;right:0;text-align:center;color:${CREME};font-family:ui-monospace,monospace;font-size:34px;letter-spacing:2px}
#bar{position:absolute;top:160px;left:50%;transform:translateX(-50%);width:120px;height:3px;background:${LUNAR}}
.cap{position:absolute;top:50%;left:80px;right:80px;transform:translateY(-50%);text-align:center;color:${AULAIT};font-size:84px;font-weight:700;line-height:1.25}
#tag{position:absolute;bottom:120px;left:0;right:0;text-align:center;color:${MUTED};font-size:30px}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="${total.toFixed(2)}" data-width="${W}" data-height="${H}">
  <div id="brand">${esc(header)}</div><div id="bar"></div>${audioEl}${clips}
  <div id="tag">${esc(footer)}</div>
</div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
tl.from("#brand",{opacity:0,y:-20,duration:0.4},0);tl.from("#tag",{opacity:0,duration:0.5},0.2);${tl}
window.__timelines["main"]=tl;</script></body></html>`;
}

const payloadPath = process.argv[2];
const outDir = resolve(process.argv[3] || './render-out');
if (!payloadPath) { console.error('usage: node render.mjs <payload.json> <out-dir>'); process.exit(2); }

const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

// copy the audio into the project so HyperFrames can reference it locally
const audioSrc = payload.enhancedAudioUrl;
let audioFile = '';
if (audioSrc && existsSync(audioSrc)) {
  audioFile = basename(audioSrc);
  copyFileSync(audioSrc, resolve(outDir, audioFile));
}

// Proven sequence (verified 2026-06-25): hyperframes `init` scaffolds the
// recognized project layout, we overwrite index.html with our composition, then
// `npm run render` (the scaffold's own script) produces the MP4. A hand-rolled
// hyperframes.json is NOT recognized as a project root.
console.error('[L5] scaffolding HyperFrames project…');
execSync('npx --yes hyperframes@latest init proj', { cwd: outDir, stdio: 'inherit' });
const projDir = resolve(outDir, 'proj');
writeFileSync(resolve(projDir, 'index.html'), composeVideo(payload, audioFile));
if (audioFile) copyFileSync(resolve(outDir, audioFile), resolve(projDir, audioFile));

console.error('[L5] rendering video via HyperFrames…');
execSync('npm run render', { cwd: projDir, stdio: 'inherit' });

// find the rendered (silent) mp4
const rendersDir = resolve(projDir, 'renders');
const silent = execSync(`ls -t "${rendersDir}"/*.mp4 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
if (!silent) { console.error('[L5] ERROR: no rendered mp4 found'); process.exit(1); }

if (audioFile) {
  // Mux the voice track onto the silent video (deterministic FFmpeg path).
  const voiceWav = resolve(projDir, audioFile);
  const voiced = resolve(rendersDir, 'voiced.mp4');
  console.error('[L5] muxing voice track via FFmpeg…');
  execSync(
    `ffmpeg -y -i "${silent}" -i "${voiceWav}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${voiced}"`,
    { stdio: 'inherit' },
  );
  console.error(`[L5] ✓ voiced MP4 → ${voiced}`);
} else {
  console.error(`[L5] ✓ silent MP4 → ${silent}`);
}
