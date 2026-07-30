#!/usr/bin/env node
// verify-interview.mjs — proof-gate for the Verifiable Interview (the answer to "LLM judges your work").
//
// Proves an interview where truth is MECHANICAL, not opinion:
//   • a claim with a re-runnable verifyCommand that exits 0 → PROVEN; the interviewer can RE-RUN it;
//   • the anti-padding invariant — the SAME claim asserted with a proof that exits 1 → UNVERIFIED; it
//     can NEVER masquerade as PROVEN (you can say anything; you can't fake the exit code);
//   • an independently-attested claim → ATTESTED; an unbacked claim → UNVERIFIED;
//   • the interview ranks PROVEN > ATTESTED > UNVERIFIED, and minTier hides the weak ones from a skeptic;
//   • WHAT-not-HOW — a hit carries the outcome + the proof, never the method;
//   • tamper-evidence — editing a claim's statement to pad it breaks its seal;
//   • the choke-point holds — a secret pasted into a claim is scrubbed before it's hashed or stored.
//
//   node scripts/verify-interview.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-interview-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_PRIVACY_PII = '1';

const { openStorage, recordClaim, interview, verifyClaimIntegrity } = await import('@number7even/continuum-core');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
// The mechanical referee — the caller RUNS the verifyCommand (core stays shell-free, like the Truth Ledger's T).
const runVerify = (cmd) => { try { execSync(cmd, { stdio: 'ignore', timeout: 5000 }); return 0; } catch (e) { return e.status ?? 1; } };
const SECRET = ['sk', 'live', '51ABCdefGHIjklMNOpqrstuvwx'].join('_'); // assembled — never a literal (push protection)

const storage = await openStorage('interview-test');

console.log('── the tiers · a mechanical proof decides, not an opinion ───────────────');
const proven = recordClaim(storage, { subject: 'riaan', statement: 'Built a parser that handles 158 languages via tree-sitter', verification: { kind: 'mechanical', verifyCommand: 'true', exitCode: runVerify('true') }, evidence: { url: 'https://github.com/x/parser' } });
const padded = recordClaim(storage, { subject: 'riaan', statement: 'Built a parser that handles 158 languages via tree-sitter', verification: { kind: 'mechanical', verifyCommand: 'false', exitCode: runVerify('false') } });
const attested = recordClaim(storage, { subject: 'riaan', statement: 'Led an engineering team of 20 across three products', verification: { kind: 'attested', attestedBy: 'cto@acme.example' } });
const bare = recordClaim(storage, { subject: 'riaan', statement: 'I am a 10x engineer, honestly, trust me', verification: { kind: 'unverified' } });
check('a re-runnable proof that exits 0 → PROVEN', proven.tier === 'PROVEN', proven.tier);
check('ANTI-PADDING: the SAME claim with a proof that exits 1 → UNVERIFIED', padded.tier === 'UNVERIFIED', padded.tier);
check('an independently-attested claim → ATTESTED', attested.tier === 'ATTESTED', attested.tier);
check('an unbacked assertion → UNVERIFIED', bare.tier === 'UNVERIFIED', bare.tier);

console.log('── the interview · ranked by proof, skeptic can gate to PROVEN only ─────');
const all = interview(storage, 'parser languages', {});
check('matching claims rank PROVEN first (proof beats padding)', all[0]?.tier === 'PROVEN' && all[0]?.id === proven.id, all.map(h => h.tier).join('>'));
const skeptic = interview(storage, 'parser languages', { minTier: 'PROVEN' });
check('minTier=PROVEN hides the failed/unproven claim from a skeptic', skeptic.length === 1 && skeptic[0].id === proven.id, `${skeptic.length} surfaced`);

console.log('── WHAT-not-HOW · outcome + proof, never the method ────────────────────');
const hit = all[0];
check('a hit carries the WHAT (statement) + the proof (re-runnable command)', /158 languages/.test(hit.statement) && hit.verification.verifyCommand === 'true');
check('a hit exposes NO method/source/code field (structural)', !('method' in hit) && !('source' in hit) && !('code' in hit) && !('how' in hit));

console.log('── the interviewer re-runs the proof themselves (verify-then-trust) ─────');
check('the PROVEN claim\'s verifyCommand is RE-RUNNABLE and still exits 0', runVerify(hit.verification.verifyCommand) === 0);

console.log('── tamper-evidence · padding a sealed claim breaks it ──────────────────');
const [provenObs] = storage.getObservations([proven.id]);
check('the sealed claim re-derives intact', verifyClaimIntegrity(provenObs) === true);
const tampered = { ...provenObs, metadata: { ...provenObs.metadata, statement: 'Built a parser for 158 languages AND cured cancer' } };
check('editing the statement to pad it BREAKS the seal (tamper detected)', verifyClaimIntegrity(tampered) === false);

console.log('── the choke-point · a secret in a claim is scrubbed before it seals ───');
const leaky = recordClaim(storage, { subject: 'riaan', statement: `Shipped billing; my key is ${SECRET} and guest jane@example.com`, verification: { kind: 'unverified' } });
const [leakyObs] = storage.getObservations([leaky.id]);
const text = leakyObs.content + JSON.stringify(leakyObs.metadata);
check('the secret + PII are redacted, and the hash still re-derives', !text.includes(SECRET) && !text.includes('jane@example.com') && verifyClaimIntegrity(leakyObs));

storage.close?.();
rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('INTERVIEW_VERIFY: GREEN — claims are ranked by MECHANICAL proof, not opinion; a failed proof can');
  console.log('never read as PROVEN; the interview exposes WHAT + a re-runnable proof, never the method; seals detect tampering.');
  process.exit(0);
} else { console.log('INTERVIEW_VERIFY: RED'); process.exit(1); }
