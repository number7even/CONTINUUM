# KAIZEN (改善) — forge a plan until it runs blind

> **Kaizen = "continuous improvement."** Forge a mission plan on paper until a
> **named mid-tier model** could execute it blind — no questions — then self-grade
> it point-by-point, stress it adversarially, and refine. It is
> **verify-then-dissolve at the planning altitude**: you don't execute until the
> plan proves it can be executed.
>
> Wired into CONTINUUM (`packages/core/src/kaizen.ts` + `continuum_kaizen_record`)
> — reusing existing primitives, no parallel store. Bound by [The Nine](../AGENTS.md).

---

## The Standard — a plan is *kaizen-ready* only when ALL eight hold

| # | Point | It means |
|---|---|---|
| 1 | **Expected observation** | every move states exactly what you should see if it worked |
| 2 | **Failure + counter-move** | every move carries its likely failure, the cause it signals, and the counter |
| 3 | **Triggered forks** | every fork has a trigger (observe X → route B); no judgment left to the executor |
| 4 | **RECON NEEDED** | every unsettled assumption is marked, with the exact check that settles it |
| 5 | **Abort conditions** | the moments to stop and flag rather than improvise are named |
| 6 | **Verification** | which runs, when, and what pass looks like — spelled out per move |
| 7 | **Adversarial pass** | it survived a stress pass; records the attack that failed **and** the patch the one that landed produced |
| 8 | **Blind-executable** | the **named** mid-tier model runs it end to end without asking a single question |

**The killer criterion is #8 — and it is a RUN, not a claim.** The grader holds a
plan at 7/8 until the blind run is actually executed and completes clean. A plan
that *says* it is executable-blind but was never handed to the executor is not
ready. (This is the same discipline as running the soak instead of asserting
autonomy.)

---

## The LEDGER entry — the fixed, blind-executable template

One entry per mission. This schema *is* the template — an executor fills every
field; nothing is left to interpretation (the ledger meets the standard it enforces).

```jsonc
{
  "mission":   "01 build website",
  "draftPath": "tasks/01/draft.md",
  "executor":  "sonnet",                      // the NAMED mid-tier tier — never "a mid-tier model"
  "grades": [                                 // one per point 1..8; a pass needs real evidence (≥3 chars)
    { "point": 1, "pass": true,  "evidence": "each step's 'expect:' line is present" },
    { "point": 8, "pass": true,  "evidence": "ran blind by sonnet, 0 questions — see transcript" }
  ],
  "adversarial": [                            // point 7: a 'broke' with no patch is NOT survival
    { "attack": "ambiguous fork at step 3", "result": "held" }
  ],
  "patches":  ["step 3 fork given an explicit trigger"],
  "blindRun": { "ran": true, "executor": "sonnet", "completedWithoutQuestions": true, "transcriptRef": "obs:xyz" }
}
```

---

## How it maps onto CONTINUUM (no parallel store)

| Kaizen concept | CONTINUUM primitive |
|---|---|
| a **mission** | a **Todo** — `verifyCommand` = the blind run; only reaches `done` when kaizen-ready |
| a **LEDGER entry** | an **Observation** (`type='kaizen_ledger'`, full grade in metadata) — append-only, self-graded |
| the **blind run** of #8 | a recorded outcome referenced by `transcriptRef` — auditable, a run not a claim |
| the **refinement loop** | re-record after each patch; the grade climbs toward 8/8 |

**Record a graded plan:**

```
continuum_kaizen_record { mission, executor, grades[8], adversarial[], patches[], blindRun }
  → grades against the standard, writes the ledger Observation, opens/updates the
    mission Todo, and returns the verdict { ready, score, failing, reasons }.
```

Missions then appear in `continuum_get_todos` (open = still forging, done = kaizen-ready).
Read a full grade with `continuum_get_observations([id])`.

---

## The three disciplines this enforces (why it was built this way)

1. **The ledger meets its own standard.** The template is fixed and blind-executable — no stub prose.
2. **Point 8 is executed, not asserted.** `ready` is impossible without an actual clean blind run.
3. **The executor is named.** "Blind-executable by `sonnet`" is a test; "by a mid-tier model" is a vibe.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
