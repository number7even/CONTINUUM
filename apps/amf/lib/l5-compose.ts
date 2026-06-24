/**
 * L5 assembly — compose a HyperFrames video composition from an L4 audio payload.
 *
 * Input: L5AudioPayload (words[] with timings, from L4 Auphonic + alignment).
 * Output: a HyperFrames index.html (1080x1920 9:16) — Inkwell brand background,
 * karaoke-style word-synced captions, brand header/footer. `npx hyperframes
 * render` turns it into a deterministic MP4.
 *
 * PROVEN (2026-06-24): this composition format rendered a real 9:16 h264 MP4 on
 * CPU (headless Chrome + FFmpeg), no GPU, no operator secrets. See
 * docs/AMF-L5-ASSEMBLY.md. The GPU (ComfyUI) is only for AI B-roll layered on
 * top; word-synced caption videos ship without it.
 *
 * Runs on a CPU worker (NOT Vercel serverless — headless Chrome render is too
 * heavy for a serverless function), same execution tier as the L4 alignment pass.
 */
import type { L5AudioPayload, WordTiming } from './l5-payload';

const INK = '#232b2d';
const AULAIT = '#f6f3ec';
const CREME = '#c89a72';
const LUNAR = '#3f4e4f';
const MUTED = '#9aa09a';

export interface ComposeOptions {
  width?: number; // default 1080 (9:16)
  height?: number; // default 1920
  wordsPerLine?: number; // default 5
  audioSrc?: string; // enhanced audio URL/path (HyperFrames <audio data-start>)
  brandHeader?: string;
  footer?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build the HyperFrames composition HTML from word-level timings. */
export function composeVideo(payload: L5AudioPayload, opts: ComposeOptions = {}): string {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const per = opts.wordsPerLine ?? 5;
  const header = opts.brandHeader ?? 'AMF · HEADLESS HIVE';
  const footer = opts.footer ?? 'amf.continuum.rest';

  const words: WordTiming[] = payload.words?.length ? payload.words : [];
  const total = (words.length ? words[words.length - 1].end : payload.durationSec) + 0.6;

  // group words into caption lines
  const lines: WordTiming[][] = [];
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per));

  let clips = '';
  let tl = '';
  lines.forEach((ln, li) => {
    const id = `line${li}`;
    const lstart = ln[0].start;
    const lend = ln[ln.length - 1].end;
    const spans = ln.map((w, wi) => `<span id="${id}w${wi}" style="opacity:0.32">${esc(w.word)}</span>`).join(' ');
    clips += `\n      <div id="${id}" class="cap" data-start="${lstart.toFixed(2)}" data-duration="${(lend - lstart).toFixed(2)}" data-track-index="1">${spans}</div>`;
    ln.forEach((w, wi) => {
      tl += `\n      tl.to("#${id}w${wi}",{color:"${CREME}",opacity:1,duration:0.08},${w.start.toFixed(2)});`;
    });
    tl += `\n      tl.fromTo("#${id}",{opacity:0,y:30},{opacity:1,y:0,duration:0.3},${lstart.toFixed(2)});`;
    tl += `\n      tl.to("#${id}",{opacity:0,duration:0.25},${(lend + 0.05).toFixed(2)});`;
  });

  // optional enhanced-audio track (the human voice from L4/Auphonic)
  const audioEl = opts.audioSrc
    ? `<audio src="${esc(opts.audioSrc)}" data-start="0" data-duration="${total.toFixed(2)}"></audio>`
    : '';

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
