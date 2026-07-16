#!/usr/bin/env node
/**
 * teleprompter.mjs — the Recording Assistant (Layer-4 human-core support, Slice 4).
 *
 * The machine can ingest, rank, draft, and assemble — but the moat is YOU on camera.
 * This tool removes the friction from that one irreplaceable step: it surfaces a
 * calendar day's hook + angle as CUE CARDS (not a read-aloud script — walk-and-talk
 * authenticity) inside the MANDATORY 90-second H-P-I-P-A skeleton:
 *
 *   H  0–3s    Hook     — the contrarian line, walking at the camera (verbatim)
 *   P  3–15s   Problem  — name the specific pain
 *   I  15–40s  Insight  — the genuinely useful idea
 *   P  40–70s  Proof    — a REAL number or result you own (P4: never invent one)
 *   A  70–90s  Ask      — one specific next step
 *
 * The skeleton is ENFORCED: fixed segment windows, a live segment bar, auto-advance,
 * overrun in red. Zero-dep local HTTP (dashboard.mjs pattern) — nothing leaves the room.
 *
 *   node teleprompter.mjs --brand voicecosmos --day 3 [--profile company] [--port 8790]
 *   node teleprompter.mjs --brand voicecosmos --topic "booking recovery" --hook "..."
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandIdentity } from './brand-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The mandatory skeleton — fixed windows, total exactly 90s. */
export const HPIPA = [
  { key: 'H', name: 'Hook',    start: 0,  end: 3,  cue: 'Contrarian line — walking AT the camera. Verbatim.' },
  { key: 'P', name: 'Problem', start: 3,  end: 15, cue: 'Name the SPECIFIC pain. One pain, not three.' },
  { key: 'I', name: 'Insight', start: 15, end: 40, cue: 'The genuinely useful idea. Teach one thing.' },
  { key: 'P', name: 'Proof',   start: 40, end: 70, cue: 'A REAL number or result you own. P4: never invent one — if you have none, tell a specific true story instead.' },
  { key: 'A', name: 'Ask',     start: 70, end: 90, cue: 'ONE specific next step. Not two.' },
];

/** Find the latest generated calendar for a brand/profile. */
export function latestCalendar(brand, profile = 'company', outDir = join(HERE, 'out')) {
  if (!existsSync(outDir)) return null;
  const files = readdirSync(outDir)
    .filter(f => f.startsWith(`calendar-${brand}-${profile}-`) && f.endsWith('.json'))
    .sort();
  if (!files.length) return null;
  return JSON.parse(readFileSync(join(outDir, files[files.length - 1]), 'utf8'));
}

/** Build a recording session: the day's intelligence cast into the enforced skeleton. Pure. */
export function buildSession({ brand, angle, day }) {
  if (!day?.hook || !day?.topic) throw new Error('buildSession: day needs a hook + topic (run calendar.mjs first)');
  const segs = HPIPA.map(s => ({ ...s }));
  segs[0].card = day.hook;                                                    // H — verbatim
  segs[1].card = `The pain around "${day.topic}" — as ${day.angle ?? day.company_angle}.`;   // P
  segs[2].card = `Your insight on ${day.topic} (theme: ${day.theme}). One idea, said plainly.`; // I
  segs[3].card = `Your proof. A real number/result YOU own about ${day.topic}. None? One specific true story.`; // P
  segs[4].card = `The ask. One next step for the viewer (align to: ${angle.split('—')[0].trim()}).`;            // A
  return {
    brand, day: day.day, date: day.date, theme: day.theme, format: day.format,
    topic: day.topic, totalSeconds: 90, segments: segs,
    checklist: [
      'Phone at eye level, LANDSCAPE lens but 9:16 framing — you centered',
      'Light on your face (window in front, never behind)',
      'Mic check: 3 words, play it back',
      'WALK — motion is the format; static = a different video',
      'Energy on the hook: start mid-stride, already talking',
    ],
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The prompter page — big cue cards, enforced segment bar, auto-advance, overrun in red. */
export function html(session) {
  const segsJson = JSON.stringify(session.segments.map(s => ({ key: s.key, name: s.name, start: s.start, end: s.end, card: s.card, cue: s.cue })));
  return `<!doctype html><html><head><meta charset="utf-8"><title>W&T · ${esc(session.brand)} d${session.day}</title><style>
  body{margin:0;background:#05070a;color:#e5e7eb;font-family:ui-sans-serif,system-ui;overflow:hidden}
  header{padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:14px;align-items:baseline}
  .brand{color:#5eead4;font-weight:700;letter-spacing:1px}
  .meta{color:#94a3b8;font-size:12px}
  #bar{display:flex;height:10px;margin:0 20px;border-radius:5px;overflow:hidden}
  #bar div{position:relative}
  #bar .fill{position:absolute;inset:0;width:0%;background:#5eead4;opacity:.85}
  #stage{display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100vh - 170px);padding:0 8vw;text-align:center}
  #segname{font-family:ui-monospace,monospace;letter-spacing:3px;color:#5eead4;font-size:16px}
  #card{font-size:5.2vh;font-weight:800;line-height:1.25;margin:18px 0}
  #cue{color:#94a3b8;font-size:2.2vh;max-width:60ch}
  #clock{position:fixed;top:14px;right:20px;font-family:ui-monospace,monospace;font-size:26px}
  #clock.over{color:#f87171;animation:blink 1s steps(2) infinite}
  @keyframes blink{50%{opacity:.3}}
  #controls{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);color:#6b7280;font-size:12px;font-family:ui-monospace,monospace}
  #check{position:fixed;left:16px;bottom:40px;font-size:11.5px;color:#94a3b8;max-width:300px}
  #check li{margin-bottom:4px}
  .mirror{transform:scaleX(-1)}
  </style></head><body>
  <header><span class="brand">W&T PROMPTER</span><span class="meta">${esc(session.brand)} · day ${session.day} (${esc(session.date)}) · ${esc(session.theme)} · ${esc(session.topic)}</span></header>
  <div id="bar"></div>
  <div id="stage"><div id="segname"></div><div id="card"></div><div id="cue"></div></div>
  <div id="clock">0.0s / 90s</div>
  <ul id="check">${session.checklist.map(c => `<li>☐ ${esc(c)}</li>`).join('')}</ul>
  <div id="controls">SPACE start/pause · R reset · M mirror · the skeleton is the law: H 0–3 · P 3–15 · I 15–40 · P 40–70 · A 70–90</div>
  <script>
  const SEGS=${segsJson};const TOTAL=90;
  const bar=document.getElementById('bar');
  SEGS.forEach(s=>{const d=document.createElement('div');d.style.flex=String(s.end-s.start);d.style.background='rgba(94,234,212,'+(0.10+0.04*SEGS.indexOf(s))+')';d.innerHTML='<div class="fill"></div>';bar.appendChild(d);});
  let t=0,run=false,last=null,mirror=false;
  function seg(t){return SEGS.find(s=>t>=s.start&&t<s.end)||SEGS[SEGS.length-1];}
  function render(){
    const s=seg(Math.min(t,TOTAL-0.001));
    document.getElementById('segname').textContent=s.key+' · '+s.name.toUpperCase()+' · '+s.start+'–'+s.end+'s';
    document.getElementById('card').textContent=s.card;
    document.getElementById('cue').textContent=s.cue;
    const clock=document.getElementById('clock');
    clock.textContent=t.toFixed(1)+'s / '+TOTAL+'s';
    clock.className=t>TOTAL?'over':'';
    SEGS.forEach((sg,i)=>{const fill=bar.children[i].querySelector('.fill');
      const p=t<=sg.start?0:t>=sg.end?100:100*(t-sg.start)/(sg.end-sg.start);fill.style.width=p+'%';});
  }
  function tick(now){if(!run)return;if(last!=null)t+=(now-last)/1000;last=now;render();requestAnimationFrame(tick);}
  addEventListener('keydown',e=>{
    if(e.code==='Space'){e.preventDefault();run=!run;last=null;if(run)requestAnimationFrame(tick);}
    if(e.key==='r'||e.key==='R'){t=0;run=false;render();}
    if(e.key==='m'||e.key==='M'){mirror=!mirror;document.getElementById('stage').className=mirror?'mirror':'';}
  });
  render();
  </script></body></html>`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
export function makeServer(session) {
  return createServer((req, res) => {
    if (req.url === '/api/session') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(session)); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html(session));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (f, d) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; };
  const brand = arg('--brand', null);
  const profile = arg('--profile', 'company');
  const dayN = Number(arg('--day', 0));
  const topic = arg('--topic', null);
  const port = Number(arg('--port', 8790));
  if (!brand) { console.error('usage: node teleprompter.mjs --brand <slug> [--day N | --topic "..." --hook "..."] [--port 8790]'); process.exit(2); }
  const { angle } = brandIdentity(brand);                                     // uniqueness law upstream
  let day;
  if (topic) {
    day = { day: 0, date: 'ad-hoc', theme: 'ad-hoc', format: 'manual', topic, hook: arg('--hook', `Here's what everyone gets wrong about ${topic}.`), company_angle: angle };
  } else {
    const cal = latestCalendar(brand, profile);
    if (!cal) { console.error(`no calendar for ${brand}/${profile} — run: node calendar.mjs --brand ${brand} --profile ${profile}`); process.exit(1); }
    day = cal.days.find(d => d.day === (dayN || 1));
    if (!day) { console.error(`day ${dayN} not in the calendar (1–30)`); process.exit(1); }
  }
  const session = buildSession({ brand, angle, day });
  makeServer(session).listen(port, () => {
    console.log(`W&T prompter → http://localhost:${port}  ·  ${brand} d${session.day} · "${session.topic}"`);
    console.log('The skeleton is the law: H 0–3 · P 3–15 · I 15–40 · P 40–70 · A 70–90. SPACE to start.');
  });
}
