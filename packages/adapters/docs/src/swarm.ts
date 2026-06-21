/**
 * adapter-docs swarm — mesh-topology ephemeral concurrency envelope (W26-2).
 *
 * Why a swarm:
 *   - Parallel sharded ingest across N peer agents (mesh topology — every
 *     agent can cross-reference any other, matching the cross-link nature
 *     of a docs tree)
 *   - Verify-then-dissolve lifecycle in try/finally
 *
 * Why Byzantine-majority voting IS used here (vs. adapter-git):
 *   markdown source has subjective derivations the deterministic core
 *   doesn't constrain — the title of a doc could legitimately be the
 *   first h1, the first non-empty line, or the file basename. These are
 *   the conflicts the operator's W26-2 directive named when authorising
 *   the mesh swarm. Each agent applies a different strategy; the BFT
 *   primitive (packages/core/src/byzantine-vote.ts) picks the majority.
 *
 *   The DETERMINISTIC core of the observation (id, content, timestamp)
 *   is NOT voted on — those are sha256(path), file bytes, mtime.
 *   Agents agree by construction. Voting happens on `metadata.title`
 *   only, where strategies legitimately differ.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
// @ts-expect-error — ruv-swarm/src/index-enhanced.js has no published .d.ts
import { RuvSwarm } from 'ruv-swarm/src/index-enhanced.js';
import { byzantineVote, type StorageBackend } from '@number7even/continuum-core';
import type { BFTCandidate } from '@number7even/continuum-core';

export interface DocsSwarmConfig {
  storage: StorageBackend;
  sourceId: string;
  docsDir: string;
  /** Default 3 (matches the BFT N=3 sweet spot — clear 2-of-3 majority
   *  on each subjective derivation). */
  maxAgents?: number;
  verbose?: boolean;
}

export interface DocFile {
  /** Absolute path to the file. */
  absolutePath: string;
  /** Path relative to docsDir (POSIX-normalised). */
  relativePath: string;
  /** Stable sha256-derived UUID. */
  id: string;
  /** File contents (utf-8). */
  content: string;
  /** mtime as ISO string. */
  timestamp: string;
}

export interface DocsSwarmResult {
  swarmId: string;
  agentsSpawned: number;
  shardsProcessed: number;
  filesScanned: number;
  upserted: number;
  dropped: number;
  /** How many files had unanimous BFT agreement on title. */
  unanimousTitles: number;
  /** How many had a non-unanimous-but-majority outcome. */
  votedTitles: number;
  /** How many had no quorum (BFT primitive said "can't decide"). */
  noQuorumTitles: number;
}

/** Even-partition the file list across N agents. Mesh topology doesn't
 *  constrain order, but for parallel ingest we still slice into N
 *  contiguous chunks (one per agent) so the work is evenly distributed. */
export function partitionForMesh(files: DocFile[], n: number): DocFile[][] {
  if (files.length === 0) return [];
  const shards = Math.max(1, Math.min(n, files.length));
  const out: DocFile[][] = Array.from({ length: shards }, () => []);
  const per = Math.ceil(files.length / shards);
  for (let i = 0; i < files.length; i++) {
    out[Math.min(Math.floor(i / per), shards - 1)]!.push(files[i]!);
  }
  return out.filter(s => s.length > 0);
}

// ── Subjective derivations (the BFT input axis) ──────────────────────────────
//
// Three title-extraction strategies. Each agent applies a different one.
// On most files all three agree on the same value (e.g. the first line
// IS an h1 IS the recognisable title); on edge cases (e.g. a docs file
// that starts with a TOC instead of a heading) they diverge and BFT
// picks the 2-of-3 majority.

/** Strategy A — first markdown h1 heading. */
function titleFromFirstH1(content: string, fallback: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1]!.trim();
  }
  return fallback;
}

/** Strategy B — first non-empty line, with markdown adornment stripped. */
function titleFromFirstLine(content: string, fallback: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed.length > 0) return trimmed;
  }
  return fallback;
}

/** Strategy C — filename basename (sans extension). */
function titleFromBasename(_content: string, fallback: string): string {
  return fallback;
}

const TITLE_STRATEGIES: Array<{
  name: string;
  fn: (content: string, fallback: string) => string;
}> = [
  { name: 'first-h1', fn: titleFromFirstH1 },
  { name: 'first-line', fn: titleFromFirstLine },
  { name: 'basename', fn: titleFromBasename },
];

interface AgentDraft {
  fileId: string;
  agentId: string;
  /** Subjective: this is what BFT votes on. */
  title: string;
  /** Deterministic: every agent computes the same value for these. */
  file: DocFile;
}

/**
 * Spawn an ephemeral mesh-topology swarm, partition the file list across
 * N agents, normalise each shard with the per-agent title strategy,
 * Byzantine-vote on the title field per file, upsert the winning
 * observation, and dissolve.
 */
export async function ingestViaMeshSwarm(
  files: DocFile[],
  config: DocsSwarmConfig,
): Promise<DocsSwarmResult> {
  const { storage, sourceId, verbose = false } = config;

  if (files.length === 0) {
    return {
      swarmId: '(no-swarm-spawned)',
      agentsSpawned: 0,
      shardsProcessed: 0,
      filesScanned: 0,
      upserted: 0,
      dropped: 0,
      unanimousTitles: 0,
      votedTitles: 0,
      noQuorumTitles: 0,
    };
  }

  // For BFT to have meaningful work we need at least 3 agents per file
  // (one per title strategy). Cap at min(8, files.length).
  const requested = config.maxAgents ?? 3;
  const agentCount = Math.max(3, Math.min(requested, 8, TITLE_STRATEGIES.length));

  const runtime = await RuvSwarm.initialize();
  const swarm = await runtime.createSwarm({
    topology: 'mesh',
    maxAgents: agentCount,
    strategy: 'parallel',
  });

  let upserted = 0;
  let dropped = 0;
  let unanimousTitles = 0;
  let votedTitles = 0;
  let noQuorumTitles = 0;

  try {
    // Spawn N mesh-peer agents, one per title strategy.
    for (let i = 0; i < agentCount; i++) {
      await swarm.spawn({
        type: 'researcher',
        name: `docs-peer-${String(i).padStart(2, '0')}-${TITLE_STRATEGIES[i]!.name}`,
        cognitivePattern: 'LATERAL', // cross-reference is associative — fits mesh
      });
    }

    // Partition for parallel ingest.
    const shards = partitionForMesh(files, agentCount);

    if (verbose) {
      process.stdout.write(
        `[docs:swarm] swarm=${swarm.id} topology=mesh agents=${agentCount} shards=${shards.length} files=${files.length}\n`,
      );
    }

    // STAGE 1 — per-agent parallel candidate derivation. EVERY agent
    // processes EVERY file (small overhead in CPU; the win is BFT
    // resolution of subjective fields). Each agent applies its assigned
    // title strategy.
    const candidates: BFTCandidate<{ title: string }>[] = [];
    const fileById = new Map<string, DocFile>();
    for (const file of files) fileById.set(file.id, file);

    await Promise.all(
      Array.from({ length: agentCount }, async (_unused, agentIdx) => {
        const strategy = TITLE_STRATEGIES[agentIdx]!;
        const agentId = `docs-peer-${String(agentIdx).padStart(2, '0')}`;
        const fallback = (f: DocFile) =>
          f.relativePath.split('/').pop()!.replace(/\.(md|mdx)$/i, '');
        for (const file of files) {
          candidates.push({
            inputId: file.id,
            agentId,
            value: { title: strategy.fn(file.content, fallback(file)) },
          });
        }
      }),
    );

    // STAGE 2 — Byzantine-majority vote on the subjective title field.
    const vote = byzantineVote(candidates, v => v.title);

    // Account for outcomes.
    for (const w of vote.winners) {
      const isUnanimous = w.quorum === w.total;
      if (isUnanimous) unanimousTitles++;
      else votedTitles++;
    }
    noQuorumTitles = vote.noQuorum.length;

    // STAGE 3 — assemble the canonical observation per file and upsert.
    // Files that hit noQuorum keep the basename fallback (defensive default).
    const winningTitleByFile = new Map<string, string>();
    for (const w of vote.winners) winningTitleByFile.set(w.inputId, w.value.title);

    // Per-shard parallel upsert. Storage layer serialises SQLite writes
    // safely; vector queue batches embeds across shards (W25 insertBatch
    // path preserved).
    await Promise.all(
      shards.map(async shard => {
        for (const file of shard) {
          const title = winningTitleByFile.get(file.id) ??
            file.relativePath.split('/').pop()!.replace(/\.(md|mdx)$/i, '');
          const r = storage.upsertObservation({
            id: file.id,
            sourceId,
            type: 'doc',
            content: file.content,
            timestamp: file.timestamp,
            refs: [],
            metadata: {
              adapter: '@number7even/continuum-adapter-docs',
              path: file.relativePath,
              bytes: file.content.length,
              title,
              // Audit: how was this title chosen?
              titleAgreement:
                vote.winners.find(w => w.inputId === file.id)?.quorum ?? 0,
            },
          });
          if (r) upserted++;
          else dropped++;
        }
      }),
    );

    return {
      swarmId: swarm.id,
      agentsSpawned: agentCount,
      shardsProcessed: shards.length,
      filesScanned: files.length,
      upserted,
      dropped,
      unanimousTitles,
      votedTitles,
      noQuorumTitles,
    };
  } finally {
    // VERIFY-THEN-DISSOLVE — runs even on throw.
    await swarm.terminate();
  }
}
