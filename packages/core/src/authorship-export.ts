/**
 * The IP-Provenance Export (Authorship Ledger Phase 3 · spec §5).
 *
 * Walks the local checkpoint chain, resolves every StateEntry.acceptedBy seal back to its
 * type='decision' Observation, and — critically — RE-DERIVES each checkpoint hash to prove
 * the chain is unbroken (the same computeCheckpointHash that sealed it). The result is a
 * portable artifact that proves exactly which human accepted which verified state, tied to
 * its git commit and sealed in a named SHA-256 hash.
 *
 * The engine asserts NO authorship of its own — it is the tamper-evident record only.
 * Pure over the storage read-path (+ the exported hash): deterministically verifiable.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { computeCheckpointHash } from './checkpoint.js';
import type { StorageBackend } from './storage.js';

export interface AuthorshipEntry {
  state: string;
  where: string;
  /** The git commit that established this state (its authored unit). */
  landedAt: string | null;
  /** The shell command that proves it (verify-then-dissolve). */
  verifiedBy: string;
  verifiedAt: string;
  /** WHO leapt (P9). */
  operator: string;
  decisionId: string;
  decisionHash: string;
  verdict: string | null;
  rationale: string | null;
  /** The checkpoint SHA-256 this acceptance is sealed within. */
  sealedInCheckpoint: string;
  /** True when the decision Observation resolved AND its stored contentHash matches the seal. */
  decisionVerified: boolean;
  /** True when the checkpoint's re-derived hash equals its stored hash (chain unbroken here). */
  checkpointIntact: boolean;
  acceptedAt: string;
}

export interface AuthorshipExport {
  project: string;
  generatedAt: string;
  engine: string;
  chain: Array<{ checkpointId: string; checkpointHash: string; recordedAt: string; intact: boolean }>;
  authorship: AuthorshipEntry[];
  attestation: string;
  /** True only when EVERY checkpoint re-derives AND every decision seal verifies. */
  intact: boolean;
}

const ATTESTATION =
  'Every state listed above was reviewed, verified, and accepted by the named human ' +
  'operator. The intellectual property and the liability for these outcomes vest in that ' +
  'operator. CONTINUUM asserts no authorship of its own — it is the tamper-evident record only.';

/** Build the IP-provenance export by walking + re-deriving the checkpoint chain. */
export function buildAuthorshipExport(
  storage: Pick<StorageBackend, 'listSnapshots' | 'getObservations'>,
  opts: { project: string; generatedAt: string; limit?: number },
): AuthorshipExport {
  const snaps = storage.listSnapshots(opts.limit ?? 1000);
  const chain: AuthorshipExport['chain'] = [];
  const authorship: AuthorshipEntry[] = [];
  let allIntact = true;

  for (const snap of snaps) {
    // Re-derive the seal with the SAME algorithm that created it. A mismatch = tamper.
    const rederived = computeCheckpointHash(snap.active, snap.dormant, snap.broken);
    const intact = rederived === snap.hash;
    if (!intact) allIntact = false;
    chain.push({ checkpointId: snap.id, checkpointHash: snap.hash, recordedAt: snap.timestamp, intact });

    for (const e of snap.active) {
      if (!e.acceptedBy) continue;
      const [dec] = storage.getObservations([e.acceptedBy.decisionId]);
      const meta = (dec?.metadata ?? {}) as { contentHash?: string; verdict?: string; rationale?: string | null };
      const decisionVerified = !!dec && !!meta.contentHash && meta.contentHash === e.acceptedBy.decisionHash;
      if (!decisionVerified || !intact) allIntact = false;
      authorship.push({
        state: e.name,
        where: e.where,
        landedAt: e.landedAt ?? null,
        verifiedBy: e.verifyCommand,
        verifiedAt: e.verifiedAt,
        operator: e.acceptedBy.operator,
        decisionId: e.acceptedBy.decisionId,
        decisionHash: e.acceptedBy.decisionHash,
        verdict: meta.verdict ?? null,
        rationale: meta.rationale ?? null,
        sealedInCheckpoint: snap.hash,
        decisionVerified,
        checkpointIntact: intact,
        acceptedAt: e.acceptedBy.at,
      });
    }
  }

  return {
    project: opts.project,
    generatedAt: opts.generatedAt,
    engine: 'CONTINUUM — records evidence; asserts no authorship of its own',
    chain,
    authorship,
    attestation: ATTESTATION,
    intact: allIntact,
  };
}

/** Human-readable rendering of the export (for filing / counsel). */
export function renderAuthorshipMarkdown(exp: AuthorshipExport): string {
  const lines: string[] = [];
  lines.push(`# IP-Provenance Export — ${exp.project}`);
  lines.push('');
  lines.push(`_Generated ${exp.generatedAt} · chain integrity: **${exp.intact ? 'INTACT ✓' : 'BROKEN ✗'}**_`);
  lines.push('');
  lines.push(`> ${exp.engine}`);
  lines.push('');
  lines.push(`## Human-accepted states (${exp.authorship.length})`);
  for (const a of exp.authorship) {
    lines.push('');
    lines.push(`### ${a.state}`);
    lines.push(`- **where:** \`${a.where}\``);
    lines.push(`- **git commit:** ${a.landedAt ?? '(unpinned)'}`);
    lines.push(`- **verified by:** \`${a.verifiedBy}\` (at ${a.verifiedAt})`);
    lines.push(`- **accepted by:** ${a.operator} (${a.verdict ?? 'accept'}) at ${a.acceptedAt}`);
    if (a.rationale) lines.push(`- **rationale:** ${a.rationale}`);
    lines.push(`- **decision:** ${a.decisionId} · hash ${a.decisionHash}`);
    lines.push(`- **sealed in checkpoint:** ${a.sealedInCheckpoint}`);
    lines.push(`- **integrity:** checkpoint ${a.checkpointIntact ? 'intact ✓' : 'BROKEN ✗'} · decision seal ${a.decisionVerified ? 'verified ✓' : 'BROKEN ✗'}`);
  }
  lines.push('');
  lines.push('## Attestation');
  lines.push('');
  lines.push(exp.attestation);
  lines.push('');
  lines.push('_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._');
  return lines.join('\n') + '\n';
}
