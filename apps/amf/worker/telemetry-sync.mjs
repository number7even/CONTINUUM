/**
 * telemetry-sync.mjs — Seam ② (Wave 2 return path): Crooma/PodGeni Creative Genome engagement
 * telemetry → CONTINUUM ground_truth. The measured-outcome half of the learning loop.
 *
 * feedback-sync.mjs learns from a HUMAN DECISION (approve/reject). This learns from a MEASURED
 * OUTCOME: once PodGeni knows which asset/style actually drove engagement, it writes that back as a
 * `ground_truth` Observation carrying `refs:[decisionId, signalId]` — closing the loop from the
 * origin news article → the sealed decision → what the audience actually did. content-matcher's
 * `feedbackWeight()` already reads co-located `ground_truth` and re-weights the 6-D ranker, so
 * tomorrow's drafts lean toward the styles/topics that performed. Same corpus slot as XENOS HITL;
 * a different `sourceId` (`podgeni`), so the two feedback sources compose instead of colliding.
 *
 * Reward is a TRANSPARENT HEURISTIC (contracts.engagementReward) mapped into the SAME 0.2..1.0 band
 * as HITL_REWARD — NOT a tuned model (P4, no false precision). Idempotent (stable id per event) →
 * safe to re-run / schedule. Privacy-scrubbed on write (upsertObservation deep-scrubs, §8).
 *
 *   node telemetry-sync.mjs --project ground-truth [--since 2026-07-01T00:00:00Z]
 *   node telemetry-sync.mjs --smoke
 *
 * Gated on PODGENI_TELEMETRY_URL + PODGENI_TELEMETRY_KEY (a scoped key, P1). Fail-safe: no key →
 * the loop is wired and proven our-side, but writes nothing live until the partner half lands.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import './env.mjs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TELEMETRY_SOURCE_ID, engagementReward } from './contracts.mjs'; // canonical shape lives in the contract anchor

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export { TELEMETRY_SOURCE_ID, engagementReward }; // re-export for importers (API-stable)
const stableId = (seed) => { const h = createHash('sha256').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };

/**
 * Pure: a PodGeni Creative Genome telemetry event → a CONTINUUM ground_truth Observation (testable).
 * `reward` may be null (no measurable engagement); ingestTelemetry skips those — nothing to learn.
 * @param {import('./contracts.mjs').GenomeTelemetry} t
 */
export function mapTelemetry(t) {
  const reward = engagementReward(t);
  // content carries the TERMS feedbackWeight matches candidate signals against — so a style that
  // performed on a topic nudges future signals about that same topic. Summary first, then style/product.
  const content = [t.summary, t.style && `style:${t.style}`, t.product, t.asset_id]
    .filter(Boolean).join(' — ') || `genome engagement on ${t.asset_id || 'asset'}`;
  const refs = [t.decisionId, t.signalId].filter(Boolean); // the loop: back to the seal + the origin signal
  return {
    id: stableId('podgeni-telemetry:' + (t.id || t.asset_id || content)),
    sourceId: TELEMETRY_SOURCE_ID,
    type: 'ground_truth',
    content,
    timestamp: t.measured_at || new Date().toISOString(),
    refs,
    metadata: {
      provider: TELEMETRY_SOURCE_ID, reward, style: t.style,
      product: String(t.product || '').toLowerCase() || undefined,
      asset_id: t.asset_id, impressions: t.impressions, engagements: t.engagements,
      conversions: t.conversions, tenant_id: t.tenant_id, origin: 'wave2',
    },
  };
}

export async function fetchTelemetry({ since, tenant = process.env.AMF_XENOS_TENANT, limit = 40 } = {}) {
  const base = process.env.PODGENI_TELEMETRY_URL, key = process.env.PODGENI_TELEMETRY_KEY;
  if (!base || !key) return { gated: true, events: [] };
  const qs = new URLSearchParams({ limit: String(limit) });
  if (tenant) qs.set('tenant_id', tenant);          // one workspace = one brain (intake contract §6)
  if (since) qs.set('since', since);
  const res = await fetch(`${base.replace(/\/$/, '')}/api/genome/engagement?${qs}`, { headers: { 'x-telemetry-key': key } });
  if (!res.ok) throw new Error(`PodGeni HTTP ${res.status}`);
  const j = await res.json();
  return { gated: false, events: Array.isArray(j) ? j : (j.events || j.telemetry || j.items || []) };
}

/** Ingest telemetry → ground_truth in a CONTINUUM project. Idempotent. Skips unmeasurable events. */
export function ingestTelemetry(storage, events) {
  storage.upsertSource(TELEMETRY_SOURCE_ID, 'docs', { adapter: 'telemetry-sync' });
  let written = 0, skipped = 0;
  for (const e of events) {
    const obs = mapTelemetry(e);
    if (obs.metadata.reward == null) { skipped += 1; continue; } // no measurable engagement → nothing to learn
    if (storage.upsertObservation(obs)) written += 1;            // null = privacy-scrubbed out
  }
  return { written, skipped };
}

async function run() {
  const a = process.argv, get = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const project = get('--project', 'ground-truth');
  let res; try { res = await fetchTelemetry({ since: get('--since'), tenant: get('--tenant') }); } catch (e) { console.error(`[wave2] ${e.message}`); process.exit(1); }
  if (res.gated) { console.error('[wave2] PODGENI_TELEMETRY_URL/KEY not set — engagement sync gated (P6). Wired + ready to strike.'); process.exit(0); }
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const storage = openStorage(project);
  const { written, skipped } = ingestTelemetry(storage, res.events);
  console.error(`[wave2] ${written}/${res.events.length} PodGeni telemetry → ground_truth in "${project}" (${skipped} unmeasurable)`);
  storage.close(); process.exit(0);
}

async function smoke() {
  process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'wave2-'));
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const { rankSignals } = await import(resolve(dirname(fileURLToPath(import.meta.url)), 'content-matcher.mjs'));
  const s = openStorage('wave2-test');

  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.error(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

  // ── the reward heuristic: a normalized score, a raw rate, and a conversion each map into the band ──
  const byScore = mapTelemetry({ id: 'e-score', score: 1.0, summary: 'x', product: 'voicecosmos' });
  const byRate = mapTelemetry({ id: 'e-rate', impressions: 1000, engagements: 80, summary: 'x' }); // 0.08 rate = target → 1.0
  const byConv = mapTelemetry({ id: 'e-conv', impressions: 100000, engagements: 1, conversions: 3, summary: 'x' });
  const unmeasured = mapTelemetry({ id: 'e-none', summary: 'nothing measured here' });
  check('a normalized score maps into the 0.2..1.0 band', byScore.metadata.reward === 1.0, `reward=${byScore.metadata.reward}`);
  check('engagements/impressions at target rate → full reward', Math.abs(byRate.metadata.reward - 1.0) < 1e-9, `reward=${byRate.metadata.reward}`);
  check('a conversion pins to the top of the band (even at low rate)', byConv.metadata.reward === 1.0, `reward=${byConv.metadata.reward}`);
  check('no measurable engagement → reward null (nothing to learn)', unmeasured.metadata.reward === null);

  // ── the loop is closed: refs walk back to the seal + the origin signal ──
  const DECISION_ID = 'dddddddd-0000-0000-0000-000000000000';
  const SIGNAL_ID = 'ssssssss-0000-0000-0000-000000000000';
  const winner = { id: 'genome-win-1', decisionId: DECISION_ID, signalId: SIGNAL_ID, impressions: 5000, engagements: 600, conversions: 4,
    summary: 'after-hours bookings recovered by the voice concierge', style: 'testimonial', product: 'voicecosmos', measured_at: '2026-07-29T12:00:00Z' };
  const mapped = mapTelemetry(winner);
  check('the ground_truth carries refs:[decisionId, signalId] (loop back to origin)', mapped.refs[0] === DECISION_ID && mapped.refs[1] === SIGNAL_ID, mapped.refs.join(','));
  check('a high-performing asset earns a high reward', mapped.metadata.reward >= 0.9, `reward=${mapped.metadata.reward}`);

  // ── THE FULL LOOP · seed a candidate signal, rank baseline, ingest telemetry, rank again ──
  const nowMs = Date.parse('2026-07-30T12:00:00Z');
  const CAND_ID = 'cccccccc-0000-0000-0000-000000000000';
  s.upsertSource('googlenews', 'docs', {});
  s.upsertObservation({ id: CAND_ID, sourceId: 'googlenews', type: 'feed_article',
    content: 'Hotels lose after-hours bookings to voicemail; a voice concierge recovers the guest.',
    timestamp: '2026-07-30T09:00:00Z', refs: [], metadata: { sources: ['https://skift.com/after-hours'] } });
  const product = { slug: 'voicecosmos', feeds: [], sales_signals: [], filters: { must: [], not: [] } };
  const pillarTerms = ['bookings', 'concierge', 'hotels', 'voice'];

  const baseline = rankSignals(s, pillarTerms, product, nowMs, 5);
  const base = baseline.find((r) => r.id === CAND_ID);
  check('baseline: the candidate ranks with a neutral feedback weight (fb=1)', !!base && Math.abs(base.fb - 1) < 1e-9, `fb=${base?.fb}`);

  const { written, skipped } = ingestTelemetry(s, [winner, unmeasured]); // one measurable winner + one to skip
  check('ingest writes the measurable event and skips the unmeasurable one', written === 1 && skipped === 1, `written=${written} skipped=${skipped}`);

  const learned = rankSignals(s, pillarTerms, product, nowMs, 5);
  const after = learned.find((r) => r.id === CAND_ID);
  check('THE LOOP CLOSES: positive telemetry lifts the same signal\'s rank (fb>1, bounded ≤1.3)',
    !!after && after.fb > 1 && after.fb <= 1.3 && after.score > base.score, `fb ${base?.fb}→${after?.fb}, score ${base?.score.toFixed(3)}→${after?.score.toFixed(3)}`);

  // ── idempotent: re-ingest is an UPSERT (stable id) → no duplicate row, reward unchanged ──
  const rewardBefore = s.getObservations([mapped.id])[0]?.metadata?.reward;
  ingestTelemetry(s, [winner]); // re-ingest the same event
  const gtRows = s.searchObservations('bookings OR concierge OR voice', 40).filter((h) => h.type === 'ground_truth');
  const rewardAfter = s.getObservations([mapped.id])[0]?.metadata?.reward;
  check('idempotent: re-ingest adds no duplicate row; the ranker sees exactly one, reward stable',
    gtRows.length === 1 && rewardAfter === rewardBefore, `rows=${gtRows.length} reward ${rewardBefore}→${rewardAfter}`);

  const ok = results.every(Boolean);
  console.error(`\ntelemetry-sync smoke — Seam ② Wave 2 (PodGeni engagement telemetry → ground_truth → 6-D ranker)`);
  console.error(`  ${ok ? '✅ PASS' : '❌ FAIL'} — measured outcomes map to bounded rewards, close the loop via refs, and demonstrably re-weight the ranker; idempotent; gated live-fetch (P4)\n`);
  s.close(); const dir = process.env.CONTINUUM_DATA_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--smoke')) smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
  else run().catch((e) => { console.error(e.message); process.exit(1); });
}
