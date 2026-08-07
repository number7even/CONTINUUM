#!/usr/bin/env node
/**
 * setup-human-key.mjs — one-time, OUT-OF-BAND setup of the operator's human key.
 *
 * Generates (or reuses) the human Ed25519 keypair, saves the PRIVATE half locally (so the
 * console can sign attestations), and registers the PUBLIC half in the engine's project DB.
 * This is deliberately NOT an MCP tool: because there is no over-the-wire way to register a
 * human key, an LLM can never mint a human identity — the P9 boundary holds by construction.
 *
 *   node scripts/setup-human-key.mjs [project=continuum]
 *   env: CONTINUUM_HUMAN_KEY_PATH (default ~/.continuum/.human-key.json), CONTINUUM_DATA_DIR
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { openStorage } from '@number7even/continuum-core';
import { generateHumanKey, saveHumanKey, loadHumanKey, humanKeyPath } from '../apps/console/lib/truth-sign.mjs';

const project = process.argv[2] || process.env.CONTINUUM_PROJECT_ID || 'continuum';

let kp = loadHumanKey();
if (kp) {
  console.log(`✓ human key already exists at ${humanKeyPath()} (keyId="${kp.keyId}")`);
} else {
  kp = generateHumanKey();
  saveHumanKey(kp);
  console.log(`✓ generated human key → ${humanKeyPath()} (keyId="${kp.keyId}", mode 0600)`);
}

const storage = await openStorage(project);
storage.registerIdentity({ keyId: kp.keyId, role: 'human', publicKey: kp.publicKey });
console.log(`✓ registered PUBLIC key as human identity in project "${project}"`);
console.log('\nThe console can now mint the P9 leap: click "⚖ Attest" on a PENDING_HUMAN card.');
console.log('(The private key never leaves this machine; only the signed decision crosses the wire.)');
