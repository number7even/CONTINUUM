/**
 * validator-v.mjs — the REAL independent Validator (V): the linesman, made flesh.
 *
 * Until now V was structural — the cryptography prevented collusion, but no actual second
 * model reviewed anything. This wires a genuinely independent LLM (default: local Ollama /
 * llama3.2 — different vendor than A, different stack, ZERO-EGRESS) to review a claim for
 * scope, privacy leaks, and brand alignment, then sign a `validation` entry with V's own
 * persistent key and weld it into the Truth Ledger. On confirm, T (the mechanical referee)
 * runs the claim's verifyCommand and its signed exit code is welded in too.
 *
 * Fail-safe discipline (P4): if the model is down, times out, or returns something
 * unparseable, V ABSTAINS — no entry is signed, the task stays UNVERIFIED. V never silently
 * confirms, and never poisons a task with a fake dispute. Only a clear judgment is signed.
 *
 *   import { runValidator } from './validator-v.mjs'
 *   await runValidator({ storage, todoId })                      // real Ollama
 *   await runValidator({ storage, todoId, fetchImpl: mock })     // proof-gate injection
 *
 *   CLI:  node scripts/validator-v.mjs <todoId> [--project continuum]
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { generateIdentity, signEntry, todoTaskRef, openStorage } from '@number7even/continuum-core';

export const VALIDATOR_KEY_ID = 'validator-v';
const OLLAMA_URL = process.env.CONTINUUM_VALIDATOR_URL || 'http://localhost:11434/api/generate';
const MODEL = process.env.CONTINUUM_VALIDATOR_MODEL || 'llama3.2';

/** Load-or-create V's persistent keypair (machine-local, off-db, 0600). A DIFFERENT key
 *  than A's / the adapter's / H's — the distinct-key rule does the anti-collusion work. */
export function validatorKey() {
  const path = process.env.CONTINUUM_VALIDATOR_KEY_PATH
    || join(process.env.CONTINUUM_DATA_DIR || join(homedir(), '.continuum'), '.validator-key.json');
  if (existsSync(path)) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { /* regenerate */ } }
  const kp = generateIdentity('validator', VALIDATOR_KEY_ID);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(kp), { mode: 0o600 });
  return kp;
}

/** The linesman brief. Structured verdict demanded up front so parsing is deterministic. */
export function buildPrompt(claim, context = '') {
  return [
    'You are an independent VALIDATOR (a linesman) in a multi-signature proof system.',
    'A separate AI (the executor) claims a task is done. You do NOT trust it. Review the',
    'claim for: (1) scope — does the evidence match what is claimed, no more, no less;',
    '(2) privacy — any secrets, keys, tokens, or personal data leaked; (3) brand/impact —',
    'anything out-of-bounds or damaging. You only advise; a human decides.',
    '',
    `CLAIM: ${claim.statement ?? '(none)'}`,
    claim.verifyCommand ? `MECHANICAL TEST TO BE RUN: ${claim.verifyCommand}` : '',
    claim.commitShas?.length ? `COMMITS: ${claim.commitShas.join(', ')}` : '',
    context ? `CONTEXT:\n${context}` : '',
    '',
    'Reply with EXACTLY one line of JSON and nothing else:',
    '{"verdict":"confirm"|"dispute","reasoning":"<one or two sentences>"}',
  ].filter(Boolean).join('\n');
}

/** Parse the model's reply into a judgment, or null (→ abstain). Tolerates wrapper prose. */
export function parseVerdict(text) {
  const m = String(text ?? '').match(/\{[^{}]*"verdict"[^{}]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (j.verdict !== 'confirm' && j.verdict !== 'dispute') return null;
    return { verdict: j.verdict, reasoning: String(j.reasoning ?? '').slice(0, 500) || '(no reasoning given)' };
  } catch { return null; }
}

/**
 * Run V against a todo's latest claim. Returns
 *   { ok:true, verdict, block }        — judgment signed + welded (T runs on confirm)
 *   { ok:false, abstained:true, why }  — model unavailable/unparseable → NO entry (P4)
 */
export async function runValidator({ storage, todoId, context = '', fetchImpl = fetch, runTest = true, timeoutMs = 60_000 }) {
  const taskRef = todoTaskRef(todoId);
  const thread = storage.getTruthThread(taskRef);
  const claimEntry = thread.at(-1)?.entries.find(e => e.kind === 'claim');
  if (!claimEntry) return { ok: false, abstained: true, why: 'no claim to validate' };
  const claim = claimEntry.payload;

  // V must be a DIFFERENT key than the claimant — refuse early rather than mint an
  // INVALID block (the ledger would catch it anyway; this keeps the chain clean).
  const kp = validatorKey();
  if (claimEntry.by === kp.keyId) return { ok: false, abstained: true, why: 'validator key = claimant key (collusion)' };
  storage.registerIdentity({ keyId: kp.keyId, role: kp.role, publicKey: kp.publicKey });

  // Ask the independent model. Any failure → abstain (never silent-confirm, never fake-dispute).
  let judgment = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetchImpl(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: buildPrompt(claim, context), stream: false, options: { temperature: 0 } }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, abstained: true, why: `validator model HTTP ${r.status}` };
    judgment = parseVerdict((await r.json()).response);
  } catch (e) {
    return { ok: false, abstained: true, why: `validator model unreachable: ${e?.message ?? e}` };
  }
  if (!judgment) return { ok: false, abstained: true, why: 'unparseable model output — abstaining (P4)' };

  // Sign + weld V's judgment.
  const entry = signEntry({
    kind: 'validation', taskRef, at: new Date().toISOString(), by: kp.keyId, role: 'validator',
    payload: { verdict: judgment.verdict, reasoning: judgment.reasoning, model: MODEL, egress: 'local' },
  }, kp);
  let block = storage.submitLedgerEntry(taskRef, entry);

  // T — cold mechanical referee, only after a confirm, only if the claim names a command.
  if (runTest && judgment.verdict === 'confirm' && claim.verifyCommand) {
    let exitCode = 0, out = '';
    try { out = execSync(claim.verifyCommand, { encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { exitCode = e?.status ?? 1; out = (e?.stdout ?? '') + (e?.stderr ?? ''); }
    block = storage.submitTest(taskRef, { verifyCommand: claim.verifyCommand, exitCode, outputHash: createHash('sha256').update(out).digest('hex') });
  }
  return { ok: true, verdict: block.verdict, judgment, block };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const todoId = process.argv[2];
  const pi = process.argv.indexOf('--project');
  const project = pi > 0 ? process.argv[pi + 1] : (process.env.CONTINUUM_PROJECT_ID || 'continuum');
  if (!todoId) { console.error('usage: node scripts/validator-v.mjs <todoId> [--project <id>]'); process.exit(2); }
  const storage = await openStorage(project);
  const res = await runValidator({ storage, todoId });
  if (!res.ok) { console.error(`V abstained: ${res.why} (task stays UNVERIFIED)`); process.exit(1); }
  console.log(`V (${MODEL}, local): ${res.judgment.verdict} — ${res.judgment.reasoning}`);
  console.log(`ledger verdict: ${res.verdict}`);
}
