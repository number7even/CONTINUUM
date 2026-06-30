/**
 * produce-report.mjs — the DOWNLOAD ASSET (lead magnet) the Format-B post promises,
 * rendered in a PORTFOLIO BRANDBOOK (brandbooks/<name>.json).
 *
 * A branded, editorial, multi-page REPORT as a PDF: a brand-coloured COVER (brand bg +
 * ink + primary) then readable LIGHT content pages with brand-primary accents + a brand
 * CTA. This is what "comment <KEYWORD> for the full report" delivers. Pairs with
 * produce-post.mjs (the social teaser) — same topic, same brand, different surface.
 *
 *   node produce-report.mjs --brand voicecosmos --smoke
 *   AMF_REPORT_JSON='{"title":"…","sections":[…],"cta":{…}}' node produce-report.mjs --brand voicecosmos
 *
 * Output: apps/amf/worker/out/one-report.pdf. Renders HTML → PDF via headless Chrome.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'one-report.pdf');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const AMF_BRAND = {
  name: 'AMF', kicker: 'AMF', tagline: 'amf.continuum.rest',
  colors: { bg: '#232b2d', surface: '#2a3335', ink: '#f6f3ec', muted: '#9aa09a', primary: '#c89a72', primaryInk: '#1c2224', hairline: '#3f4e4f' },
  fonts: { css: '', heading: '-apple-system,"Segoe UI",Roboto,sans-serif', body: '-apple-system,"Segoe UI",Roboto,sans-serif', mono: 'ui-monospace,monospace' },
};

function loadBrand(name) {
  if (!name || name === 'amf') return AMF_BRAND;
  try {
    const b = JSON.parse(readFileSync(join(HERE, 'brandbooks', `${name}.json`), 'utf8'));
    return { ...AMF_BRAND, ...b, colors: { ...AMF_BRAND.colors, ...(b.colors || {}) }, fonts: { ...AMF_BRAND.fonts, ...(b.fonts || {}) } };
  } catch { console.error(`[report] brandbook "${name}" not found → AMF default`); return AMF_BRAND; }
}

/** Multi-page editorial report. Brand cover + readable light content + brand accents. */
export function composeReport(d, brand) {
  const c = brand.colors, f = brand.fonts;
  // content palette — always readable, brand only as accent (some primaries are bright)
  const PAPER = '#ffffff', TEXT = '#1f2421', BODY = '#39423f', LABEL = '#5b6360', RULE = '#e9e6df';
  const sections = (d.sections || []).map((s, i) => {
    const stats = (s.stats || []).map((st) => `<div class="kpi"><div class="kpi-n">${esc(st.stat)}</div><div class="kpi-l">${esc(st.label)}</div></div>`).join('');
    return `<section class="page">
      <div class="sec-no">${String(i + 1).padStart(2, '0')} &middot; ${esc(brand.kicker)}</div>
      <h2>${esc(s.heading)}</h2>
      ${stats ? `<div class="kpis">${stats}</div>` : ''}
      <div class="body">${esc(s.body).split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <div class="foot"><span>${esc(brand.name)}</span><span>${esc(brand.tagline || '')}</span></div>
    </section>`;
  }).join('');
  const fontLink = f.css ? `<link href="${f.css}" rel="stylesheet">` : '';

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/>${fontLink}<style>
@page{size:A4;margin:0}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:${f.body};color:${TEXT}}
.page{width:210mm;min-height:297mm;padding:26mm 24mm;background:${PAPER};page-break-after:always;position:relative}
.cover{background:${c.bg};color:${c.ink};display:flex;flex-direction:column;justify-content:space-between}
.cover .kicker{color:${c.primary};font-family:${f.mono};letter-spacing:4px;font-size:13pt;text-transform:uppercase}
.cover h1{font-family:${f.heading};font-size:44pt;font-weight:800;line-height:1.04;letter-spacing:-0.02em;margin-top:auto;max-width:16ch}
.cover .sub{color:${c.muted};font-size:15pt;line-height:1.5;margin-top:18pt;max-width:36ch}
.cover .bar{width:70pt;height:5pt;background:${c.primary};margin:22pt 0 0}
.cover .meta{color:${c.primary};font-family:${f.mono};font-size:11pt;margin-top:14pt}
.sec-no{color:${c.primary};font-family:${f.mono};font-size:11pt;letter-spacing:2px}
h2{font-family:${f.heading};font-size:27pt;font-weight:800;letter-spacing:-0.02em;line-height:1.1;margin:10pt 0 22pt;max-width:22ch;color:${TEXT}}
.kpis{display:flex;gap:16pt;margin:0 0 24pt;flex-wrap:wrap}
.kpi{flex:1 1 28%;border-left:4px solid ${c.primary};padding:4pt 0 4pt 14pt;min-width:120pt}
.kpi-n{font-size:30pt;font-weight:800;color:${TEXT};letter-spacing:-0.02em}
.kpi-l{font-size:10.5pt;color:${LABEL};line-height:1.3;margin-top:4pt}
.body p{font-size:12.5pt;line-height:1.65;margin-bottom:12pt;color:${BODY};max-width:62ch}
.cta{background:${c.primary};color:${c.primaryInk};border-radius:10pt;padding:26pt;margin-top:8pt}
.cta h3{font-family:${f.heading};font-size:21pt;font-weight:800;margin-bottom:8pt}
.cta p{font-size:13pt;line-height:1.5}
.foot{position:absolute;bottom:14mm;left:24mm;right:24mm;display:flex;justify-content:space-between;color:${LABEL};font-family:${f.mono};font-size:9pt;border-top:1px solid ${RULE};padding-top:8pt}
</style></head><body>
<div class="page cover">
  <div class="kicker">${esc(d.kicker || brand.kicker)}</div>
  <div><h1>${esc(d.title || '')}</h1><div class="bar"></div><div class="sub">${esc(d.subtitle || '')}</div>
  <div class="meta">${esc(d.author || 'Riaan Kleynhans')} &middot; ${esc(brand.name)}</div></div>
</div>
${sections}
<section class="page">
  <div class="sec-no">${esc(brand.kicker)}</div>
  <div class="cta" style="margin-top:30pt"><h3>${esc(d.cta?.headline || 'See it on your numbers.')}</h3><p>${esc(d.cta?.body || '')}</p></div>
  <div class="foot"><span>${esc(brand.name)} &middot; ${esc(brand.tagline || '')}</span><span>amf.continuum.rest</span></div>
</section>
</body></html>`;
}

function renderPdf(html) {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set CHROME_BIN)`);
  const work = mkdtempSync(join(tmpdir(), 'amf-report-'));
  const htmlPath = join(work, 'report.html');
  writeFileSync(htmlPath, html);
  execSync(`"${CHROME}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${OUT}" "file://${htmlPath}"`, { stdio: 'ignore' });
  rmSync(work, { recursive: true, force: true });
  if (!existsSync(OUT)) throw new Error('Chrome produced no PDF');
  return OUT;
}

const SAMPLE = {
  title: 'The Hidden Revenue Leaks Bleeding High-End Spas',
  subtitle: 'Why a 12-therapist spa loses €2,400+ a week to logistics it has quietly accepted — and how an AI concierge plugs it.',
  author: 'Riaan Kleynhans',
  sections: [
    { heading: 'The swan and the water', body: 'To the client, a high-end spa is a swan gliding across a still lake — lavender, dimmed light, calm.\n\nUnderneath, the owner is paddling furiously: missed calls, scheduling Tetris, empty tables. The serenity you sell is the opposite of how you run.' },
    { heading: 'Where the money leaks', stats: [{ stat: '12-15%', label: 'no-show / late-cancel rate' }, { stat: '€80-120', label: 'lost per empty bed, per hour' }, { stat: '50%', label: 'of generic text reminders fail' }], body: 'The visible leak is no-shows. The invisible one is the 8pm call — the exhausted client who books tomorrow at peak intent, hits voicemail, and books your competitor instead. Four a night, six nights a week: ~24 bookings a week walking out the door.' },
    { heading: 'The concierge that never sleeps', body: 'ARIAN answers at 8pm in a warm Harbour persona, reads intent ("my shoulders are killing me"), cross-references therapist skill tags, and books the slot — bi-directionally, into your existing software.\n\nThe choice at 8pm was never AI versus a great receptionist. It was AI versus a dead-end voicemail.' },
  ],
  cta: { headline: 'See it on your numbers.', body: 'Book a 15-minute ARIAN walkthrough and we will model the recovery against your actual no-show and after-hours data. No deck, just your numbers.' },
};

function main() {
  const a = process.argv;
  const bi = a.indexOf('--brand');
  const brand = loadBrand(bi >= 0 ? a[bi + 1] : process.env.AMF_BRAND);
  let data = SAMPLE;
  if (!a.includes('--smoke') && process.env.AMF_REPORT_JSON) {
    try { data = JSON.parse(process.env.AMF_REPORT_JSON); } catch { console.error('bad AMF_REPORT_JSON'); process.exit(2); }
  }
  console.error(`\nAMF report · brand=${brand.name} · "${(data.title || '').slice(0, 46)}…"`);
  const out = renderPdf(composeReport(data, brand));
  const kb = Math.round(statSync(out).size / 1024);
  const ok = existsSync(out) && kb > 5;
  console.error(`  ${kb} KB · ${(data.sections?.length || 0) + 2} pages`);
  console.error(`\n${ok ? '✅ PASS' : '❌ FAIL'} — lead-magnet report (${brand.name}) → ${out}\n`);
  process.exit(ok ? 0 : 1);
}
main();
