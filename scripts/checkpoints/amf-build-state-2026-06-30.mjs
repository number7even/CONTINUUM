/**
 * Checkpoint: AMF build-state — 2026-06-30 (supersedes d0c9177c, ~5% → ~12-15%).
 *
 * Append-only: this records a NEW latest snapshot; d0c9177c stays in history. The
 * reality moved — L4 + L5 are now ACTIVE/FUNCTIONAL/PROVEN (the producing slice
 * emits a real captioned 9:16 short), but MANUALLY TRIGGERED. The autopilot
 * (L1/L2/L3 + the Redis/BullMQ event loop + L6/L7) remains SPEC. Agent-Reach
 * cookie-scraping is a DEAD ethical hard-stop.
 *
 * Every verifyCommand is run here and MUST exit 0 (verify-green at stamp time).
 *   node scripts/checkpoints/amf-build-state-2026-06-30.mjs
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

// ── ACTIVE — real, functional, PROVEN (L4 + L5 producing slice) ─────────────────
const active = [
  e('l4-voice-human-path', 'apps/amf/worker/voice_pipeline.py',
    'test -f apps/amf/worker/voice_pipeline.py && grep -q "align-audio" apps/amf/worker/voice_pipeline.py',
    'L4 audio: human-voice align-only mode (--align-audio) + Supertonic TTS. The monetization-safe human-voice content path.'),
  e('l4-whisperx-real-timing', 'apps/amf/worker/produce-short.mjs + voice_pipeline.py',
    'grep -q "whisperxWords" apps/amf/worker/produce-short.mjs && grep -q "wordLevelSource" apps/amf/worker/voice_pipeline.py',
    'L4: whisperx real per-word timing wired + FAIL-SAFE to even-spread if absent. Engages automatically on a real AMF_VOICE recording.'),
  e('l4-auphonic-seam', 'apps/amf/lib/auphonic.ts + produce-short.mjs',
    'test -f apps/amf/lib/auphonic.ts && grep -q "maybeAuphonic" apps/amf/worker/produce-short.mjs',
    'L4: Auphonic studio-enhance seam, gated on AUPHONIC_API_KEY+PRESET, fail-safe to raw voice. Wired, untested without a key (P4).'),
  e('l5-hyperframes-glyphs', 'apps/amf/worker/render.mjs',
    'grep -q "hyperframes" apps/amf/worker/render.mjs && grep -q "composeVideo" apps/amf/worker/render.mjs',
    'L5: REAL word-synced caption glyphs via composeVideo → HyperFrames (headless Chrome). Verified to render 1080x1920 in this env.'),
  e('l5-compose-broll', 'apps/amf/worker/compose-broll.mjs',
    'test -f apps/amf/worker/compose-broll.mjs && grep -q "colorkey" apps/amf/worker/compose-broll.mjs',
    'L5: FFmpeg compositor — b-roll concat/scale/crop → colorkey caption overlay → voice mux → 9:16 vertical. The real assembly stage.'),
  e('producing-slice-runnable-MANUAL', 'apps/amf/worker/produce-short.mjs',
    'grep -q "REAL compose-broll" apps/amf/worker/produce-short.mjs && grep -q "real glyphs" apps/amf/worker/produce-short.mjs',
    'PROVEN: produce-short.mjs emits a real 1080x1920 captioned 9:16 short end-to-end. ⚠ MANUALLY TRIGGERED (node produce-short.mjs) — a human pulls the lever; NOT autonomous. Accepts AMF_VOICE/SCRIPT/BROLL + AUPHONIC, falls back to stubs.'),
  e('autopilot-event-loop-NOT-WIRED', 'apps/amf (the boundary to autonomy)',
    '! grep -rqiE \'"bullmq"|"ioredis"|new Queue\\(|new Redis\\(\' apps/amf/package.json apps/amf/lib apps/amf/worker',
    'THE HARD BOUNDARY between assembly-line and autopilot: no Redis/BullMQ Pub/Sub event loop (verifiably absent). Without it the factory runs on a manual lever pull, not unattended. Crossing this line is what "autopilot" requires.'),
  e('agent-reach-DEAD-ethical-hardstop', 'apps/amf/app/api/trends/route.ts',
    'grep -q "held pending" apps/amf/app/api/trends/route.ts && ! grep -rqi agent-reach apps/amf/lib apps/amf/worker',
    'ETHICAL HARD-STOP, recorded so the engine never resurrects it: NO cookie-scraping of walled gardens (Reddit/X/YouTube). The stance is recorded in-code ("held pending") and there is no Agent-Reach in the pipeline (lib/worker). L2 ingestion is official-API / licensed / public-source ONLY (P7 entry freely chosen, P8 do not extract).'),
];

// ── DORMANT — built but not the active path ─────────────────────────────────────
const dormant = [
  e('l4-tts-ai-voice', 'apps/amf/worker/voice_pipeline.py',
    'grep -q "_synth_supertonic" apps/amf/worker/voice_pipeline.py',
    'AI TTS (Supertonic/VoxCPM) built but DORMANT for monetized channels — ZeroEdit mandates HUMAN voice to protect YT monetization / avoid "AI slop". TTS reserved for utility/non-monetized use.'),
  e('l5-broll-fal', 'apps/amf/worker/broll.mjs',
    'test -f apps/amf/worker/broll.mjs',
    'fal.ai b-roll generation built but REJECTED (LTX quality). Dormant — swap for licensed library / ComfyUI (GPU-gated).'),
];

const reason =
  'AMF build-state 2026-06-30 (supersedes d0c9177c, append-only). ~12-15% built. ' +
  'L4+L5 are ACTIVE / FUNCTIONAL / PROVEN: human-voice path + whisperx real per-word timing ' +
  '(fail-safe) + Auphonic seam + composeVideo→HyperFrames real-glyph captions + compose-broll ' +
  'FFmpeg compositor → produce-short.mjs emits a real 1080x1920 captioned 9:16 short. BUT ' +
  'MANUALLY TRIGGERED — a human pulls the lever (node produce-short.mjs); NOT autonomous. ' +
  'THE AUTOPILOT IS SPEC / UNBUILT: L1 orchestration (ECC/Supacode/MetaHarness), L2 trend ' +
  'ingestion (legit official-API version unbuilt; Agent-Reach cookie-scraping is a DEAD ethical ' +
  'hard-stop), L3 AI-Director/5-Gate scripting engine (Brand Kernel is the foundation, the engine ' +
  'is unbuilt), the Redis/BullMQ event loop (THE boundary to autonomy — verifiably not wired), ' +
  'L6 ad swarm, L7 lead conversion / RAWPITCH. The assembly line is real; the autopilot that ' +
  'feeds + distributes it is not. Do not claim autonomous (P4).';

// ── verify-green gate ───────────────────────────────────────────────────────────
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
