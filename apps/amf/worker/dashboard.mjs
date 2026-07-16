/**
 * dashboard.mjs — the minimal AMF operator review surface (Do-Now #5). Zero deps, local.
 *
 * Reads out/review-queue/{pending,approved,rejected}/*.json (the queue the dogfood fills)
 * and renders the three operator states — pending · preview · approve — with the HONEST
 * odometer at the TOP: this run's counts (ingested/matched/drafted/routed) + every gate,
 * so the system's true state is never hidden. Ends "CLI archaeology": a stakeholder sees
 * what the engine produced and approves with a click. Approve/Reject reuse review.mjs (the
 * single source of truth for the state transition — no duplicated queue logic).
 *
 *   node dashboard.mjs   →  http://localhost:8787
 *   env: AMF_DASHBOARD_PORT · AMF_REVIEW_DIR
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import './env.mjs';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capabilityReport } from './odometer.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUEUE = process.env.AMF_REVIEW_DIR || resolve(HERE, 'out', 'review-queue');
const RUN_FILE = join(dirname(QUEUE), 'odometer-last.json');
const STATES = ['pending', 'approved', 'rejected'];

function readState(s) {
  const d = join(QUEUE, s);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => {
    try {
      const j = JSON.parse(readFileSync(join(d, f), 'utf8'));
      return { id: j.id || f.replace(/\.json$/, ''), headline: j.headline || j.title || '(untitled)', cta: j.cta, drafted: j.drafted, angle: j.angle, points: j.points || [] };
    } catch { return { id: f, headline: '(unreadable)', error: true }; }
  });
}
function lastRun() { try { return JSON.parse(readFileSync(RUN_FILE, 'utf8')); } catch { return null; } }

/** The full data the dashboard renders — the three states + last run + gates. */
export function snapshot() {
  const queue = {};
  for (const s of STATES) queue[s] = readState(s);
  return { queue, run: lastRun(), capability: capabilityReport() };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function html(snap) {
  const run = snap.run, cap = snap.capability;
  const runLine = run
    ? `ingested ${run.ingested ?? '?'} · matched ${run.matchedKept ?? '?'} · drafted ${run.drafted ?? '?'}${run.draftMode ? ` (${run.draftMode})` : ''} · routed ${run.routed ?? '?'}`
    : 'no run yet — run make dogfood-voicecosmos';
  const gated = cap.capabilities.filter((c) => !c.live).map((c) => c.name).join(' · ') || 'all live';
  const leadWarn = cap.tenants.filled < cap.tenants.total;
  const card = (state, it) => `
    <div class="card ${it.error ? 'err' : ''}">
      <div class="hl">${esc(it.headline)}</div>
      <div class="meta">${esc(it.cta || '')}${it.drafted ? ` · <span class="tag">${esc(it.drafted)}</span>` : ''} · ${esc(it.id).slice(0, 20)}</div>
      ${it.angle ? `<div class="ang">${esc(it.angle)}</div>` : ''}
      ${(it.points || []).slice(0, 3).map((p) => `<div class="pt">• ${esc(p.stat)} ${esc(p.label)}</div>`).join('')}
      ${state === 'pending' ? `<div class="act"><button onclick="act('approve','${esc(it.id)}')">Approve</button><button class="rej" onclick="act('reject','${esc(it.id)}')">Reject</button></div>` : ''}
    </div>`;
  const col = (state) => `<div class="col"><h2>${state} <span class="n">${snap.queue[state].length}</span></h2>${snap.queue[state].map((it) => card(state, it)).join('') || '<div class="empty">—</div>'}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>AMF · Review</title><style>
    body{margin:0;background:#05070a;color:#e5e7eb;font-family:ui-sans-serif,system-ui}
    header{padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.08)}
    .odo{font-family:ui-monospace,monospace;font-size:12px;line-height:1.8;margin-top:6px}
    .odo b{color:#6ee7b7}.warn{color:#f87171}.dim{color:#9ca3af}
    .cols{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px}
    .col{background:rgba(255,255,255,.02);border-radius:10px;padding:12px}
    .col h2{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#a78bfa;margin:0 0 10px}.n{color:#6b7280;font-size:11px}
    .card{background:rgba(20,28,40,.7);border-left:3px solid #38bdf8;border-radius:8px;padding:10px;margin-bottom:8px}
    .card.err{border-color:#f87171}.hl{font-size:13px;color:#f3f4f6;line-height:1.4}
    .meta{font-size:10px;color:#6b7280;margin-top:4px}.tag{color:#6ee7b7}.ang{font-size:11px;color:#9ca3af;margin-top:4px}.pt{font-size:11px;color:#cbd5e1;margin-top:2px}
    .act{margin-top:8px;display:flex;gap:6px}button{cursor:pointer;border:1px solid rgba(110,231,183,.4);background:rgba(110,231,183,.12);color:#6ee7b7;border-radius:6px;padding:4px 10px;font-size:12px}
    button.rej{border-color:rgba(248,113,113,.4);background:rgba(248,113,113,.12);color:#f87171}.empty{color:#4b5563;font-style:italic;font-size:12px}
  </style></head><body>
    <header>
      <div style="font-size:14px;letter-spacing:1px;color:#6ee7b7">AMF · REVIEW DASHBOARD</div>
      <div class="odo">
        <div><b>last run:</b> ${esc(runLine)}</div>
        <div><b>ingest:</b> ${cap.providersLive}/${cap.providersTotal} providers live &nbsp; <b>gated:</b> <span class="dim">${esc(gated)}</span></div>
        <div><b>lead routing:</b> <span class="${leadWarn ? 'warn' : ''}">${cap.tenants.filled}/${cap.tenants.total} owner UUIDs${leadWarn ? ' — leads VANISH silently' : ''}</span></div>
      </div>
    </header>
    <div class="cols">${col('pending')}${col('approved')}${col('rejected')}</div>
    <script>async function act(k,id){await fetch('/api/'+k+'?id='+encodeURIComponent(id),{method:'POST'});location.reload();}</script>
  </body></html>`;
}

export const dashboardServer = createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && u.pathname === '/api/queue') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot())); return; }
  if (req.method === 'POST' && (u.pathname === '/api/approve' || u.pathname === '/api/reject')) {
    const id = u.searchParams.get('id');
    const flag = u.pathname === '/api/approve' ? '--approve' : '--reject';
    const args = flag === '--approve' ? [resolve(HERE, 'review.mjs'), flag, id, '--publish'] : [resolve(HERE, 'review.mjs'), flag, id];
    const r = id ? spawnSync('node', args, { encoding: 'utf8' }) : { status: 1 };
    res.writeHead(r.status === 0 ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: r.status === 0, out: (r.stdout || '').slice(-200) }));
    return;
  }
  if (req.method === 'GET' && u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html(snapshot())); return; }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.AMF_DASHBOARD_PORT || 8787);
  dashboardServer.listen(PORT, () => console.log(`AMF review dashboard → http://localhost:${PORT}  (pending · preview · approve · the honest odometer)`));
}
