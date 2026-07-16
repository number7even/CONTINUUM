#!/usr/bin/env node
// verify-fuel-path.mjs — proof-gate for the Fuel Path (Rank-1 + Rank-2 lacks).
//
// RANK 1 · THE VIDEO INTAKE SEAM — against a REAL generated phone-style MP4:
//   1. a landscape clip normalizes to 1080x1920 h264+aac (cover-scale + center crop)
//   2. the ORIGINAL audio survives (loudnorm only — the voice is the moat)
//   3. T-check green + sha-pinned; the brief parks in the Review Dashboard queue
//      as format=walk-and-talk · drafted=human-fuel
//   4. no-captions honesty: whisper unavailable → captions SKIPPED loudly, never fake-synced
//   5. injected word timestamps are honored (the caption payload path)
//   6. a soundless clip is REFUSED (the recording IS the voice)
//
// RANK 2 · THE UNIFIED APPROVE + H-ATTEST — hermetic ledger:
//   7. a welded artifact at PENDING_HUMAN + the operator's local key → attest → PROVEN
//   8. no human key → 'no-human-key' (loud, no fake signature)
//   9. an un-welded brief → 'not-welded' (loud)
//  10. the dashboard's approve handler carries the attest wire (one click = queue+publish+H)
//
//   node verify-fuel-path.mjs        (needs ffmpeg; no network, no LLM)
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'amf-fuel-'));
process.env.CONTINUUM_DATA_DIR = TMP;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_HUMAN_KEY_PATH = join(TMP, 'human-key.json');
process.env.AMF_INTAKE_SKIP_WELD = '1';                       // ledger half tested hermetically below

const { intake, probe, transcribeWords, normalizeFilter, GRADE } = await import('./intake.mjs');
const { attestArtifact } = await import('./attest.mjs');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

console.log('── RANK 1 · the video intake seam ──────────────────────────────────────');
// a "phone clip": landscape 1280x720, 4s, with a voice-band sine — proves crop + audio survival.
const RAW = join(TMP, 'raw-landscape.mp4');
sh(`ffmpeg -y -v error -f lavfi -i testsrc2=size=1280x720:duration=4 -f lavfi -i "sine=frequency=440:duration=4" -c:v libx264 -c:a aac -shortest "${RAW}"`);

check('pure: normalizeFilter covers + center-crops to 1080x1920', /1080:1920.*increase.*crop=1080:1920/.test(normalizeFilter(1280, 720)));
check('pure: the grade is deterministic + mild (eq + vignette, no look-change)', /eq=contrast=1\.06/.test(GRADE) && /vignette/.test(GRADE));

const receipt = await intake({ raw: RAW, brand: 'voicecosmos', title: 'FUEL-GATE test', captions: true });
const p = probe(receipt.artifact);
check('landscape raw → 1080x1920 h264', p.video?.codec_name === 'h264' && p.video.width === 1080 && p.video.height === 1920, `${p.video?.width}x${p.video?.height}`);
check('the ORIGINAL audio survived (aac, ~4s)', p.audio?.codec_name === 'aac' && Math.abs(p.duration - 4) < 0.8, `${p.duration.toFixed(1)}s`);
check('T-check green + sha-pinned in the receipt', receipt.steps.some(s => s.step === 'T-check' && s.ok) && /^[0-9a-f]{64}$/.test(receipt.sha256));
const parked = receipt.steps.find(s => s.step === 'park-review');
const brief = JSON.parse(readFileSync(parked.brief, 'utf8'));
check('parked in the Review Dashboard as human fuel', brief.format === 'walk-and-talk' && brief.drafted === 'human-fuel' && brief.status === 'pending', brief.id);
const tstep = receipt.steps.find(s => s.step === 'transcribe');
check('captions honesty: whisper missing → SKIPPED loudly (no fake sync)', tstep.ok === false ? /SKIPPED|unavailable/i.test(tstep.note) : true, tstep.ok ? `real transcription: ${tstep.words} words` : tstep.note);

const wordsFile = join(TMP, 'words.json');
writeFileSync(wordsFile, JSON.stringify([{ word: 'hello', start: 0.1, end: 0.5 }, { word: 'world', start: 0.6, end: 1.0 }]));
process.env.AMF_INTAKE_WORDS = wordsFile;
check('injected word timestamps honored', transcribeWords('ignored', TMP)?.length === 2);
delete process.env.AMF_INTAKE_WORDS;

const MUTE = join(TMP, 'mute.mp4');
sh(`ffmpeg -y -v error -f lavfi -i testsrc2=size=640x360:duration=2 -c:v libx264 -an "${MUTE}"`);
let refused = false; try { await intake({ raw: MUTE, brand: 'voicecosmos', captions: false }); } catch (e) { refused = /audio/.test(e.message); }
check('a soundless clip is REFUSED (the recording IS the voice)', refused);

console.log('── RANK 2 · the unified Approve + H-attest ─────────────────────────────');
const { openStorage, generateIdentity, signEntry, todoTaskRef } = await import('@number7even/continuum-core');
const { generateHumanKey, saveHumanKey } = await import('../../console/lib/truth-sign.mjs');
const storage = await openStorage('fuel-test');
const A = generateIdentity('executor', 'A'), V = generateIdentity('validator', 'V');
for (const k of [A, V]) storage.registerIdentity({ keyId: k.keyId, role: k.role, publicKey: k.publicKey });
const H = generateHumanKey('human'); saveHumanKey(H);
storage.registerIdentity({ keyId: H.keyId, role: 'human', publicKey: H.publicKey });
const todo = storage.createTodo({ title: 'welded fuel artifact', status: 'in_progress', refs: [`amf-artifact:${brief.id}`] });
const ref = todoTaskRef(todo.id);
const mk = (kind, kp, payload) => signEntry({ kind, taskRef: ref, at: new Date().toISOString(), by: kp.keyId, role: kp.role, payload }, kp);
storage.submitLedgerEntry(ref, mk('claim', A, { statement: 'fuel packaged', verifyCommand: 'exit 0' }));
storage.submitLedgerEntry(ref, mk('validation', V, { verdict: 'confirm', reasoning: 'packaging only; voice untouched' }));
storage.submitTest(ref, { verifyCommand: 'exit 0', exitCode: 0, outputHash: 'h' });
check('the welded artifact sits at PENDING_HUMAN', storage.verdictForTask(ref) === 'PENDING_HUMAN');

const att = await attestArtifact(brief.id, { project: 'fuel-test' });
check('one attest → PROVEN (the P9 signature minted)', att.ok === true && att.verdict === 'PROVEN', `${att.before} → ${att.verdict}`);

process.env.CONTINUUM_HUMAN_KEY_PATH = join(TMP, 'missing-key.json');
const noKey = await attestArtifact(brief.id, { project: 'fuel-test' });
check("no human key → 'no-human-key' (loud, no fake signature)", noKey.ok === false && noKey.why === 'no-human-key');
process.env.CONTINUUM_HUMAN_KEY_PATH = join(TMP, 'human-key.json');
const notWelded = await attestArtifact('never-welded-brief', { project: 'fuel-test' });
check("an un-welded brief → 'not-welded' (loud)", notWelded.ok === false && notWelded.why === 'not-welded');

const dash = readFileSync(join(HERE, 'dashboard.mjs'), 'utf8');
check('the dashboard Approve carries the wire (attestArtifact + async handler)',
  dash.includes("import('./attest.mjs')") && dash.includes('createServer(async (req, res)') && dash.includes('attest'));

// cleanup: the parked test brief + the fuel artifact (the receipts above are the proof)
rmSync(parked.brief, { force: true });
rmSync(receipt.artifact, { force: true });
rmSync(TMP, { recursive: true, force: true });

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('FUEL_PATH_VERIFY: GREEN — the doorway exists: a raw phone clip normalizes, keeps your');
  console.log('voice, T-checks, parks for review; and one Approve click now mints the P9 signature.');
  process.exit(0);
} else { console.log('FUEL_PATH_VERIFY: RED'); process.exit(1); }
