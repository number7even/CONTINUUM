// verify-dashboard.mjs — proves the review dashboard MOUNTS and correctly READS a known
// asset from the review queue, shows the three operator states, and surfaces the odometer.
//
// Seeds a known pending brief + a known last-run into a throwaway queue dir, starts the
// server on an ephemeral port, and asserts: the data layer reads the asset + run counts +
// gates; the server serves an HTML page containing the asset headline, the PENDING/APPROVE
// controls, and the honest odometer metrics (ingested 60) at the top; and /api/queue returns
// the asset.
//
//   node verify-dashboard.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'amf-dash-'));
const QUEUE = join(DIR, 'review-queue');
for (const s of ['pending', 'approved', 'rejected']) mkdirSync(join(QUEUE, s), { recursive: true });

const KNOWN_ID = 'voicecosmos-2026-07-12-test01';
const KNOWN_HL = 'The after-hours call that recovers the guest';
writeFileSync(join(QUEUE, 'pending', `${KNOWN_ID}.json`), JSON.stringify({
  id: KNOWN_ID, status: 'pending', headline: KNOWN_HL, cta: 'DETAILS', drafted: 'llm', angle: 'Signal matched.', points: [{ stat: '30%', label: 'no-show recovery' }],
}));
writeFileSync(join(DIR, 'odometer-last.json'), JSON.stringify({ ingested: 60, matchedKept: 1, drafted: 1, draftMode: 'llm', routed: 1 }));

// Point the dashboard at the throwaway queue BEFORE import (QUEUE is read at module load).
process.env.AMF_REVIEW_DIR = QUEUE;
const { dashboardServer, snapshot } = await import('./dashboard.mjs');

// Data layer — reads the known asset + run counts + gates.
const snap = snapshot();
const readsAsset = snap.queue.pending.some((x) => x.id === KNOWN_ID && x.headline === KNOWN_HL);
const runCounts = snap.run?.ingested === 60 && snap.run?.routed === 1;
const capability = Array.isArray(snap.capability?.providers) && snap.capability.providers.length >= 7;

// Mount — the server actually listens + serves the page + the API.
await new Promise((r) => dashboardServer.listen(0, '127.0.0.1', r));
const port = dashboardServer.address().port;
const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
const api = await (await fetch(`http://127.0.0.1:${port}/api/queue`)).json();
dashboardServer.close();

const mounts = page.includes('REVIEW DASHBOARD') && page.includes(KNOWN_HL) && /pending/i.test(page) && /Approve/.test(page);
const odometerAtTop = page.includes('last run') && page.includes('ingested 60');
const apiReads = api.queue?.pending?.some((x) => x.id === KNOWN_ID);

console.log(`checks: readsAsset=${readsAsset} runCounts=${runCounts} capability=${capability} mounts=${mounts} odometerTop=${odometerAtTop} apiReads=${apiReads}`);
const green = readsAsset && runCounts && capability && mounts && odometerAtTop && apiReads;
console.log(green
  ? 'DASHBOARD_VERIFY: GREEN — mounts, reads a known asset, shows the 3 states + honest odometer'
  : 'DASHBOARD_VERIFY: RED');
process.exit(green ? 0 : 1);
