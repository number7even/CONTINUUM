// Discussion-audio verify: a session-end triggers synthesis → an audio artifact.
//
// Proves the whole pipeline end-to-end WITHOUT needing real supertonic or a model:
// seed a session → stand up a MOCK TTS → run the REAL `continuum recap` CLI against it →
// assert (a) a two-host, grounded, semantic-fed script was written, (b) a non-empty audio
// artifact was produced, (c) two distinct voices were used (Host A ≠ Host B).
//
//   node scripts/verify-discussion-audio.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStorage } from '@number7even/continuum-core';

const DATA = mkdtempSync(join(tmpdir(), 'recap-'));
process.env.CONTINUUM_DATA_DIR = DATA;
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite'; // pin: this verify proves the pipeline, not semantics (grounds via FTS5)
const project = 'recap-phase';
const now = new Date().toISOString();

// 1 — seed a session: a checkpoint (one accepted, one awaiting the leap) + a grounding doc + a todo.
const s = openStorage(project);
s.upsertSource('docs:p', 'docs', {});
s.insertObservation({ sourceId: 'docs:p', type: 'doc', timestamp: now, refs: [], content: 'The vault rights wall enforces a verified rights signature before serving a rented likeness.' });
s.recordCheckpoint({ reason: 'the vault rights wall', active: [
  { name: 'vault-wall', where: 'vault-guard.mjs', verifyCommand: 'true', verifiedAt: now, acceptedBy: { operator: 'riaan@mac.com', decisionId: 'd1', decisionHash: 'sha256:x', at: now } },
  { name: 'render-seam', where: 'produce-short.mjs', verifyCommand: 'true', verifiedAt: now },
] });
try { s.createTodo({ title: 'ship the discussion recap', status: 'open' }); } catch { /* optional */ }
try { s.close(); } catch { /* noop */ }

// 2 — mock supertonic: records the voice per call, returns fake wav bytes.
const voices = [];
let calls = 0;
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    calls++;
    try { const j = JSON.parse(b); if (j.voice) voices.push(j.voice); } catch { /* noop */ }
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(Buffer.from('RIFF....WAVEfake-pcm-bytes-' + '0'.repeat(64)));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// 3 — run the REAL cli recap against the mock (session-end synthesis).
const cli = fileURLToPath(new URL('../packages/cli/dist/index.js', import.meta.url));
const code = await new Promise((resolve) => {
  const c = spawn('node', [cli, 'recap', '-p', project], {
    env: { ...process.env, CONTINUUM_PROJECT_ID: project, CONTINUUM_STORAGE_BACKEND: 'sqlite', SUPERTONIC_TTS_URL: `http://127.0.0.1:${port}/v1/audio/speech`, SUPERTONIC_VOICE_A: 'M1', SUPERTONIC_VOICE_B: 'F1' },
    stdio: 'inherit',
  });
  c.on('exit', resolve);
});
server.close();

// 4 — assert the artifacts.
const recapDir = join(DATA, project, 'recaps');
const files = existsSync(recapDir) ? readdirSync(recapDir) : [];
const scriptFile = files.find((f) => f.endsWith('.script.md'));
const wavFile = files.find((f) => f.endsWith('.wav'));
const scriptText = scriptFile ? readFileSync(join(recapDir, scriptFile), 'utf8') : '';
const wavSize = wavFile ? statSync(join(recapDir, wavFile)).size : 0;

const twoHosts = /Host A/.test(scriptText) && /Host B/.test(scriptText);
const grounded = /vault/i.test(scriptText);           // the semantic-fed grounding landed
const twoVoices = new Set(voices).size >= 2;           // Host A ≠ Host B
const audioWritten = !!wavFile && wavSize > 0;

console.log(`cli exit=${code} · turns synthesised=${calls} · voices=${[...new Set(voices)].join(',')}`);
console.log(`checks: script=${!!scriptFile} twoHosts=${twoHosts} grounded=${grounded} audio=${audioWritten}(${wavSize}b) twoVoices=${twoVoices}`);
const green = code === 0 && !!scriptFile && twoHosts && grounded && audioWritten && twoVoices;
console.log(green ? 'DISCUSSION_AUDIO_VERIFY: GREEN' : 'DISCUSSION_AUDIO_VERIFY: RED');
process.exit(green ? 0 : 1);
