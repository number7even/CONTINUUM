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
  const audioEl = audioFile ? `<audio src="${esc(audioFile)}" data-start="0" data-duration="${total.toFixed(2)}"></audio>` : '';
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

writeFileSync(resolve(outDir, 'index.html'), composeVideo(payload, audioFile));
// minimal hyperframes project config
writeFileSync(resolve(outDir, 'hyperframes.json'), JSON.stringify({ paths: { blocks: 'compositions', assets: 'assets' } }, null, 2));

console.error('[L5] rendering MP4 via HyperFrames…');
execSync('npx --yes hyperframes@latest render', { cwd: outDir, stdio: 'inherit' });
console.error(`[L5] done → ${outDir}/renders/`);
