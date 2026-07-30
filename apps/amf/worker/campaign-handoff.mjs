// campaign-handoff.mjs — the CROOMA Wave-1 seam (CONTINUUM side): export a sealed, self-contained
// provenance bundle the Campaign Engine (CROOMA / pod-geni) ingests to schedule a B2B asset.
//
// This is HALF of Seam 1. It proves the CONTINUUM-side wall: an asset is exported ONLY if a human
// sealed it (P9), and its contentHash re-derives to the exact draft (tamper-evident). The Campaign
// Engine mirrors these checks on intake — that half lives in the pod-geni repo, gated against this
// contract. Nothing here trusts Cadence; it produces the cryptographic witness Cadence must verify.
//
// The bundle is SELF-CONTAINED across projects: the decision seals in AMF_DECISION_PROJECT; the source
// signal lives in the content project (AMF_CONTENT_PROJECT / opts.contentProject). Both are named in
// the bundle so the chain of custody walks without a one-DB guess. (Follow-up: the enqueue path should
// stamp `contentProject` on the draft so it's carried automatically — flagged, not papered over.)
//
//   import { campaignHandoff } from './campaign-handoff.mjs'
//   const bundle = await campaignHandoff(approvedDraftId, { contentProject })
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftContentHash } from './review.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const reviewDir = () => process.env.AMF_REVIEW_DIR || join(HERE, 'out', 'review-queue');
const DECISION_PROJECT = () => process.env.AMF_DECISION_PROJECT || 'amf';

/**
 * Build the sealed handoff bundle for an APPROVED draft, or refuse (ok:false) with a reason.
 * Refusal IS the P9 wall — no seal, no seal-that-binds-this-asset, or a post-approval edit → no export.
 */
export async function campaignHandoff(approvedDraftId, opts = {}) {
  const decisionProject = DECISION_PROJECT();

  // 1. The asset must be in approved/ — a sealed P9 decision is what moved it there (review.mjs).
  const path = join(reviewDir(), 'approved', `${approvedDraftId}.json`);
  if (!existsSync(path)) return { ok: false, reason: 'not an approved draft — no P9 seal (refuse to export)' };
  const rec = JSON.parse(readFileSync(path, 'utf8'));

  // Self-contained: the draft stamps its own originating content project (pipeline.mjs / content-matcher).
  // Precedence: explicit opt → the draft's own stamp → env fallback → the decision project. No manual
  // override needed for a stamped draft — the bundle carries all cross-project provenance itself.
  const contentProject = opts.contentProject || rec.contentProject || rec.brief?.contentProject || process.env.AMF_CONTENT_PROJECT || decisionProject;

  // 2. The seal must be stamped on the record (decisionId + contentHash, set at approval time).
  if (!rec.decisionId || !rec.contentHash) return { ok: false, reason: 'approved draft carries no ledger seal (refuse)' };

  // 3. Tamper check: re-derive the hash NOW through the same function that sealed it. Any post-approval
  //    edit to the brief changes the hash → the asset no longer matches its human authorization.
  const nowHash = draftContentHash(rec);
  if (nowHash !== rec.contentHash) {
    return { ok: false, reason: `asset tampered since approval — contentHash mismatch (sealed ${rec.contentHash.slice(0, 20)}… ≠ now ${nowHash.slice(0, 20)}…)` };
  }

  // 4. Verify the decision Observation exists in the ledger AND seals THIS asset (not just any seal).
  const { openStorage } = await import(resolve(REPO_ROOT, 'packages/core/dist/index.js'));
  const decStore = await openStorage(decisionProject);
  const [dec] = decStore.getObservations([rec.decisionId]);
  decStore.close?.();
  if (!dec || dec.type !== 'decision') return { ok: false, reason: 'decision Observation not found in the ledger (refuse)' };
  if (dec.metadata?.subject?.contentHash !== rec.contentHash) return { ok: false, reason: 'ledger seal does not bind this asset (refuse)' };

  // 5. Walk the source chain: decision → draft → the source signal → its origin (cross-project).
  const fromSignal = rec.brief?.fromSignal ?? rec.fromSignal ?? null;
  const declaredSources = rec.brief?.sources ?? rec.sources ?? [];
  let signalNode = null;
  if (fromSignal) {
    const cs = await openStorage(contentProject);
    const [sig] = cs.getObservations([fromSignal]);
    cs.close?.();
    if (sig) {
      signalNode = {
        role: 'signal',
        id: sig.id,
        project: contentProject,
        sourceId: sig.sourceId,
        url: sig.metadata?.sources?.[0] ?? declaredSources[0] ?? null,
        title: (sig.content ?? '').split('\n')[0].slice(0, 90),
      };
    }
  }

  // 6. The self-contained, sealed bundle. `chainUnbroken` is true only when the source signal resolved.
  return {
    ok: true,
    decisionId: rec.decisionId,
    decisionProject,
    contentHash: rec.contentHash,
    verdict: dec.metadata.verdict,
    operator: dec.metadata.operator,          // scrub-exempt provenance — WHO leapt
    sealedAt: dec.timestamp,
    asset: { id: rec.id, slug: rec.slug, brief: rec.brief ?? { ...rec } },
    sourceChain: [
      { role: 'decision', id: rec.decisionId, project: decisionProject },
      { role: 'draft', id: rec.id },
      ...(signalNode ? [signalNode] : []),
    ],
    chainUnbroken: !!signalNode,
  };
}
