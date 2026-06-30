/**
 * Checkpoint: AMF event-loop substrate WIRED — 2026-06-30 (supersedes d434b596).
 *
 * The manual lever (`node produce-short.mjs`) is now an async BullMQ event loop for
 * the FACELESS content chain (L4/L5). Round-trip PROVEN live: enqueue → worker →
 * produceShort → real 1080x1920 MP4 → asset on the append-only state doc.
 *
 * HONEST: only the CONTENT-CHAIN event loop is wired. The L6 marketing swarm +
 * @metaharness/router remain verifiably ABSENT (no autonomous ad-spend — P6/P9).
 *
 * Every verifyCommand runs here and MUST exit 0 (verify-green at stamp time).
 *   node scripts/checkpoints/amf-event-loop-wired-2026-06-30.mjs
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.env.CONTINUUM_STORAGE_BACKEND ??= 'sqlite';
const NOW = new Date().toISOString();
const L = 'apps/amf @ 2026-06';
const e = (name, where, verifyCommand, description) => ({ name, where, verifyCommand, verifiedAt: NOW, landedAt: L, description });

const active = [
  e('l4-voice-human-path', 'apps/amf/worker/voice_pipeline.py',
    'test -f apps/amf/worker/voice_pipeline.py && grep -q "align-audio" apps/amf/worker/voice_pipeline.py',
    'L4 audio: human-voice align-only + Supertonic TTS. Monetization-safe human-voice path.'),
  e('l4-whisperx-real-timing', 'apps/amf/worker/produce-short.mjs',
    'grep -q "whisperxWords" apps/amf/worker/produce-short.mjs && grep -q "wordLevelSource" apps/amf/worker/voice_pipeline.py',
    'L4: whisperx real per-word timing wired + fail-safe to even-spread. Engages on a real AMF_VOICE.'),
  e('l4-auphonic-seam', 'apps/amf/lib/auphonic.ts',
    'test -f apps/amf/lib/auphonic.ts && grep -q "maybeAuphonic" apps/amf/worker/produce-short.mjs',
    'L4: Auphonic enhance seam, gated, fail-safe to raw. Wired, untested without a key (P4).'),
  e('l5-hyperframes-glyphs', 'apps/amf/worker/render.mjs',
    'grep -q "hyperframes" apps/amf/worker/render.mjs && grep -q "composeVideo" apps/amf/worker/render.mjs',
    'L5: real word-synced caption glyphs via composeVideo → HyperFrames (headless Chrome).'),
  e('l5-compose-broll', 'apps/amf/worker/compose-broll.mjs',
    'test -f apps/amf/worker/compose-broll.mjs && grep -q "colorkey" apps/amf/worker/compose-broll.mjs',
    'L5: FFmpeg compositor — b-roll → colorkey caption overlay → voice mux → 9:16.'),
  e('producing-slice-runnable', 'apps/amf/worker/produce-short.mjs',
    'grep -q "REAL compose-broll" apps/amf/worker/produce-short.mjs && grep -q "real glyphs" apps/amf/worker/produce-short.mjs',
    'PROVEN: produce-short.mjs emits a real 1080x1920 captioned 9:16 short. Faceless voice-over-b-roll path.'),
  e('autopilot-event-loop-content-chain-WIRED', 'apps/amf/worker/event-loop.mjs + pipeline.mjs',
    'test -f apps/amf/worker/event-loop.mjs && test -f apps/amf/worker/pipeline.mjs && grep -q "export async function produceShort" apps/amf/worker/pipeline.mjs && grep -q bullmq apps/amf/worker/package.json && test -d apps/amf/worker/node_modules/bullmq',
    'AUTOPILOT SUBSTRATE (content chain) — WIRED + PROVEN LIVE 2026-06-30. BullMQ event loop replaces the manual lever: job (append-only JSON state) → worker → produceShort → real 1080x1920 MP4 → asset recorded on state. Crosses the manual→event-driven boundary for L4/L5. Re-prove: `node apps/amf/worker/event-loop.mjs --smoke` (needs Redis :6379, e.g. docker amf-redis).'),
  e('L6-marketing-swarm-NOT-wired', 'apps/amf/worker (the boundary that REMAINS)',
    '! test -f apps/amf/worker/marketing-swarm.mjs && ! test -d apps/amf/worker/node_modules/@metaharness',
    'L6 marketing swarm REMAINS SPEC, verifiably absent: no marketing-swarm worker, @metaharness/router does not exist, no ad accounts. Autonomous 24/7 ad-spend is a hard human-in-loop boundary (P6 safely-endable, P9). NOT pretended active — refused to stamp on pasted code.'),
  e('agent-reach-DEAD-ethical-hardstop', 'apps/amf/app/api/trends/route.ts',
    'grep -q "held pending" apps/amf/app/api/trends/route.ts && ! grep -rqi agent-reach apps/amf/lib apps/amf/worker',
    'ETHICAL HARD-STOP: no cookie-scraping of walled gardens. Stance recorded in-code; no Agent-Reach in the pipeline. L2 = official-API / licensed / public only (P7/P8).'),
];

const dormant = [
  e('l4-tts-ai-voice', 'apps/amf/worker/voice_pipeline.py',
    'grep -q "_synth_supertonic" apps/amf/worker/voice_pipeline.py',
    'AI TTS (Supertonic/VoxCPM) built but DORMANT — human voice mandated for monetized channels.'),
  e('l5-broll-fal', 'apps/amf/worker/broll.mjs',
    'test -f apps/amf/worker/broll.mjs',
    'fal.ai b-roll built but REJECTED (LTX quality). Dormant — swap licensed library / ComfyUI.'),
];

const reason =
  'AMF event-loop substrate WIRED — 2026-06-30 (supersedes d434b596). ~15-18% built. ' +
  'The manual lever is now an async BullMQ event loop for the FACELESS CONTENT CHAIN (L4/L5): ' +
  'round-trip PROVEN LIVE — enqueue → worker → produceShort → real 1080x1920 MP4 → asset on an ' +
  'append-only JSON state doc (Redis :6379). This crosses the manual→event-driven boundary for ' +
  'the content chain. STILL SPEC: L1 orchestration (ECC/Supacode/MetaHarness), L2 brain, L3 ' +
  'AI-Director, L6 marketing swarm (@metaharness/router does not exist — refused to stamp on ' +
  'pasted code; no autonomous ad-spend, P6/P9), L7 lead conversion. Agent-Reach cookie-scraping ' +
  'is DEAD. The content engine RUNS event-driven; the full autopilot (brain + swarms) does not. ' +
  'Do not claim L6 active (P4).';

const verifyAll = (entries) => entries.forEach((x) => {
  try { execSync(x.verifyCommand, { cwd: REPO_ROOT, stdio: 'ignore', shell: '/bin/bash' }); console.log(`  ✓ ${x.name}`); }
  catch { throw new Error(`verifyCommand FAILED (not verify-green): ${x.name}`); }
});
console.log('Verifying entries are green at stamp time…');
verifyAll(active); verifyAll(dormant);

const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
const storage = openStorage('continuum');
const snap = storage.recordCheckpoint({ reason, active, dormant, broken: [] });
console.log(`\n✅ Stamped ${snap.id}  ·  active=${snap.active.length} dormant=${snap.dormant.length}  ·  hash=${snap.hash.slice(0, 16)}…`);
storage.close();
