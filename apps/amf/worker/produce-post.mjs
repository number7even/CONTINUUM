/**
 * produce-post.mjs — content format B: a HyperFrames INFOGRAPHIC post + download CTA,
 * rendered in a PORTFOLIO BRANDBOOK (colors/fonts per vertical).
 *
 * No face, no voice. Takes a topic + 2-3 stats and a brandbook → a clean, on-brand
 * 9:16 motion-graphic post via HyperFrames, with a "comment <KEYWORD> for the full
 * report" lead-magnet CTA. Pairs with produce-short.mjs (the walk-and-talk half) and
 * produce-report.mjs (the lead-magnet PDF). Brandbooks live in ./brandbooks/<name>.json.
 *
 *   node produce-post.mjs --brand voicecosmos --smoke
 *   AMF_POST_JSON='{"headline":"…","points":[{"stat":"…","label":"…"}],"cta":"REPORT"}' \
 *     node produce-post.mjs --brand voicecosmos
 *
 * Output: apps/amf/worker/out/one-post.mp4 (1080x1920). Requires HyperFrames (npx) + ffmpeg.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'one-post.mp4');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Default brand (the AMF placeholder) — any brandbook.json overrides these keys. */
const AMF_BRAND = {
  name: 'AMF', kicker: 'AMF · HEADLESS HIVE', tagline: 'amf.continuum.rest',
  colors: { bg: '#232b2d', surface: '#2a3335', ink: '#f6f3ec', muted: '#9aa09a', primary: '#c89a72', primaryInk: '#1c2224', hairline: '#3f4e4f' },
  fonts: { css: '', heading: '-apple-system,"Segoe UI",Roboto,sans-serif', body: '-apple-system,"Segoe UI",Roboto,sans-serif', mono: 'ui-monospace,monospace' },
};

function loadBrand(name) {
  if (!name || name === 'amf') return AMF_BRAND;
  try {
    const b = JSON.parse(readFileSync(join(HERE, 'brandbooks', `${name}.json`), 'utf8'));
    return { ...AMF_BRAND, ...b, colors: { ...AMF_BRAND.colors, ...(b.colors || {}) }, fonts: { ...AMF_BRAND.fonts, ...(b.fonts || {}) } };
  } catch { console.error(`[post] brandbook "${name}" not found → AMF default`); return AMF_BRAND; }
}

/** Build the HyperFrames infographic composition (1080x1920) in the given brand. */
export function composeInfographic(d, brand) {
  const W = 1080, H = 1920;
  const c = brand.colors, f = brand.fonts;
  const points = (d.points || []).slice(0, 3);
  const total = (2.0 + points.length * 0.6 + 2.2).toFixed(2);
  const cta = d.cta || 'REPORT';

  let rows = '', tl = '';
  points.forEach((p, i) => {
    rows += `\n    <div class="stat" id="s${i}"><div class="num">${esc(p.stat)}</div><div class="lbl">${esc(p.label)}</div></div>`;
    tl += `\n      tl.fromTo("#s${i}",{opacity:0,y:36},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${(1.7 + i * 0.55).toFixed(2)});`;
    tl += `\n      tl.fromTo("#s${i} .num",{scale:0.8},{scale:1,duration:0.5,ease:"back.out(2)"},${(1.7 + i * 0.55).toFixed(2)});`;
  });
  const ctaAt = (1.9 + points.length * 0.55).toFixed(2);
  const fontLink = f.css ? `<link href="${f.css}" rel="stylesheet">` : '';

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=${W}, height=${H}"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>${fontLink}
<style>*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%, ${c.surface} 0%, ${c.bg} 62%);font-family:${f.body}}
#wrap{position:absolute;inset:0;padding:140px 90px}
#kicker{color:${c.primary};font-family:${f.mono};font-size:30px;letter-spacing:4px;text-transform:uppercase}
#rule{width:90px;height:4px;background:${c.primary};margin:26px 0 40px}
#head{color:${c.ink};font-family:${f.heading};font-size:96px;font-weight:800;line-height:1.04;letter-spacing:-0.03em;max-width:18ch;text-wrap:balance}
#stats{position:absolute;left:90px;right:90px;top:54%}
.stat{display:flex;align-items:baseline;gap:32px;padding:28px 0;border-bottom:1px solid ${c.hairline}}
.num{color:${c.primary};font-family:${f.heading};font-size:88px;font-weight:800;letter-spacing:-0.03em;white-space:nowrap;flex:0 0 auto}
.lbl{color:${c.ink};font-size:38px;font-weight:500;line-height:1.22;flex:1 1 auto}
#cta{position:absolute;left:90px;right:90px;bottom:160px;background:${c.primary};color:${c.primaryInk};border-radius:18px;padding:34px 40px;font-size:42px;font-weight:700;text-align:center}
#cta b{font-family:${f.mono}}
#brand{position:absolute;bottom:84px;left:0;right:0;text-align:center;color:${c.muted};font-size:28px;font-family:${f.mono};letter-spacing:2px}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
  <div id="wrap">
    <div id="kicker">${esc(d.kicker || brand.kicker)}</div>
    <div id="rule"></div>
    <div id="head">${esc(d.headline || '')}</div>
    <div id="stats">${rows}
    </div>
  </div>
  <div id="cta">Comment <b>${esc(cta)}</b> for the full report &darr;</div>
  <div id="brand">${esc(brand.name)} &middot; ${esc(brand.tagline || '')}</div>
</div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
tl.from("#kicker",{opacity:0,x:-30,duration:0.5},0.1);
tl.from("#rule",{scaleX:0,transformOrigin:"left",duration:0.5},0.4);
tl.from("#head",{opacity:0,y:40,duration:0.7,ease:"power3.out"},0.6);${tl}
tl.fromTo("#cta",{opacity:0,y:30},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${ctaAt});
tl.to("#cta",{scale:1.03,duration:0.4,yoyo:true,repeat:2,ease:"sine.inOut"},${(+ctaAt + 0.6).toFixed(2)});
tl.from("#brand",{opacity:0,duration:0.6},0.8);
window.__timelines["main"]=tl;</script></body></html>`;
}

function render(html) {
  mkdirSync(OUT_DIR, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'amf-post-'));
  execSync('npx --yes hyperframes@latest init proj', { cwd: work, stdio: 'ignore' });
  const proj = join(work, 'proj');
  writeFileSync(join(proj, 'index.html'), html);
  execSync('npm run render', { cwd: proj, stdio: 'ignore' });
  const mp4 = execSync(`ls -t "${join(proj, 'renders')}"/*.mp4 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
  if (!mp4 || !existsSync(mp4)) { rmSync(work, { recursive: true, force: true }); throw new Error('HyperFrames produced no mp4'); }
  copyFileSync(mp4, OUT);
  rmSync(work, { recursive: true, force: true });
  return OUT;
}

const SAMPLE = {
  headline: 'The 8pm call your front desk never answered.',
  points: [
    { stat: '12-15%', label: 'no-show / late-cancel rate' },
    { stat: '€80-120', label: 'lost per empty room, per hour' },
    { stat: '24/wk', label: 'after-hours bookings missed' },
  ],
  cta: 'ARIAN',
};

function main() {
  const a = process.argv;
  const bi = a.indexOf('--brand');
  const brand = loadBrand(bi >= 0 ? a[bi + 1] : process.env.AMF_BRAND);
  let data = SAMPLE;
  if (!a.includes('--smoke') && process.env.AMF_POST_JSON) {
    try { data = JSON.parse(process.env.AMF_POST_JSON); } catch { console.error('bad AMF_POST_JSON'); process.exit(2); }
  }
  console.error(`\nAMF post · brand=${brand.name} · "${(data.headline || '').slice(0, 46)}…" · CTA=${data.cta}`);
  const out = render(composeInfographic(data, brand));
  const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of default=noprint_wrappers=1 "${out}"`, { encoding: 'utf8' }).trim();
  const ok = /width=1080/.test(probe) && /height=1920/.test(probe);
  console.error('  ' + probe.split('\n').join(' · '));
  console.error(`\n${ok ? '✅ PASS' : '❌ FAIL'} — infographic post (${brand.name}) → ${out}\n`);
  process.exit(ok ? 0 : 1);
}
main();
