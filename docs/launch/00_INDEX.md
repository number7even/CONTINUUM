# CONTINUUM — Launch Dossier (Synthesis)

> **Compiled:** 2026-07-06 · The end-to-end reverse-engineering of CONTINUUM into a
> launch strategy, produced by 4 grounded agents (each verified its claims against
> source, per P4). This is the hub; the four docs below are the depth.
>
> **The spine (governs all four):** CONTINUUM is **the verifiable trust fabric for
> human-agent collaboration**, and **The Nine** ([thenine.foundation](https://thenine.foundation) ·
> [`../../AGENTS.md`](../../AGENTS.md)) is the **bidirectional trust protocol** binding
> human and agent to the same standard (P5: *the rule binds its keeper*).

---

## The four docs

| # | Doc | What it answers |
|---|---|---|
| 01 | [`01_GROUND_TRUTH_AND_GAP.md`](./01_GROUND_TRUTH_AND_GAP.md) | What actually exists · value engine · friction audit · gap analysis |
| 02 | [`02_JOURNEY_ROADMAP_SPRINTS.md`](./02_JOURNEY_ROADMAP_SPRINTS.md) | Red-line journey · Phases 1–3 · Sprints 1–7 |
| 03 | [`03_MARKET_AND_DIFFERENTIATION.md`](./03_MARKET_AND_DIFFERENTIATION.md) | The market · differentiation matrix · positioning · 5 honest corrections |
| 04 | [`04_CONTENT_90DAY_WALK_AND_TALK.md`](./04_CONTENT_90DAY_WALK_AND_TALK.md) | 90-day walk-&-talk content engine, all days scripted |

---

## The thesis (one paragraph)

The market sells **AI memory** and races on recall %. CONTINUUM sells a **category** —
*the memory that refuses to lie.* Its wedge is **proof-gated memory**: **0 of 7 rivals**
(Mem0, Letta, Zep, Cognee, LangMem, Supermemory, MCP servers) verify at *write* time;
CONTINUUM's DONE requires a passing `verifyCommand`. That is P2/P4 made physical, and The
Nine makes it symmetric — **human and agent are the same kind of principal under proof**
(P1/P2), with the trust-leap reserved for the human alone (P9). The moat and the ethic are
one artifact.

## The three verified differentiators (03)

1. **Proof-gated memory — an open lane.** No rival verifies at write time.
2. **Widest dev-native aggregation** — code + git + docs + concepts + memory in one
   navigable 3D "brain"; competitors aggregate *conversation*, we aggregate *the project*.
3. **Governance as architecture** — The Nine bound per-file. No rival ships any trust binding.

## The positioning correction (P4 in public)

**Lead with the trust axis, not the token number.** We have no recall benchmark; against
$10M–$1.25B-funded incumbents publishing ~90% recall, ~2.85x token savings loses a
spec-sheet fight. Reframe 2.85x as *reproducible honesty*, not a size claim. If we ship one
public LongMemEval-style pass, the content plan stops being silent where every rival has a number.

## Verified anchor corrections (the code is ahead of its docs)

The agents corrected my starting anchors against source — fold these into all messaging:

| Claim (marketed / assumed) | Verified reality | Source |
|---|---|---|
| install `@number7even/continuum` | bin is **`@number7even/continuum-cli`** — the marketed name **404s at step one** | 02, 01 |
| 9 MCP tools | **~13–14 tool files** | 01, 02 |
| 5 CLI verbs | **10 verbs** (incl. `verify`) | 02 |
| 3 adapters | **4** (incl. `remote-git`) | 01 |
| storage default = SQLite | default flipped to **`hybrid`** (`factory.ts:56`) | 01 |
| "verify-then-dissolve gate in core" | core stores `verifyCommand` as a **witness string**; the exit-0 gate runs in the **`continuum verify` CLI** | 01 |
| 10x token savings | **~2.85x measured** (`README.md:98`) — 10x is dead | all |
| ARCHITECTURE §14 | **8 of 9 locked**; only **D1 (the name)** pending | 01 |

## The single biggest gap to launch

**The on-ramp, not the engineering.** The value engine is live in production (Fly + Vercel,
dogfooded). But the marketed install 404s, setup needs manual `.mcp.json` path-editing, and
the hosted "ask the brain" silently 500s without two separate secrets. **TTFV is the
conversion killer.** Sprint 1 ("The 5-Minute Cold Start") is the whole ballgame:
`continuum init --guided` + `continuum verify --json` + a keyless mode so the brain works
before any API key.

The true *monetization* blockers are all 🔮 V2 roadmap — hosted multi-tenant SaaS, RBAC
tenancy, billing — gated on the unresolved **RuVector-vs-Postgres tenancy-substrate** decision
(ARCHITECTURE §14, the open flag).

## The content engine (04)

90 days, three arcs — **THE MEMORY PROBLEM (1–30) → THE BUILD (31–60) → THE CONVERSION
(61–90)** — every day scripted with all 5 fields, roadmap tagged as roadmap, the "10x"
killed on-camera (Days 8, 16). It is the differentiation *performed*: the honesty discipline
is P4 binding the founder, so the calendar is a verifiable ledger of progress, not marketing.
**Standing rule:** every asset links to [thenine.foundation](https://thenine.foundation).

## Go-order

1. **Sprint 1 — the on-ramp** (fix the bin/install 404, `init --guided`, `verify --json`,
   keyless brain). Nothing markets until TTFV < 5 min.
2. **Repo-drop (`--repo=<path>`)** — turn "our brain" into "drop *your* repo → map + dossier
   + content." (Mermaid map exporter: ✅ shipped in the dossier.)
3. **Content Arc I** can start immediately — it's grounded in what's already true.
4. **V2 tenancy decision** (RuVector vs Postgres) before any hosted-SaaS / billing work.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
