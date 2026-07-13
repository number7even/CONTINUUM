/**
 * truth-ledger.ts — the multi-signature TruthBlock engine.
 *
 * The problem it solves: a standard AI agent grades its own homework. CONTINUUM's
 * thesis is "verify, don't trust", so a "done" claim is only true when it carries a
 * full signature set from DISTINCT, non-colluding keys — separating the four powers:
 *
 *   A — the Executor   (an LLM)      makes the CLAIM              — cannot certify itself
 *   V — the Validator  (a separate LLM) semantic linesman: scope / out-of-bounds /
 *                                       privacy leaks — ADVISES, has no vote
 *   T — the Tester     (NOT an LLM)  cold mechanical `exit 0`     — the referee
 *   H — the Human      (Riaan)       the P9 leap: IP + liability  — the only accepter
 *
 * Independence is enforced in cryptography, not etiquette: if the key that signed the
 * CLAIM also signed the VALIDATION or the TEST, the block is INVALID by construction —
 * the agent literally cannot spin up a sock-puppet validator under its own key.
 *
 * Zero-egress: Ed25519 via Node's built-in crypto (no deps, no network). The seal stays
 * local; H alone chooses to export it (authorship-export.ts) for a legal/enterprise hand-off.
 *
 * Reuses the checkpoint hash discipline: SHA-256 over a canonical (sorted-keys, recursed)
 * serialization, so any edit to any field of any entry changes the block hash — tamper is
 * detectable by re-derivation (verifyLedger).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, randomUUID } from 'node:crypto';

/** Sorted-keys, fully-recursed canonical form — mirrors checkpoint.ts::canonicalStringify.
 *  The basis of both the signature message and the block hash: same bytes every time. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

// ── Identities ──────────────────────────────────────────────────────────────
// A=executor · V=validator · H=human · T=tester · BALL=the yardstick (authors the
// SPEC / definition-of-done). BALL records the spec into the thread but casts no vote.
export type Role = 'executor' | 'validator' | 'human' | 'tester' | 'ball';

/** The public half — safe to store in the ledger (anchored, like a genesis-block key registry). */
export interface Identity { keyId: string; role: Role; publicKey: string }
/** The full keypair — the private half NEVER leaves its holder. H's key lives off-repo. */
export interface Keypair extends Identity { privateKey: string }

/** Mint an Ed25519 identity for a role. keyId defaults to a uuid; pass a stable one to persist. */
export function generateIdentity(role: Role, keyId: string = randomUUID()): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { keyId, role, publicKey, privateKey };
}

// ── Entries — one signed statement by one party about one task ────────────────
export type EntryKind = 'spec' | 'claim' | 'validation' | 'decision' | 'test' | 'push' | 'correction';

export interface EntryPayloads {
  spec:       { statement: string; definitionOfDone: string };
  claim:      { statement: string; diffHash?: string; commitShas?: string[]; verifyCommand?: string };
  validation: { verdict: 'confirm' | 'dispute'; reasoning: string; suggestedResponse?: string; flags?: string[] };
  decision:   { decision: 'accept' | 'iterate' | 'reject'; direction?: string };
  test:       { verifyCommand: string; exitCode: number; outputHash: string; verifier: string };
  push:       { commitSha: string; deployReceipt?: string };
  correction: { supersedes: string; reason: string };
}

export interface LedgerEntry<K extends EntryKind = EntryKind> {
  kind: K;
  taskRef: string;
  at: string;          // ISO timestamp
  by: string;          // keyId of the signer
  role: Role;
  payload: EntryPayloads[K];
  sig?: string;        // base64 Ed25519 over canonical(entry without `sig`)
}

/** The bytes a signature covers: the entry minus its own signature. */
function entryMessage(entry: LedgerEntry): string {
  const { sig: _omit, ...rest } = entry;
  return canonical(rest);
}

/** Sign an entry with its author's keypair. Guards role/keyId consistency (P4: no impersonation). */
export function signEntry<K extends EntryKind>(entry: LedgerEntry<K>, kp: Keypair): LedgerEntry<K> {
  if (entry.by !== kp.keyId) throw new Error(`signEntry: entry.by (${entry.by}) ≠ signer keyId (${kp.keyId})`);
  if (entry.role !== kp.role) throw new Error(`signEntry: entry.role (${entry.role}) ≠ signer role (${kp.role})`);
  const sig = edSign(null, Buffer.from(entryMessage(entry)), kp.privateKey).toString('base64');
  return { ...entry, sig };
}

/** Verify one entry's signature against a claimed identity. False on any mismatch/tamper. */
export function verifyEntry(entry: LedgerEntry, identity: Identity | undefined): boolean {
  if (!identity || !entry.sig || entry.by !== identity.keyId || entry.role !== identity.role) return false;
  try {
    return edVerify(null, Buffer.from(entryMessage(entry)), identity.publicKey, Buffer.from(entry.sig, 'base64'));
  } catch { return false; }
}

// ── Verdicts — the truth of a task thread ─────────────────────────────────────
export type Verdict =
  | 'PROVEN'         // full DISTINCT-key set (A,V,T,H), V confirmed, T exit 0, H accepted
  | 'PENDING_HUMAN'  // A+V+T all green, awaiting H's leap
  | 'CONTESTED'      // V disputed the claim
  | 'REFUTED'        // T ran and exit ≠ 0
  | 'UNVERIFIED'     // missing an independent V or T attestation
  | 'INVALID';       // collusion (shared key) / bad signature / no claim

export const GENESIS = '0'.repeat(64);

/** The rules engine. Derives the verdict of a set of entries — the heart of the ledger.
 *  `idById` maps keyId → the public Identity used to verify each signature. */
export function evaluateVerdict(entries: LedgerEntry[], idById: Map<string, Identity>): Verdict {
  // 1. Every present signature must verify. A single bad sig poisons the block.
  for (const e of entries) if (!verifyEntry(e, idById.get(e.by))) return 'INVALID';

  const claim = entries.find(e => e.kind === 'claim');
  if (!claim) return 'INVALID';                          // nothing claimed → nothing to weld
  const val  = entries.find(e => e.kind === 'validation');
  const test = entries.find(e => e.kind === 'test');
  const dec  = entries.find(e => e.kind === 'decision');

  // 2. Anti-collusion: CLAIM / VALIDATION / TEST / accepting-DECISION must be DISTINCT keys.
  //    Any shared key means someone graded their own homework → INVALID, unconditionally.
  const signers = [claim.by, val?.by, test?.by, dec?.by].filter((k): k is string => !!k);
  if (new Set(signers).size !== signers.length) return 'INVALID';

  // 3. Role integrity: only the right role can play each part.
  const spec = entries.find(e => e.kind === 'spec');
  if (spec && spec.role !== 'ball') return 'INVALID';    // the spec must come from the yardstick
  if (claim.role !== 'executor') return 'INVALID';
  if (val && val.role !== 'validator') return 'INVALID';
  if (test && test.role !== 'tester') return 'INVALID';
  if (dec && dec.role !== 'human') return 'INVALID';     // an LLM can never mint acceptance (P9)

  // 4. The gate, in order of enforcement.
  if (!val) return 'UNVERIFIED';
  if ((val.payload as EntryPayloads['validation']).verdict === 'dispute') return 'CONTESTED';
  if (!test) return 'UNVERIFIED';
  if ((test.payload as EntryPayloads['test']).exitCode !== 0) return 'REFUTED';
  if (!dec || (dec.payload as EntryPayloads['decision']).decision !== 'accept') return 'PENDING_HUMAN';
  return 'PROVEN';
}

// ── Blocks — a finalized, hash-linked task thread ─────────────────────────────
export interface TruthBlock {
  index: number;
  prevHash: string;    // blockHash of the previous block (or GENESIS)
  taskRef: string;
  entries: LedgerEntry[];
  verdict: Verdict;
  blockHash?: string;  // SHA-256 over canonical(block without blockHash)
}

/** SHA-256 over the canonical block sans its own hash. Re-derivable ⇒ tamper-evident. */
export function computeBlockHash(block: Omit<TruthBlock, 'blockHash'>): string {
  return createHash('sha256').update(canonical(block)).digest('hex');
}

/** Weld a task thread into an immutable block: derive the verdict, then seal the hash.
 *  The verdict is computed from the entries — it cannot be asserted independently of them. */
export function finalizeBlock(
  input: { index: number; prevHash: string; taskRef: string; entries: LedgerEntry[] },
  identities: Identity[],
): TruthBlock {
  const idById = new Map(identities.map(i => [i.keyId, i]));
  const verdict = evaluateVerdict(input.entries, idById);
  const core = { index: input.index, prevHash: input.prevHash, taskRef: input.taskRef, entries: input.entries, verdict };
  return { ...core, blockHash: computeBlockHash(core) };
}

export interface LedgerIssue { index: number; kind: 'chain' | 'tamper' | 'verdict' | 'signature' | 'retest'; detail: string }
export interface LedgerReport { ok: boolean; count: number; issues: LedgerIssue[] }

/** Walk the whole chain and independently re-establish its integrity (verify-then-dissolve,
 *  applied to history itself): re-link every prevHash, re-derive every blockHash, re-check every
 *  signature, re-compute every verdict, and — if `runVerify` is supplied — mechanically RE-RUN
 *  each TEST's verifyCommand and demand the same exit 0. Pure by default (no I/O); the caller
 *  injects execution, keeping core network-free. */
export async function verifyLedger(
  blocks: TruthBlock[],
  identities: Identity[],
  opts: { runVerify?: (cmd: string) => Promise<{ exitCode: number }> } = {},
): Promise<LedgerReport> {
  const idById = new Map(identities.map(i => [i.keyId, i]));
  const issues: LedgerIssue[] = [];
  const ordered = [...blocks].sort((a, b) => a.index - b.index);
  let prev = GENESIS;

  for (const b of ordered) {
    if (b.prevHash !== prev) issues.push({ index: b.index, kind: 'chain', detail: `prevHash ≠ ${prev.slice(0, 12)}…` });
    const { blockHash, ...core } = b;
    const recomputed = computeBlockHash(core);
    if (blockHash !== recomputed) issues.push({ index: b.index, kind: 'tamper', detail: 'blockHash mismatch — a field was altered' });
    for (const e of b.entries) if (!verifyEntry(e, idById.get(e.by))) issues.push({ index: b.index, kind: 'signature', detail: `bad/absent sig on ${e.kind} by ${e.by}` });
    const recomputedVerdict = evaluateVerdict(b.entries, idById);
    if (recomputedVerdict !== b.verdict) issues.push({ index: b.index, kind: 'verdict', detail: `stored ${b.verdict} ≠ derived ${recomputedVerdict}` });

    if (opts.runVerify) {
      const test = b.entries.find(e => e.kind === 'test');
      if (test && b.verdict === 'PROVEN') {
        const cmd = (test.payload as EntryPayloads['test']).verifyCommand;
        const { exitCode } = await opts.runVerify(cmd);
        if (exitCode !== 0) issues.push({ index: b.index, kind: 'retest', detail: `PROVEN block failed re-test (exit ${exitCode}): ${cmd}` });
      }
    }
    prev = b.blockHash ?? recomputed;
  }
  return { ok: issues.length === 0, count: ordered.length, issues };
}
