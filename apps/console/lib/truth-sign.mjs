/**
 * truth-sign.mjs — the console's self-contained human-attestation signer.
 *
 * The console deploys to Vercel, so it must NOT import @number7even/continuum-core (which
 * pulls better-sqlite3, a native module). This file reproduces ONLY the pure signing surface
 * using node:crypto — the canonical form is byte-identical to core/truth-ledger.ts::canonical
 * so the engine's verifyEntry accepts what we sign here. (The E2E proves this — a drift would
 * make the engine reject the console's signature and fail the gate loudly.)
 *
 * Plain ESM (.mjs) on purpose: imported both by the Next attest route AND the verify script,
 * so there is ONE signing implementation, tested end-to-end.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { generateKeyPairSync, sign as edSign, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

/** Sorted-keys, fully-recursed canonical form — MUST match core/truth-ledger.ts::canonical. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const entryMessage = (entry) => { const { sig, ...rest } = entry; return canonical(rest); };

/** Where the human's private key lives on this machine (Option 2 will harden custody). */
export function humanKeyPath() {
  return process.env.CONTINUUM_HUMAN_KEY_PATH || `${homedir()}/.continuum/.human-key.json`;
}

/** Mint a human Ed25519 identity. keyId defaults to "human" (single-operator dogfood). */
export function generateHumanKey(keyId = 'human') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { keyId, role: 'human', publicKey, privateKey };
}

/** Load the human keypair from disk, or null if not set up yet. */
export function loadHumanKey() {
  const path = humanKeyPath();
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** Persist a keypair to the human-key path (0600). Returns the path. */
export function saveHumanKey(kp) {
  const path = humanKeyPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(kp, null, 2), { mode: 0o600 });
  return path;
}

/** Sign a `decision` entry (the P9 leap) for a todo with the human's key. The result is a
 *  fully-formed, signed LedgerEntry the engine's continuum_attest will verify + accept. */
export function signDecision(kp, todoId, decision = 'accept', direction) {
  const entry = {
    kind: 'decision',
    taskRef: `todo:${todoId}`,
    at: new Date().toISOString(),
    by: kp.keyId,
    role: 'human',
    payload: direction ? { decision, direction } : { decision },
  };
  entry.sig = edSign(null, Buffer.from(entryMessage(entry)), kp.privateKey).toString('base64');
  return entry;
}

export const _internal = { canonical, entryMessage, randomUUID };
