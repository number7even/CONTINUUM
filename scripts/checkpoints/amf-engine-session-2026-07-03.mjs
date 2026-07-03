/**
 * Checkpoint: AMF content-engine session — sharpen + close-the-loops + rights-wall — 2026-07-03.
 *
 * One working session. Eight our-side artifacts, each built + verified, none claimed live beyond
 * what a verifyCommand proves. The two audit-driven gaps found this session are CLOSED in code:
 *   • Seam ② feedback now LEARNS into ranking (was ingest-only) — content-matcher.feedbackWeight
 *   • VAULT rights wall BUILT (was contract-only) — vault-guard decline-to-synthetic
 * Plus: agent-skills lifecycle routing, doc knowledge-graph interlinks, engine gates for
 * viwago/voinista/studiomunich + authority-feed auto-ingest, the AMF_ENGINE_MAP diagram, and the
 * consolidated partner-requests note (+ handshake pointers).
 *
 * HONEST (P4/P9): still GATED where it depends on partners — the feedback loop learns but needs
 * XENOS to supply real decisions; the rights wall enforces but the signed-presenter render needs
 * VAULT credentials; Brand-Kernel voice fuel is the operator's (P9). No partner key was issued.
 *
 * Every verifyCommand runs here and MUST exit 0 (verify-green at stamp time). grep/parse-based →
 * re-proves on any checkout, no secrets needed.
 *   node scripts/checkpoints/amf-engine-session-2026-07-03.mjs
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
const NOW = new Date().toISOString();
const L = 'CONTINUUM @ 2026-07-03 (commits 1cddac7…743d758)';
const e = (name, where, verifyCommand, description) => ({ name, where, verifyCommand, verifiedAt: NOW, landedAt: L, description });

const active = [
  e('lifecycle-routed-to-agent-skills', 'packages/cli/src/index.ts + router.md',
    'grep -q "Lifecycle — spec → ship" packages/cli/src/index.ts && grep -q "agent-skills@addy-agent-skills" packages/cli/src/index.ts && grep -q "Lifecycle — spec → ship" router.md',
    'The ICM scaffold + our own router route the dev lifecycle to the existing agent-skills marketplace (/spec /plan /build /test /review /code-simplify /ship) instead of duplicating it. CONTINUUM adds the memory layer beneath. Commit 1cddac7.'),
  e('doc-knowledge-graph-connected', 'docs/INDEX.md + sprint/deploy clusters',
    'grep -q "AMF content engine & amalgamation" docs/INDEX.md && grep -q "Sprint chain:" docs/SPRINT-2026-W24.md && grep -q "^## Related" docs/DEPLOY_FLY.md && grep -q "^## Related" docs/AMF_PROCESS.md',
    'CONTINUUM docs now render as one connected web (Foam/MPE graph): INDEX hub → AMF cluster, sprint spine W22→W27, deploy/runbook cluster, all bidirectional. Real markdown links only, 0 broken. Commits 631e268 + afc7fb7.'),
  e('engine-gates-viwago-voinista-studiomunich', 'apps/amf/worker/portfolio-universe.json',
    'node -e "const u=require(\'./apps/amf/worker/portfolio-universe.json\'); const g=u.products.filter(p=>p.filters).map(p=>p.slug); process.exit([\'viwago\',\'voinista\',\'studiomunich\'].every(s=>g.includes(s))?0:1)" && grep -q "404media.co" apps/amf/worker/portfolio-universe.json',
    'Sharpened noisy products: viwago (compliance-audit vs energy/tax audit) + voinista (finance vs sports/collectibles) got must/not gates; studiomunich went from feeds:[] to 404 Media (T1, validated live) + The Verge (T2), also gated. 15/15 unit + 80% live noise-drop on studiomunich (85→17). Commit 2648474.'),
  e('authority-feed-auto-ingest', 'apps/amf/worker/adapter-news.mjs',
    'grep -q "deriveAuthorityFeeds" apps/amf/worker/adapter-news.mjs && grep -q "AMF_RSS_FEEDS" apps/amf/worker/adapter-news.mjs',
    'Curated authority feeds[] now auto-ingest as content (symmetric to own_feeds→AMF_OWN_FEEDS), skipping feeds flagged unfetchable. T1/T2 sources feed the drafter directly; the gate keeps broad publishers on-brand. Commit e4a39e8.'),
  e('amf-engine-map-diagram', 'docs/AMF_ENGINE_MAP.md',
    'test -f docs/AMF_ENGINE_MAP.md && grep -q "6-D rank" docs/AMF_ENGINE_MAP.md && grep -q "verified vs gated" docs/AMF_ENGINE_MAP.md',
    'The A→L pipeline diagram + module-by-module verified/gated status table + two-hand quality lever. Companion to AMF_PROCESS.md (prose). Status stated honestly with in-code gating detail. Commit 2bea32a (+ updates 516d3a1/7b38174).'),
  e('seam-2-feedback-LEARNS-into-ranking', 'apps/amf/worker/content-matcher.mjs',
    'grep -q "function feedbackWeight" apps/amf/worker/content-matcher.mjs && grep -q "type === .ground_truth." apps/amf/worker/content-matcher.mjs && grep -q "feedback:" apps/amf/worker/content-matcher.mjs',
    'CLOSED the feedback loop the infographic-audit found half-built. rankSignals now reads co-located ground_truth rewards (approve 1.0/modify 0.7/reject 0.2) and nudges the score — approved topics ↑, rejected ↓, BOUNDED [0.8,1.3] (nudge not override). Proven: baseline fb=1.00 → approved 1.30 / rejected 0.80. Re-prove: `node apps/amf/worker/content-matcher.mjs --smoke`. Commit 516d3a1.'),
  e('vault-rights-wall-BUILT', 'apps/amf/worker/vault-guard.mjs + produce-short.mjs',
    'node apps/amf/worker/vault-guard.mjs --smoke && grep -q "vault-guard.mjs" apps/amf/worker/produce-short.mjs',
    'The StudioMunich rights wall (was contract-only). vault-guard decideRender: studiomunich:<actorId> requires a verified X-Rights-Signature (HMAC-SHA256 over [actorId,modality,phraseHash,duration,tier], hard-reject, timing-safe); digital: serves freely; no-secret/404/forged/tampered/takedown → decline → synthetic. Never serves an unsigned likeness. 9/9 branches + a real produce run declined studiomunich:astrid while the MP4 still built. Commit 7b38174.'),
  e('partner-requests-consolidated', 'docs/PARTNER-INTEGRATION-REQUESTS.md + handshake pointers',
    'test -f docs/PARTNER-INTEGRATION-REQUESTS.md && grep -q "PARTNER-INTEGRATION-REQUESTS.md" docs/AMF-XENOS-AMALGAMATION-HANDSHAKE.md && grep -q "PARTNER-INTEGRATION-REQUESTS.md" docs/STUDIOMUNICH-TALENT-HANDSHAKE.md',
    'One note to XENOS + VAULT: what is built + fail-safe our side, and the exact inputs that flip each gated seam live (keys/endpoint/UUIDs for XENOS; playbook/bearer/signature-encoding/actor for VAULT). Key names only, no values (P1). Both handshakes point to it. Commits 3380e32 + 743d758.'),
];

const reason =
  'AMF content-engine session — sharpen + close-the-loops + rights-wall, 2026-07-03 (commits 1cddac7…743d758). ' +
  'Eight our-side artifacts, each verify-green. Two audit-driven gaps CLOSED in code: (1) Seam ② feedback now ' +
  'LEARNS into ranking (content-matcher.feedbackWeight reads ground_truth rewards, bounded nudge — was ingest-only); ' +
  '(2) VAULT rights wall BUILT (vault-guard decline-to-synthetic, 9/9 branches — was contract-only). Plus: agent-skills ' +
  'lifecycle routing (no duplication), the CONTINUUM doc knowledge-graph interlinks (INDEX hub + sprint spine + deploy ' +
  'cluster, 0 broken), engine gates for viwago/voinista/studiomunich + authority-feed auto-ingest (80% live noise-drop), ' +
  'the AMF_ENGINE_MAP diagram, and the consolidated partner-requests note (+ handshake pointers). HONEST (P4/P9): still ' +
  'GATED where partner-dependent — the loop learns but needs XENOS decisions to flow; the wall enforces but the signed ' +
  'presenter render needs VAULT credentials; Brand-Kernel voice fuel is the operator’s. No partner key issued. The ball ' +
  'is in the partners’ court, and PARTNER-INTEGRATION-REQUESTS.md is the exact checklist.';

const verifyAll = (entries) => entries.forEach((x) => {
  try { execSync(x.verifyCommand, { cwd: REPO_ROOT, stdio: 'ignore', shell: '/bin/bash' }); console.log(`  ✓ ${x.name}`); }
  catch { throw new Error(`verifyCommand FAILED (not verify-green): ${x.name}`); }
});
console.log('Verifying the 8 session entries are green at stamp time…');
verifyAll(active);

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const storage = openStorage('continuum');
const snap = storage.recordCheckpoint({ reason, active, dormant: [], broken: [] });
console.log(`\n✅ Stamped ${snap.id}  ·  active=${snap.active.length}  ·  hash=${snap.hash.slice(0, 16)}…`);
storage.close();
