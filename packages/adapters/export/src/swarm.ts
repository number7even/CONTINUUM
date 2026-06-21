/**
 * adapter-export swarm — hierarchical-topology ephemeral concurrency
 * envelope (W26-3-export).
 *
 * Why a swarm:
 *   - Hierarchical topology matches the nested, turn-by-turn structure of
 *     Claude session JSONL transcripts (root parses session meta, children
 *     parse turn chunks). The operator's close-directive named this
 *     mapping explicitly.
 *   - Verify-then-dissolve lifecycle in try/finally
 *
 * Why Byzantine-majority voting IS used here:
 *   transcript-turn classification is subjective. The SAME turn could
 *   legitimately be:
 *     - ingested as-is (full content kept)
 *     - filtered out as a meta-only line (e.g. tool acknowledgement)
 *     - ingested only with its primary text (tool calls / thinking
 *       blocks stripped)
 *   Each child agent applies a different significance heuristic; BFT
 *   picks the majority verdict for each turn. The DETERMINISTIC core
 *   (turn ID, raw content, role, timestamp) is NOT voted on.
 *
 * Watch mode is NOT swarm-ified — live append is one-turn-at-a-time
 * and spawning a swarm per turn is absurd overhead. The swarm path
 * is only used for the initial backfill phase.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
// @ts-expect-error — ruv-swarm/src/index-enhanced.js has no published .d.ts
import { RuvSwarm } from 'ruv-swarm/src/index-enhanced.js';
import { byzantineVote, type StorageBackend, type Observation } from '@number7even/continuum-core';
import type { BFTCandidate } from '@number7even/continuum-core';

export interface ExportSwarmConfig {
  storage: StorageBackend;
  sourceId: string;
  /** Default 3 — matches BFT N=3 sweet spot. */
  maxAgents?: number;
  verbose?: boolean;
}

/** A parsed transcript turn ready for BFT classification + ingest. The
 *  ID is deterministic (turn-N hash); only the inclusion verdict is
 *  voted on. */
export interface TurnInput {
  /** Stable per-turn ID derived from session + turn index. */
  id: string;
  /** Which file the turn came from. */
  fileBasename: string;
  /** Raw observation (deterministic from the JSONL line). */
  observation: Omit<Observation, 'id'>;
  /** Subjective features the BFT vote can read. */
  features: {
    /** trim().length of content. */
    bodyLength: number;
    /** Heuristic flags. */
    isToolAcknowledgement: boolean;
    isMetaOnly: boolean;
  };
}

export interface ExportSwarmResult {
  swarmId: string;
  agentsSpawned: number;
  shardsProcessed: number;
  turnsScanned: number;
  upserted: number;
  voteFiltered: number;
  unanimousIngest: number;
  votedIngest: number;
  noQuorumIngest: number;
}

/** Partition turns across N child agents. Hierarchical topology: the
 *  root agent (agent-00) coordinates; children (01..N-1) each take a
 *  contiguous slice. We preserve order within slices so the transcript's
 *  temporal sequence isn't shuffled within an agent's view. */
export function hierarchicalShards(turns: TurnInput[], n: number): TurnInput[][] {
  if (turns.length === 0) return [];
  // n-1 children (agent 0 is root coordinator); minimum 1 child.
  const childCount = Math.max(1, Math.min(n - 1, turns.length));
  const out: TurnInput[][] = Array.from({ length: childCount }, () => []);
  const per = Math.ceil(turns.length / childCount);
  for (let i = 0; i < turns.length; i++) {
    out[Math.min(Math.floor(i / per), childCount - 1)]!.push(turns[i]!);
  }
  return out.filter(s => s.length > 0);
}

// ── Subjective derivations: turn-inclusion verdict ────────────────────────────
//
// Three significance strategies. Each child agent applies a different
// one. The BFT vote determines whether a turn lands in the index or
// is filtered as transcript noise. None of the strategies modifies the
// content itself — they only vote on INCLUSION.

type IncludeVerdict = 'include' | 'filter';

interface SignificanceStrategy {
  name: string;
  fn: (turn: TurnInput) => IncludeVerdict;
}

const SIGNIFICANCE_STRATEGIES: SignificanceStrategy[] = [
  // A — content-length floor: anything under 4 visible chars is noise.
  {
    name: 'length-floor',
    fn: t => (t.features.bodyLength >= 4 ? 'include' : 'filter'),
  },
  // B — meta-line filter: drop tool acks + meta-only lines.
  {
    name: 'meta-filter',
    fn: t =>
      t.features.isMetaOnly || t.features.isToolAcknowledgement ? 'filter' : 'include',
  },
  // C — permissive: keep everything that has any body at all. Acts as
  // the "ingest more rather than less" voice in the vote.
  {
    name: 'permissive',
    fn: t => (t.features.bodyLength > 0 ? 'include' : 'filter'),
  },
];

export async function ingestViaHierarchicalSwarm(
  turns: TurnInput[],
  config: ExportSwarmConfig,
): Promise<ExportSwarmResult> {
  const { storage, sourceId: _sourceId, verbose = false } = config;

  if (turns.length === 0) {
    return {
      swarmId: '(no-swarm-spawned)',
      agentsSpawned: 0,
      shardsProcessed: 0,
      turnsScanned: 0,
      upserted: 0,
      voteFiltered: 0,
      unanimousIngest: 0,
      votedIngest: 0,
      noQuorumIngest: 0,
    };
  }

  // N=4: 1 root + 3 children — one child per significance strategy.
  const requested = config.maxAgents ?? 4;
  const agentCount = Math.max(4, Math.min(requested, 8));

  const runtime = await RuvSwarm.initialize();
  const swarm = await runtime.createSwarm({
    topology: 'hierarchical',
    maxAgents: agentCount,
    strategy: 'sequential',
  });

  let upserted = 0;
  let voteFiltered = 0;
  let unanimousIngest = 0;
  let votedIngest = 0;
  let noQuorumIngest = 0;

  try {
    // Root coordinator agent — would extract session header in a richer
    // implementation; here it just materialises the topology so the
    // hierarchy has a recognisable root node.
    await swarm.spawn({
      type: 'coordinator',
      name: 'export-root',
      cognitivePattern: 'SYSTEMS',
    });

    // Child agents — one per significance strategy.
    const childAgents = SIGNIFICANCE_STRATEGIES.length;
    for (let i = 0; i < childAgents; i++) {
      await swarm.spawn({
        type: 'analyst',
        name: `export-child-${String(i).padStart(2, '0')}-${SIGNIFICANCE_STRATEGIES[i]!.name}`,
        cognitivePattern: 'CRITICAL', // turn-significance filtering is critical evaluation
      });
    }

    const shards = hierarchicalShards(turns, agentCount);

    if (verbose) {
      process.stdout.write(
        `[export:swarm] swarm=${swarm.id} topology=hierarchical agents=${agentCount} ` +
          `(1 root + ${childAgents} children) shards=${shards.length} turns=${turns.length}\n`,
      );
    }

    // STAGE 1 — every child agent produces an include/filter verdict
    // for every turn. The agentId encodes the strategy index.
    const candidates: BFTCandidate<{ verdict: IncludeVerdict }>[] = [];
    for (let agentIdx = 0; agentIdx < childAgents; agentIdx++) {
      const strategy = SIGNIFICANCE_STRATEGIES[agentIdx]!;
      const agentId = `export-child-${String(agentIdx).padStart(2, '0')}`;
      for (const turn of turns) {
        candidates.push({
          inputId: turn.id,
          agentId,
          value: { verdict: strategy.fn(turn) },
        });
      }
    }

    // STAGE 2 — BFT vote on the inclusion verdict per turn.
    const vote = byzantineVote(candidates, v => v.verdict);

    const verdictByTurn = new Map<string, IncludeVerdict>();
    for (const w of vote.winners) {
      verdictByTurn.set(w.inputId, w.value.verdict);
      if (w.quorum === w.total) unanimousIngest++;
      else votedIngest++;
    }
    noQuorumIngest = vote.noQuorum.length;

    // STAGE 3 — per-shard parallel ingest of the "include" winners.
    await Promise.all(
      shards.map(async shard => {
        const toInsert: Array<Omit<Observation, 'id'>> = [];
        for (const turn of shard) {
          const verdict = verdictByTurn.get(turn.id);
          if (verdict === 'include') {
            toInsert.push(turn.observation);
          } else {
            // Vote chose 'filter' (or noQuorum). Audit-counted; not stored.
            voteFiltered++;
          }
        }
        if (toInsert.length > 0) {
          const result = storage.insertObservationsBulk(toInsert);
          upserted += result.inserted;
        }
      }),
    );

    return {
      swarmId: swarm.id,
      agentsSpawned: agentCount,
      shardsProcessed: shards.length,
      turnsScanned: turns.length,
      upserted,
      voteFiltered,
      unanimousIngest,
      votedIngest,
      noQuorumIngest,
    };
  } finally {
    // VERIFY-THEN-DISSOLVE — runs even on throw.
    await swarm.terminate();
  }
}
