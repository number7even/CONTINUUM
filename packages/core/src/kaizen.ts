/**
 * kaizen.ts — the Kaizen discipline, wired into CONTINUUM.
 *
 * Kaizen (改善, "continuous improvement"): forge a plan on paper until a NAMED
 * mid-tier model could execute it blind, self-grade it point-by-point, stress it
 * adversarially, and refine — before any execution. It is verify-then-dissolve at
 * the planning altitude:
 *
 *   the KAIZEN standard  ≈  the verifyCommand contract
 *   a LEDGER entry       ≈  an Observation (append-only, self-graded)
 *   the blind run of #8   ≈  a recorded outcome — a RUN, not a claim
 *
 * CONTINUUM mapping (reuses existing primitives — no parallel store):
 *   mission       → a Todo  (verifyCommand = the blind-run check)
 *   ledger entry  → an Observation (type='kaizen_ledger', full grade in metadata)
 *
 * This module is pure + deterministic: the standard as data, and a grader that
 * refuses to call a plan ready on a claim (fixes the three review gaps — the
 * ledger has a fixed schema, the blind run must be executed, the executor named).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */

/** The eight-point standard. A plan is kaizen-ready only when ALL eight hold. */
export const KAIZEN_STANDARD = [
  { point: 1, key: 'expected-observation', text: 'Every move states its expected observation — exactly what you should see if it worked.' },
  { point: 2, key: 'failure-countermove', text: 'Every move carries its most likely failure, the cause that failure signals, and the counter-move.' },
  { point: 3, key: 'triggered-forks', text: 'Every fork has a trigger. Observe X → take route B. No judgment left to the executor.' },
  { point: 4, key: 'recon-needed', text: 'Every unsettled assumption is marked RECON NEEDED with the exact check that settles it.' },
  { point: 5, key: 'abort-conditions', text: 'Abort conditions exist — the moments to stop and flag rather than improvise.' },
  { point: 6, key: 'verification', text: 'Verification is spelled out — which runs, when, and what pass looks like for each.' },
  { point: 7, key: 'adversarial-pass', text: 'It survived an adversarial pass — records the attack that failed and the patch the one that landed produced.' },
  { point: 8, key: 'blind-executable', text: 'Executable blind: the named mid-tier model runs it end to end without asking a single question.' },
] as const;

export const KAIZEN_POINTS = KAIZEN_STANDARD.length; // 8

export interface KaizenGrade {
  /** 1..8, matching KAIZEN_STANDARD. */
  point: number;
  pass: boolean;
  /** WHY it passes/fails — a grade without evidence is not a grade. */
  evidence: string;
}

export interface AdversarialResult {
  attack: string;
  result: 'held' | 'broke';
  /** Required when result === 'broke' — a broken attack with no patch is not survival. */
  patch?: string;
}

/** The blind run of point 8 — a RUN, not a claim. */
export interface BlindRun {
  ran: boolean;
  /** The NAMED model that executed it blind (e.g. 'sonnet', 'haiku'). */
  executor: string;
  completedWithoutQuestions: boolean;
  /** Observation id / path to the run transcript, so the run is auditable. */
  transcriptRef?: string;
}

/** One LEDGER entry — the fixed, blind-executable template. */
export interface KaizenLedgerEntry {
  mission: string;
  draftPath: string;
  /** The named mid-tier executor tier the plan targets. */
  executor: string;
  /** One grade per point (1..8). */
  grades: KaizenGrade[];
  adversarial: AdversarialResult[];
  patches: string[];
  blindRun?: BlindRun;
}

export interface KaizenVerdict {
  ready: boolean;
  /** e.g. "6/8". */
  score: string;
  /** Point numbers not passing. */
  failing: number[];
  reasons: string[];
}

/**
 * Grade a ledger entry against the standard. Kaizen-ready requires: all 8 points
 * pass WITH evidence; every 'broke' adversarial result carries a patch; the blind
 * run actually ran and completed without questions (point 8 is a run, not a
 * claim); and the executor tier is named. Deterministic — no inference.
 */
export function gradeLedgerEntry(entry: KaizenLedgerEntry): KaizenVerdict {
  const reasons: string[] = [];
  const failing = new Set<number>();
  const byPoint = new Map(entry.grades.map((g) => [g.point, g]));

  for (const { point } of KAIZEN_STANDARD) {
    const g = byPoint.get(point);
    if (!g) { failing.add(point); reasons.push(`point ${point}: not graded`); continue; }
    if (!g.pass) { failing.add(point); reasons.push(`point ${point}: fails — ${g.evidence || 'no evidence'}`); continue; }
    if (!g.evidence || g.evidence.trim().length < 3) { failing.add(point); reasons.push(`point ${point}: pass claimed without evidence`); }
  }

  // Point 7 integrity: an attack that broke it with no patch is not a survived pass.
  for (const a of entry.adversarial) {
    if (a.result === 'broke' && !a.patch?.trim()) { failing.add(7); reasons.push('point 7: an attack broke it with no patch recorded'); }
  }

  // Point 8 integrity: it must be RUN and clean.
  const blindOk = !!entry.blindRun?.ran && !!entry.blindRun?.completedWithoutQuestions;
  if (!blindOk) { failing.add(8); reasons.push('point 8: blind run not executed or not clean — a claim is not a run'); }

  const executorNamed = !!entry.executor?.trim();
  if (!executorNamed) reasons.push('executor tier unnamed — "mid-tier model" must be a named model');

  const failingArr = [...failing].sort((a, b) => a - b);
  const passCount = KAIZEN_POINTS - failingArr.length;
  return {
    ready: failingArr.length === 0 && executorNamed,
    score: `${passCount}/${KAIZEN_POINTS}`,
    failing: failingArr,
    reasons,
  };
}

/** A blank blind-executable LEDGER template — the fixed schema every entry follows. */
export function blankLedgerEntry(mission: string, executor: string): KaizenLedgerEntry {
  return {
    mission,
    draftPath: '',
    executor,
    grades: KAIZEN_STANDARD.map((s) => ({ point: s.point, pass: false, evidence: '' })),
    adversarial: [],
    patches: [],
  };
}
