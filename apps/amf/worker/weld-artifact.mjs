#!/usr/bin/env node
/**
 * weld-artifact.mjs — bind a produced AMF artifact into the Truth Ledger (the D2 weld).
 *
 * Takes a produced MP4 + its review-queue brief and runs the truth round:
 *   A — the AMF producer's persistent executor key CLAIMS the artifact, with
 *       verifyCommand = verify-artifact.mjs pinned to the file's SHA-256 (exact bytes);
 *   V — the REAL independent validator (local llama3.2, zero-egress) reviews the brief +
 *       stub honesty for scope / privacy / brand, signs confirm|dispute (abstains on failure);
 *   T — on confirm, the mechanical check runs and its signed exit code is welded;
 *   H — the task parks at PENDING_HUMAN on the board: YOUR attest is the only way to DONE.
 *
 *   node weld-artifact.mjs <file.mp4> --brief <brief.json> [--project graph-demo]
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage, generateIdentity, signEntry, todoTaskRef } from '@number7even/continuum-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');

const file = process.argv[2];
const bi = process.argv.indexOf('--brief');
const pi = process.argv.indexOf('--project');
const briefPath = bi > 0 ? process.argv[bi + 1] : null;
const project = pi > 0 ? process.argv[pi + 1] : (process.env.CONTINUUM_PROJECT_ID || 'graph-demo');
if (!file || !existsSync(file) || !briefPath || !existsSync(briefPath)) {
  console.error('usage: node weld-artifact.mjs <file.mp4> --brief <brief.json> [--project <id>]');
  process.exit(2);
}

/** The AMF producer's persistent executor key (A) — distinct from V / T / H by construction. */
function producerKey() {
  const path = join(process.env.CONTINUUM_DATA_DIR || join(homedir(), '.continuum'), '.amf-producer-key.json');
  if (existsSync(path)) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { /* regenerate */ } }
  const kp = generateIdentity('executor', 'amf-producer');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(kp), { mode: 0o600 });
  return kp;
}

const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
const storage = await openStorage(project);
const A = producerKey();
storage.registerIdentity({ keyId: A.keyId, role: A.role, publicKey: A.publicKey });

// One task per artifact (idempotent by brief id in refs[]).
const extRef = `amf-artifact:${brief.id}`;
let todo = storage.listTodos().find(t => (t.refs ?? []).includes(extRef));
if (!todo) todo = storage.createTodo({ title: `AMF artifact — ${brief.headline ?? brief.id}`, status: 'in_progress', refs: [extRef] });
const taskRef = todoTaskRef(todo.id);

// A — the claim, pinned to the exact bytes.
const verifyCommand = `node "${join(HERE, 'verify-artifact.mjs')}" "${resolve(file)}" --sha ${sha}`;
storage.submitLedgerEntry(taskRef, signEntry({
  kind: 'claim', taskRef, at: new Date().toISOString(), by: A.keyId, role: 'executor',
  payload: {
    statement: `AMF produced a 9:16 short for ${brief.brand ?? brief.slug}: "${brief.headline}" (brief ${brief.id}, drafted=${brief.drafted ?? '?'})`,
    verifyCommand,
    artifact: { path: resolve(file), sha256: sha },
  },
}, A));
console.log(`A  claim welded — todo ${todo.id.slice(0, 8)} · sha ${sha.slice(0, 12)}…`);

// V — the real linesman (llama3.2, zero-egress). Context = the brief + honesty markers.
const { runValidator } = await import(resolve(REPO, 'scripts', 'validator-v.mjs'));
const context = [
  `BRAND: ${brief.brand ?? brief.slug}`,
  `HEADLINE: ${brief.headline}`,
  `ANGLE: ${brief.angle ?? ''}`,
  `POINTS: ${(brief.points ?? []).map(p => `${p.stat} ${p.label}`).join(' | ')}`,
  `CTA: ${brief.cta ?? ''}`,
  'HONESTY: voice + b-roll are declared stubs; captions are real glyphs from this brief; no likeness served (rights wall declined → synthetic).',
].join('\n');
const v = await runValidator({ storage, todoId: todo.id, context });
if (v.ok) console.log(`V  ${v.judgment.verdict} — "${v.judgment.reasoning}"`);
else console.log(`V  ABSTAINED — ${v.why} (task stays UNVERIFIED; re-run when the model is up)`);

const verdict = storage.verdictForTask(taskRef);
console.log(`T  ${v.ok && v.judgment.verdict === 'confirm' ? 'mechanical check welded (see verdict)' : 'not run (no confirm)'}`);
console.log(`\nledger verdict: ${verdict}`);
console.log(verdict === 'PENDING_HUMAN'
  ? `H  your leap: the card is on the board (project ${project}) — click ⚖ Attest to mint the first PROVEN AMF artifact.`
  : `H  not yet reachable — resolve the verdict above first.`);
