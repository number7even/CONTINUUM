# CTO Analysis: CONTINUUM

> **Date:** 2026-05-20
> **Author:** CTO orchestrator review (Claude Opus 4.7)
> **Context:** Deep analysis + improvement suggestions in response to a
> system-overview pitch describing the 5-Source Aggregation Moat, Progressive
> Disclosure, RuVector evolution, privacy invariants, verify-then-dissolve,
> and Hermes-ecosystem synergy.

---

## Executive summary

The architecture is genuinely novel where most "AI memory" projects are not —
but the pitch describes a system substantially more complete than what's
actually in `main`. Before suggesting improvements, the most important
improvement is **closing the gap between the narrative and the shipped code**,
because the partner agreement in `CLAUDE.md` explicitly warns against this
pattern (clause #3: "code > architecture revision").

---

## 1. Reality check against the pitch

Per `CLAUDE.md` (source of truth, not the pitch):

| Pitch claims… | Repo state |
|---|---|
| "5-Source Aggregation Moat" | 1 of 5 adapters shipped (`export`). No `docs`, `git`, `memory-observations`, `feedback` adapter. **It's currently a 1-source product.** |
| "Progressive Disclosure 3-layer (search → timeline → get_observations)" | The 3 MCP tools (`continuum_search`, `continuum_timeline`, `continuum_get_observations`) are **not** in the shipped tool list. The shipped tool is `continuum_search_docs` + 6 others. Timeline tool not shipped. |
| "Auto-Generated Session Briefings" + `continuum.session_start` prompt | Prompt **not shipped** (V0 polish gap). Resource `continuum://session/briefing` **not shipped**. |
| "Strict Privacy `<private>` tag redaction at Aggregator" | **Correction (verified 2026-05-23):** Privacy filter **is shipped** in `packages/core/src/observation.ts:42` — `<private>...</private>` tag stripping plus pattern detection for OpenAI/Anthropic-style keys (`sk-…`), xAI keys (`xai-…`), AWS access keys (`AKIA[0-9A-Z]{16}`), and PEM private keys. The §8 invariant lives inside `insertObservation` (the write-path) rather than in a dedicated "Aggregator" module. The original row was wrong; Section A3's recommendation (pattern-based detection as a second layer) is **partially satisfied** — missing additions: JWT shapes, GCP service-account JSON, generic entropy-based detector, and operator-extensible patterns config. |
| "RuVector GNN learns from query sequence/timing" | V0.5+, not built. "Learns without retraining" claim is currently aspirational. |
| "Verify-then-dissolve discipline" | **Actually shipped and proven** (row `81223c05-4465-480c-a56d-14f665ffb581`). The one verified differentiator. |
| Live Todo Pipeline | **Actually shipped** (commit `c9def2c`, 3 MCP tools + 1 Resource). |

**Three of fourteen claims have shipped code behind them** (verify-then-dissolve,
Live Todo Pipeline, and — corrected on re-verification 2026-05-23 — the
privacy filter). Not a criticism of progress — V0 is V0 — but it *is* the
exact pattern partner agreement clause #3 was written to catch: "the
architecture is the menu; food doesn't arrive until we cook."

> **Update 2026-05-23 — V0 polish progress:** Step 1 of the §15b execution
> plan is in progress. Shipped this session: (1) §15 ARCHITECTURE.md expanded
> with the four-step phased plan and seven parked-integration cross-refs;
> (2) three new MCP Resources — `continuum://state/current`,
> `continuum://digest/latest`, `continuum://session/briefing` (Layer-0 brief);
> (3) two new MCP Prompts — `continuum.session_start`, `continuum.cite`;
> (4) `AgentHandoffMetadata` type + `createAgentHandoffObservation()` helper
> in `@continuum/core` (V0-compatible RecursiveMAS intent capture, Issue #3).
> Build clean across all three workspace packages. Remaining V0 polish:
> `docs` + `git` adapters, STATE.md → first-checkpoint parser, CLI
> (`continuum init/start/status`), Section A3 privacy-filter extensions.

---

## 2. Architectural improvements (ranked by leverage)

### Tier A — Do before V0.5

#### A1. Promote `verify-then-dissolve` from "feature" to "thesis"

This is the only thing in the stack that competitors (Mem0, Letta, Cognee,
claude-mem, Cursor's memory) don't have. The pitch buries it under
"5-source aggregation," which is a *generic* claim every memory product
makes. Lead with the verifier. Rewrite the README hero around it:

> *"The only AI memory layer that refuses to mark work done until a shell
> command proves it."*

#### A2. Ship Layer 0 (pre-rendered briefing), then enforce Layers 1→3

Progressive Disclosure as described is honor-system. An LLM with budget
pressure will skip Layers 1–2 and slam Layer 3 because the model optimizes
for completeness. Two enforcement mechanisms:

- **Server-side:** rate-limit `get_observations` to N IDs per turn unless
  preceded by a `search`/`timeline` call in the same session. Return an
  error otherwise.
- **Layer 0:** ship `continuum://session/briefing` as a static, pre-rendered
  resource that the prompt instructs the AI to read *before* any search.
  Eliminates the round-trip for ~80% of sessions where the briefing alone
  is enough.

#### A3. Pattern-based privacy as a second layer behind `<private>` tags

Tag-based redaction misses everything that wasn't tagged: API keys in stack
traces, JWTs in commit diffs, emails in transcripts. Add a regex/entropy
detector (AWS keys, GCP service accounts, JWT shapes, high-entropy strings
>40 chars in non-binary contexts) running *after* the tag-based pass. Tags
catch the known; patterns catch the unknown.

#### A4. Resolve the V2.2 RuVector-vs-Postgres flag now, not at V2

`CLAUDE.md` explicitly flags this. The reconciliation is obvious and
shouldn't wait: **RuVector = data plane, Postgres = control plane** (tenancy
directory, OAuth identities, RLS for tenant boundaries; RuVector indexes the
actual observations per tenant). Lock this in `ARCHITECTURE.md §14` before
any V2 work begins, otherwise V0.5 RuVector decisions will paint you into a
corner.

### Tier B — Inform V0.5 / V1 design

#### B1. The 5 sources are not equal-weight

Treating doc/memory/feedback/git/transcript as parallel inputs to a single
index is naive. Hierarchy:

- **Git commits + verify_command outcomes** = ground truth (high precedence)
- **Feedback signals (SONA rewards)** = labeled training data (high precedence)
- **Docs + memory observations** = stated intent (medium)
- **Raw transcripts** = noisy chatter (low; should be summarized, not indexed
  verbatim)

The retrieval ranker (FTS5+Chroma fusion now, RuVector later) should know
these tiers. RRF without source weighting will drown signal in transcript
noise within a month of heavy use.

#### B2. RuVector's "GNN learns query sequence/timing" needs a concrete learning signal

The most hand-wavy line in the pitch. Specify before building:

- **What's the label?** Positive: user kept the result / cited it / closed a
  todo whose `verify_command` later passed. Negative: user re-searched the
  same query, deleted observation, todo failed verification.
- **What's the loss?** Pairwise ranking loss on retrieval pairs labeled by
  downstream action.
- **What's the falsification criterion?** If the GNN doesn't beat the V0 RRF
  baseline on NDCG@10 after 1,000 labeled queries, you don't ship it — you
  keep RRF.

Without these three answers, "self-learning memory" is the same buzzword
you'd challenge anyone else for using.

#### B3. Append-only checkpoints need a compaction story

Three customers × 5 sources × N months = unbounded growth. Especially painful
for V1 OSS users on laptops. Design a checkpoint compaction pass now (not in
V2 when it hurts): hourly rollups → daily summaries → weekly digests, with
originals re-derivable from git/JSONL but not held in the hot index.

#### B4. Sharpen the boundary between CONTINUUM and the Hermes ecosystem

The pitch conflates CONTINUUM with Context7, TaskmasterAI, Markdownify,
Playwright, Vercel. Those are *peers* in Hermes — they fetch live truth from
their respective domains. CONTINUUM's job is different: **it remembers what
those tools told you, across sessions, with provenance.** Frame CONTINUUM as
the substrate the other MCPs write *into*, not as the umbrella over them.
This is also a better moat story: the truth-fetchers are commodity (anyone
can wrap Context7); the persistent verifiable memory is not.

### Tier C — Strategic

#### C1. Pick one of the three customers for V1. Not all three

Dogfood (you) + OSS (other builders) + ARIA tenants (hotels) is the *same*
trap that ate the last 4 months elsewhere. Different customers want
different things:

- OSS users want zero-config + laptop SQLite
- Hotel tenants want hosted + multi-tenant + audit logs
- You want whatever unblocks VC

Ship for ONE in V1. The "same engine, different config" framing is correct
for the *engine*, wrong for the *go-to-market*.

**Recommendation: OSS first.** It forces the boring infrastructure (CLI,
docs, one-line install) that ARIA will need anyway, and the feedback loop
from outside builders will find architectural blind spots you and I cannot
find from inside.

#### C2. The verifier is the upsell

- **Free OSS:** SQLite + `verify_command` via shell exit code.
- **Paid hosted:** structured verifiers (HTTP probes, Playwright assertions,
  regex matchers), verification audit log, re-prove-on-demand.

A natural pricing surface that doesn't require crippling the OSS version.

---

## 3. What to challenge in the framing itself

- **"10x token savings"** — measured how, against what baseline? If the
  baseline is "dump everything into context," sure, but that's a strawman.
  Compare against a well-prompted RAG with reranking. The honest number is
  probably 2–3x, which is still excellent and more defensible.
- **"Mathematically query historical states"** — append-only event logs
  aren't mathematics, they're just append-only event logs. Datomic and Git
  have done this for a decade. Drop the framing; the feature is fine
  without it.
- **"Unstoppable"** — flag word. User-facing copy should say what the system
  actually does, not how it feels.

---

## 4. Recommended next move

In priority order, all small:

1. **This week:** Ship the three missing Resources (`continuum://state/current`,
   `continuum://digest/latest`, `continuum://session/briefing`) and both
   Prompts. Close the V0 polish gap before anything else. Implementation
   work, not strategy.
2. **Next:** Decide V2.2 RuVector-vs-Postgres in `ARCHITECTURE.md §14`.
   30-minute decision, saves weeks.
3. **Before V0.5:** Write the RuVector falsification criterion (B2). If you
   can't write the failure condition, you can't ship the feature honestly.
4. **Before V1:** Pick one customer (C1).

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
