/**
 * byzantine-vote.ts — generic Byzantine-majority voting primitive (W26-4).
 *
 * A pure, deterministic function that takes N candidate values per input
 * (produced by N agents) and returns the majority-agreed winner per
 * input, with explicit dissent tracking for audit.
 *
 * ⚠️ Honest naming: this is **Byzantine-majority voting**, NOT cryptographic
 * Byzantine consensus. We don't ship signed messages, Merkle rounds, or
 * proof-of-work — those belong in a distributed-trust protocol, not in a
 * single-process aggregation library. What we DO ship is the BFT-bound
 * majority property: when fewer than ⌈N/3⌉ candidates per input are
 * faulty (garbage / divergent / malicious), the correct value wins
 * deterministically.
 *
 * Used by adapter swarms that produce divergent observations across agents
 * (e.g. adapter-docs where excerpt boundaries are subjective, adapter-export
 * where transcript-turn parsing has interpretation room). NOT called by
 * adapter-git — git commits are cryptographically deterministic so any
 * vote round is theatrical (different agents normalising the same SHA
 * produce identical output by construction). See SPRINT-2026-W26.md § W26-4
 * for the Path C decoupling rationale.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */

/** One agent's candidate value for one input. */
export interface BFTCandidate<T> {
  /** Source-level identifier (file path, transcript turn ID, etc.). All
   *  candidates with the same inputId vote against each other. */
  inputId: string;
  /** Identifies the agent that produced this candidate. Used as the
   *  tiebreaker key when votes split evenly: lowest agentId (lexicographic
   *  string compare) wins. */
  agentId: string;
  /** The value being voted on. Two candidates with identical `canonicalize`
   *  output count as the same vote. */
  value: T;
}

/** The majority-elected value for one input, with audit context. */
export interface BFTWinner<T> {
  inputId: string;
  /** The agentId whose value won. (Multiple agents may have produced
   *  identical winning values; this is the lexicographically-first one
   *  among the winners for reproducibility.) */
  agentId: string;
  value: T;
  /** How many candidates produced the winning value. */
  quorum: number;
  /** Total candidate count for this inputId. quorum / total = agreement. */
  total: number;
}

/** A candidate that did NOT win (its agent saw something different from
 *  the majority). Aggregated for side-channel audit. */
export interface BFTDissent<T> {
  inputId: string;
  agentId: string;
  value: T;
  /** The winning agentId, for cross-reference. */
  winnerAgentId: string;
}

export interface BFTVoteResult<T> {
  winners: BFTWinner<T>[];
  dissents: BFTDissent<T>[];
  /** Inputs where NO candidate achieved a majority (all groups smaller
   *  than ⌈N/2⌉+1). Caller decides whether to drop or proceed with the
   *  lowest-agentId fallback. */
  noQuorum: string[];
}

/**
 * Group candidates by `inputId` and elect the majority value per group.
 *
 * Algorithm:
 *   1. Group candidates by `inputId`.
 *   2. Within each group, bucket candidates by `canonicalize(value)`.
 *   3. The largest bucket is considered first; ties on bucket size are
 *      broken by lexicographically-smallest agentId (determinism, not
 *      truth-discovery — see step 4).
 *   4. STRICT MAJORITY GATE: the considered bucket only wins if its
 *      size is ≥ ⌊N/2⌋+1. Otherwise the inputId lands in `noQuorum`.
 *      This is the honest answer outside the f<N/3 BFT bound — even
 *      splits don't have a "right" answer to pick.
 *   5. Within a winning bucket, the lexicographically-smallest agentId
 *      is the reported `winnerAgentId` (so two BFT runs over the same
 *      candidate set produce identical results).
 *   6. Candidates in losing buckets land in `dissents[]`.
 *
 * BFT bound:
 *   For an input with N candidates total, the correct value wins
 *   whenever fewer than ⌈N/3⌉ candidates are faulty. At f = ⌈N/3⌉ a
 *   correct vs. faulty tie is possible; the deterministic tiebreaker
 *   resolves it but may pick the faulty value if its agentId happens
 *   to be smaller. This is the classical limit — to push f higher
 *   you'd need cryptographic signatures, which are out of scope.
 *
 * @param canonicalize  Optional. Defaults to `JSON.stringify`. Use a
 *                      domain-specific normaliser when JSON's key
 *                      ordering would treat semantically-identical
 *                      values as different (e.g. metadata field order).
 */
export function byzantineVote<T>(
  candidates: BFTCandidate<T>[],
  canonicalize: (value: T) => string = (v: T) => JSON.stringify(v),
): BFTVoteResult<T> {
  const winners: BFTWinner<T>[] = [];
  const dissents: BFTDissent<T>[] = [];
  const noQuorum: string[] = [];

  // Group by inputId.
  const byInput = new Map<string, BFTCandidate<T>[]>();
  for (const c of candidates) {
    let arr = byInput.get(c.inputId);
    if (!arr) {
      arr = [];
      byInput.set(c.inputId, arr);
    }
    arr.push(c);
  }

  for (const [inputId, group] of byInput) {
    // Bucket by canonicalized value. Each bucket tracks members + the
    // lexicographically-smallest agentId in the bucket (for tiebreaker).
    const buckets = new Map<
      string,
      { members: BFTCandidate<T>[]; minAgent: string }
    >();
    for (const c of group) {
      const key = canonicalize(c.value);
      let b = buckets.get(key);
      if (!b) {
        b = { members: [c], minAgent: c.agentId };
        buckets.set(key, b);
      } else {
        b.members.push(c);
        if (c.agentId < b.minAgent) b.minAgent = c.agentId;
      }
    }

    // Sort buckets: larger size wins; ties broken by smaller minAgent
    // (lexicographic). This makes the choice fully deterministic.
    const sorted = [...buckets.values()].sort((a, b) => {
      if (b.members.length !== a.members.length) {
        return b.members.length - a.members.length;
      }
      return a.minAgent < b.minAgent ? -1 : a.minAgent > b.minAgent ? 1 : 0;
    });

    const winningBucket = sorted[0]!;
    const total = group.length;
    const majorityThreshold = Math.floor(total / 2) + 1;

    if (winningBucket.members.length < majorityThreshold) {
      // No bucket reached strict majority. Caller decides what to do.
      noQuorum.push(inputId);
      continue;
    }

    // Pick a representative from the winning bucket (the one with the
    // smallest agentId — same as bucket.minAgent).
    const winner = winningBucket.members.find(
      m => m.agentId === winningBucket.minAgent,
    )!;
    winners.push({
      inputId,
      agentId: winner.agentId,
      value: winner.value,
      quorum: winningBucket.members.length,
      total,
    });

    // Everyone in non-winning buckets is a dissenter.
    for (let i = 1; i < sorted.length; i++) {
      for (const m of sorted[i]!.members) {
        dissents.push({
          inputId,
          agentId: m.agentId,
          value: m.value,
          winnerAgentId: winner.agentId,
        });
      }
    }
  }

  return { winners, dissents, noQuorum };
}
