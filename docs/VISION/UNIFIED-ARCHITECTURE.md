# The Unified CONTINUUM Application Architecture — Vision

> **Status:** aspirational target document. Multi-year horizon (~2026–2028).
> **NOT a sprint backlog.** For what is actually shipped, see
> [`../STATUS-2026-05-29.md`](../STATUS-2026-05-29.md). For what gets built next,
> see [`../SPRINT-2026-W22.md`](../SPRINT-2026-W22.md).
>
> **Discipline:** Every component below carries a **tier label** so this
> document does not lie about reality. Tier labels:
>
> - ✅ **shipped** — code exists on `main`, smoke-tested, used in production
> - 🟡 **partial** — code exists for part of the claim; named gaps remain
> - 🟠 **planned** — specced (PDF, issue, or design doc); zero or trivial code
> - 🔮 **aspirational** — concept only; no spec, no code, no operator
>
> Bound by [The Nine](../../AGENTS.md) v0.1.0. Per P4: this document does
> not claim more than it can verify; per P2: claims are tagged to the
> evidence (or absence thereof). Per P5: when this vision and AGENTS.md
> conflict, AGENTS.md wins.

---

## The thesis

CONTINUUM is a persistent intelligence layer and **the world's first
Witness-Native Operating System** *(framing claim — see note below)*.
It stratifies computing into four+ distinct domains to eliminate the friction
between context and logic, moving AI from a passive text generator to a
deterministic reasoning engine.

> **🔮 Framing note (P4):** the "Witness-Native OS" framing is a positioning
> claim — it describes the *target* operating model. As of 2026-05-29 the
> shipped surface is an **MCP server with stdio + HTTP/SSE transports + a
> Vercel-hosted chat UI**. Calling it an OS today would overreach. Calling
> it an OS in 2028 — if Layers 1, 3, 4, and 5 below ship — would be honest.

---

## Layer 1 — Physical: RVM (The Execution Hypervisor) 🔮

> *"At the lowest level, CONTINUUM replaces traditional virtual machines and
> Docker containers with RVM (Rust Virtual Machine), an air-gapped, bare-metal
> hypervisor purpose-built for AI agent workloads."*

### Components

- **🔮 Coherence Domains** — graph-driven isolation, sub-10μs spin-up. **No code in this repo.** RVM source exists at `~/Development/rvm` (Issue #19, `cargo check` green). No integration.
- **🔮 Cryptographic Witness Engine** — every state mutation gated by a proof token; 64-byte tamper-evident witness on success. **No emitter, no verifier, no consumer in CONTINUUM.** The current "verify-then-dissolve" todo discipline (✅ shipped) uses shell-command exit codes as proof, not cryptographic witnesses.

### Honest current proxy for the witness invariant

The Live Todo Pipeline (✅ shipped, `continuum_create_todo` + `verifyCommand`)
already refuses to dissolve open commitments without a passing shell exit
code. This is the **economically-equivalent operator-level proxy** for the
witness engine until RVM exists. Substituting `exit-0` for a 64-byte
cryptographic witness is a tradeoff acceptable at V1 — the trust boundary
is the operator's own laptop, not a cloud tenant.

### Gating before Layer 1 work begins

- V0.5 hybrid backend default-backable (Sprint W23-1).
- At least one external operator successfully using V1 AaaS.
- A concrete attack scenario where shell-exit-code is insufficient proof
  and a cryptographic witness would catch it.

---

## Layer 2 — Cognitive: CONTINUUM (Memory + Hippocampus) 🟡

> *"CONTINUUM operates as the system's canonical memory manager and hippocampus."*

### Components

#### 5-Source Aggregation 🟡 (3 of 5 shipped)

- **✅ /docs RAG** — `packages/adapters/docs/` shipped 2026-05-23; idempotent markdown ingestion, stable per-file UUIDs from `sha256(relativePath)`.
- **🟠 memory observations** — schema-compatible with `claude-mem`; adapter not yet written. Tracked informally; bump to issue if needed.
- **🟠 HITL feedback signals** — SONA-style rewards specced in original architecture; no code. The Live Todo Pipeline (✅ shipped) is the simplest possible HITL channel: human creates a todo, agent verifies it, human approves dissolution.
- **✅ git history** — `packages/adapters/git/` shipped 2026-05-23; one Observation per commit, raw 40-char SHA as stable ID.
- **✅ AI session transcripts** — `packages/adapters/export/` shipped pre-2026-05-15; tails Claude session JSONL into Observations.

**Honest count:** 3 of 5 source types have shipped adapters. The other 2 are
specced but not coded.

#### RuVector Persistence 🟡

- **🟡 Unified vector / graph / relational engine** — V0.5 hybrid backend wires RuVector @0.2.25 alongside SQLite. **The "unified" part is fictional today** — V0.5 keeps SQLite as the relational + FTS5 store and uses RuVector only for the HNSW vector index. Promotion to "RuVector as the unified backend" is V0.5→V0.6 work.
- **🔮 GNN that learns from query sequences, improving recall without retraining** — *zero code.* V0.5 uses static MiniLM-L6-v2 embeddings. The GNN claim is roadmap; it requires a labeled query-success dataset CONTINUUM does not yet collect.
- **🔮 RVF cognitive containers + Git-like COW branching** — concept. The closest shipped equivalent is the `product_state[]` append-only checkpoint table, which gives mathematical "what was true on date X" queries via row filtering. RVF is a multi-year ambition.

#### Progressive Disclosure ✅

- **✅ Layer 1 — Search** (`continuum_search_docs`) — compact ID + title hits, ~50–100 tokens each.
- **✅ Layer 2 — Timeline** (`continuum_timeline`) — chronological context around an anchor observation. Shipped 2026-05-28 commit `e0de609`.
- **✅ Layer 3 — Full Fetch** (`continuum_get_observations`) — explicit ID list, batch up to 50. Shipped 2026-05-28 commit `e0de609`.
- **🟡 ~10x token savings** — *measured under local-dev conditions, not yet under live fire.* See Sprint W22-1: the measurement is owed.

#### Privacy & Verify-Then-Dissolve ✅

- **✅ Privacy invariant** — 11 named patterns (JWT / GCP service account / GitHub / Slack / Google API / Stripe live + publishable / etc.); optional Shannon-entropy detector gated by `CONTINUUM_PRIVACY_ENTROPY_DETECTOR=1`; operator-extensible JSON config at `$CONTINUUM_PRIVACY_CONFIG`. Closed Issue #8 extends to deep-scrub `Observation.metadata` (shipped 2026-05-24).
- **✅ Verify-then-dissolve discipline** — the Live Todo Pipeline refuses to dissolve commitments without a passing `verifyCommand` exit code. End-to-end demonstrated 2026-05-15 on `vc-hospitality` (row `81223c05`).

### Honest tier roll-up for Layer 2

| Sub-component | Tier |
|---|---|
| 5-Source aggregation | 🟡 (3/5 shipped) |
| RuVector unified persistence | 🟡 (HNSW vector index only; relational still SQLite) |
| GNN query-sequence learning | 🔮 |
| RVF + COW | 🔮 |
| Progressive Disclosure 3-layer | ✅ |
| Privacy filter | ✅ |
| Verify-then-dissolve | ✅ |

---

## Layer 3 — Orchestration: Vibely (Control Plane) 🔮

> *"Vibely is the control plane responsible for mapping human intent to
> autonomous execution."*

- **🔮 Visual canvas → SIR blueprints** — no code. No spec doc beyond the
  paragraph the operator pasted.
- **🔮 Mercury dLLM @ 1,109 tok/s for parallel routing** — third-party hosted
  model. No account, no integration, no benchmark on our workloads.
- **🔮 DAG-based escalation to H-MARA** — depends on Layer 4. Not started.

### Honest scope estimate

Layer 3 is a separate company-grade product. It does not get prototyped in
this repo; it would live in a sibling repo when started. Cross-link to
CONTINUUM via MCP. **Estimated start: 2027 at earliest, after Layer 2
matures and a real operator says "I need to compose 5 of these chats into
a deterministic pipeline."**

---

## Layer 4 — Reasoning: H-MARA (The Brain) 🟠

> *"For complex, high-stakes problem-solving … tasks are escalated to the
> Hyperscale Multi-Agent Reasoning Architecture (H-MARA)."*

### Components

- **🟠 De-Biasing Extraction Compiler (DEC)** — 4-stage pipeline (Semantic Firewall → Constraint Extraction → Differential Privacy → mathematical bounds output). Specced in `docs/H-MARA-CONTINUUM/H-MARA-INTEGRATION-PLAN.md` v0.1. **Zero code.**
- **🟠 MCTS Gladiator Arena** — Proponent generates patch, Skeptic writes exploits. Mathematically constrained Monte Carlo Tree Search instead of conversational generation. **Zero code.**
- **🟠 Dual-Tier Environment Judge** — quantized Tier-1 Heuristic Critic scores rapidly; heavy Tier-2 Lazy Deterministic Judge detonates only the highest scorer inside RVM sandbox. **Zero code.** Tier-2 depends on Layer 1 (RVM).

### Honest H-MARA dependency chain

H-MARA cannot ship before:
1. ✅ CONTINUUM Layer 2 baseline (done).
2. 🟠 RVM (Layer 1) at least to "sandbox runs and emits a witness".
3. 🔮 Local inference (`ruvllm` per Issue #3) — cloud API models do not expose hidden states, so MCTS-over-LLM is incoherent against Anthropic/OpenAI/Google APIs.

### Honest start window

H-MARA prototyping (Rung 1 of the 4-rung ladder per `H-MARA-INTEGRATION-PLAN.md`)
can start once RVM has a working sandbox-and-witness path. Best case: late 2027.

### v0.2 Future-state enhancements (5-bucket spec) 🔮

> **Filed:** 2026-05-30 per operator CTO analysis. Every bucket below
> is **🔮 aspirational** with explicit dependency footnotes. None of
> this gets built before the baseline H-MARA exists; baseline H-MARA
> does not exist before RVM + local inference exist. Capturing here so
> the architectural intent is preserved without contaminating sprint
> scope. Source spec: operator pasted CTO analysis, 2026-05-30 session.

#### B1 · Latent-Space Recursion (RecursiveMAS) 🔮

Replace text-based agent-to-agent passing with hidden latent state
hand-off. RecursiveLink modules forward raw activation tensors rather
than re-serialising to text and re-tokenising. Published research
claims **2.4x faster · 75% fewer tokens · <$5 training cost** per
recursion module.

- **Hard dependency:** ¹ local inference engine that exposes hidden
  states across the agent boundary. Anthropic / OpenAI / Google APIs
  do **not** expose hidden states — only token streams. Same
  blocker tracked in Issue #3.
- **Soft dependency:** ² a stable multi-agent baseline to wrap. Without
  a baseline H-MARA, there is nothing to recurse over.

#### B2 · MCTS upgrades — lazy eval, cost-aware UCT, decay, symbolic output 🔮

Four sub-enhancements to the MCTS Gladiator Arena (Layer 4 core):

- **Dual-Tier Lazy Evaluation:** quantised sub-2B Tier-1 Heuristic
  Critic scores all candidate nodes cheaply; heavy Tier-2 Lazy
  Deterministic Judge fires only on the highest-scored candidate
  (in an RVM sandbox).
- **Cost-Penalized UCT:** UCT formula subtracts an explicit operational
  compute penalty `λ(C_compute)` to bias toward shallow consensus
  over deep argumentative paths that burn budget.
- **Exponential Decay:** discount factor `γ^d` on node reward decays
  with tree depth. Prevents Proponent/Skeptic infinite-loop arguments
  over diminishing-return corrections.
- **Native Symbolic Output:** agents output Python AST or JSON-schema
  structures directly, not text. Invalid structure → instant -1.0
  reward. Eliminates brittle NLP DAG extraction.

  - **Hard dependencies:** ¹ RVM sandbox detonation for Tier-2 judge;
    ² baseline MCTS impl to enhance; ³ a quantised value-network
    Tier-1 critic model deployment.

#### B3 · Dynamic Mixture-of-Agents + Test-Time Compute throttling 🔮

Rebuild the (also-aspirational) Knapsack Engine as a Dynamic MoA router:

- **TTC Throttling:** upstream router predicts query difficulty
  `Q_diff`. Heavy MCTS only fires for math/logic bottlenecks; simple
  operational queries route to small models. Maps to Vibely's
  Mercury-dLLM-vs-H-MARA escalation gate.
- **MoA Execution Matrix:** 3 cheap diverse SLMs as a "proposer" layer
  generating varied MCTS branches; 1 frontier model as an "aggregator"
  synthesising. Published research claims this outperforms a single
  frontier model on aggregate benchmarks.
- **MCTS Multiplexing (continuous batching):** instead of N×K
  separate inference requests for N agents × K candidate nodes,
  bundle into a single batched tensor payload. Targets 99% GPU
  utilisation and claims up to 80% IRT reduction.

  - **Hard dependencies:** ¹ the Knapsack Engine (Layer 5) itself,
    which is 🔮; ² multiple inference providers wired up; ³ a GPU
    inference path that supports continuous batching (vLLM / TGI /
    similar) — not present in any CONTINUUM dependency today.

#### B4 · Zero-Compute Bypass (Semantic State Caching) 🔮

The most efficient token is the one never generated.

- **MCTS Vector Memory Layer:** before routing to LLMs, embed the
  Objective State Payload and cosine-search against a database of
  historically verified MCTS consensus paths.
- **Cache-hit path:** similarity ≥ 0.96 → bypass agents entirely.
  System pulls the historically verified AST patch, dynamically
  swaps variables, and injects the fix for a fraction of a cent.

  - **Soft dependency:** ¹ a vector memory layer that survives long
    enough to accumulate "historically verified MCTS consensus paths"
    — requires baseline H-MARA running long enough to have history.
  - **Hard dependency:** ² an AST-aware patch synthesiser
    (template + variable-swap engine) that does not exist yet.

#### B5 · Hardened DEC — Constraint Extraction, Orthogonal Bias, Differential Privacy 🔮

Harden the De-Biasing Extraction Compiler (currently 🟠 specced):

- **Latent Constraint Extraction (Stage B):** translate subjective
  rhetoric ("insanely fast", "cheap") into quantifiable mathematical
  bounds (`C(SLA) < 50ms`, `C(Budget) = MinimalOPEX`).
- **Orthogonal Bias Projection:** isolate the user's emotional rhetoric
  into a Bias Vector; require final output to be mathematically
  orthogonal (90°) to it. Mathematical defence against sycophantic
  generation.
- **Differential Privacy (Stage C):** swap PII for synthetic proxies
  before payload reaches agents. MCTS executes on anonymised data;
  real PII reattached only at final output generation.

  - **Hard dependency:** ¹ a DEC pipeline at all — currently zero code.
  - **Soft dependency:** ² a bias-projection embedding model trained
    on rhetorical-tone vs neutral-tone pairs.

#### Why these are in the VISION doc and not the sprint

Per `SPRINT-2026-W22.md §"Non-goals"` and partner-clause #3, none of
B1–B5 is buildable this sprint, next sprint, or this year. They sit
behind:

1. RVM (Layer 1 — 🔮)
2. Local inference exposing hidden states (Issue #3 blocker)
3. A baseline H-MARA implementation (Layer 4 — 🟠)
4. Multiple downstream infra (continuous-batching GPU, vector memory
   over historical consensus paths, AST patch synthesiser)

The 5 buckets are intellectually serious and well-grounded in current
ML systems literature. They are **filed here, not started**, so future
sessions can pick them up against a real H-MARA without re-deriving the
intent.

#### Footnote ¹ — local inference for hidden states

Cloud LLM APIs (Anthropic, OpenAI, Google) return tokens, not hidden
states. Cross-agent latent-state passing requires either: (a)
self-hosting the model (vLLM/llama.cpp/etc.) and exposing
`generate_with_hidden_states()`, or (b) a future API endpoint that
exposes activations (no provider has committed to this). Same blocker
as Issue #3 (RecursiveMAS integration). **Status: 🔮 — no committed
provider, no in-repo inference path.**

#### Footnote ² — baseline H-MARA

"Enhance H-MARA" presumes H-MARA exists. H-MARA itself is 🟠 (specced
in `docs/H-MARA-CONTINUUM/H-MARA-INTEGRATION-PLAN.md` v0.1, zero code).
Rung 1 of that 4-rung ladder must ship before B1–B5 become coherent
work items.

#### Footnote ³ — RVM sandbox

Tier-2 judge detonation requires RVM (Layer 1 — 🔮). RVM source
checkout exists at `~/Development/rvm`, `cargo check` is green
(Issue #19), no integration code in this repo.

---

## Layer 5 — Hyperscale Network & Inference Topology 🔮

> *"To execute multi-agent workloads at enterprise scale without bankrupting
> compute budgets or hitting K8s bottlenecks, the system flattens the network."*

- **🔮 KV-Affinity Routing** — L7 gateway hashes payloads to the Pod IP that already holds the context in GPU Prefix Cache. **Zero code, no L7 gateway deployed.**
- **🔮 Stochastic Bounded-Latency Optimizer (Knapsack Engine)** — compute broker bids for spot-market GPUs across AWS, GCP, CoreWeave by real-time price + reasoning rigor + latency SLA. **Zero code, zero broker accounts wired.**
- **🔮 Federated Thompson Sampling** — edge-local Bayesian updates for model performance; exponential decay routes traffic away from silently-degrading models. **Zero code.**

### Honest scope

Layer 5 only matters at >1000 concurrent enterprise sessions. CONTINUUM
serves single-digit-to-low-hundreds concurrent users at current ambition.
**Premature build = waste.** Layer 5 is on the roadmap as a flag: when load
hits the threshold, start; not before.

---

## Layer 6 — Perimeter Intelligence ✅ (mostly)

> *"CONTINUUM injects specialized edge intelligence to optimize agent
> interactions."*

- **✅ CodeGraph** — user-scope MCP server, auto-spawning, 3 projects indexed (VC-Hospitality 9,384 files; CONTINUUM 30 files; PHANTAQSM 281 files). Benchmark expectation per CLAUDE.md: ~35% cheaper, ~57% fewer tokens, ~71% fewer tool calls vs grep/Read on the same questions. *Unverified for CONTINUUM-specific workloads — verification owed.*
- **✅ Agent Skills** — marketplace cloned to `~/Development/agent-skills`. 7 slash commands (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`) + auto-activating skills (api-and-interface-design, frontend-ui-engineering, etc.). 23 production-grade workflows total with anti-rationalization tables.
- **🟠 GitReverse** — Issue #21 tracked. Specced as "vibe code" synthesis from any GitHub URL (file tree + README → compressed prompt). Eliminates context cold-start for unfamiliar external codebases. **No integration yet.**

---

## The Governing Core — The Nine ✅

> *"The entire hardware and software stack is physically bound by The Nine,
> a strict discipline of verifiable trust defined in AGENTS.md and its
> schema."*

### Current binding

- **✅ Repo binding** — `AGENTS.md` at root (commit `d6f926b`, 2026-05-28), byte-faithful copy of `chapter2/CLAUDE.md` from THE-NINE Master Package, schema v0.1.0.
- **✅ CLAUDE.md surfaces the binding** — header section "🪨 Bound by The Nine" added 2026-05-28.
- **✅ `/chat` system prompt enforces P2, P4, P9** — `apps/console/app/api/chat/route.ts` `CONTINUUM_SYSTEM_PROMPT` names them explicitly to the LLM.

### Aspirational physical operationalization (per the vision document)

- **🔮 P1 (Minimize the secret) via DEC's Differential Privacy** — DEC is 🟠 planned, so this mapping is roadmap. Current P1 operationalization: the privacy filter (✅ shipped) and the operator-narrow Bearer token model.
- **🔮 P2 (Prove, don't grant) + P4 via MCTS Dual-Tier Judge + RVM detonation** — both 🔮 / 🟠. Current operationalization: verify-then-dissolve shell-exit-code discipline.
- **🔮 Keyless Trust Fabric (KTF) → RVM 64-byte witness records** — both 🔮. Current operationalization: Vercel + Fly Bearer-token shared secret (manually rotated when compromised).

### Honest gap

The Nine is bound at the **repo-level discipline layer** (✅), not at the
**physical layer** (🔮). The vision document's claim that The Nine is
"physically operationalized" by RVM + MCTS is aspirational. Today, The
Nine is operationalized by:
- The system prompt that surfaces P-clauses to the LLM.
- The verify-then-dissolve shell-exit-code discipline.
- The privacy filter.
- The append-only `product_state[]` checkpoint table.
- The operator's own discipline of asking "what did you verify?"

That is enough for V1 AaaS. Physical operationalization is a 2027+ ambition.

---

## What this vision lets us do

1. **Talk about the destination** without confusing it with the current state.
2. **Justify the current architecture decisions** by showing what they ladder up to.
3. **Detect overcommitment** — when a commit message or marketing copy
   claims something tagged 🔮 in this doc, that's a red flag worth catching
   before publication.
4. **Reuse the language** across pitches, investor decks, and customer
   conversations *while remaining honest about what's actually built.*

---

## Revision discipline

This document is updated under these rules (P5 — the rule binds its keeper):

- A 🔮 → 🟠 transition requires a written design doc.
- A 🟠 → 🟡 transition requires a merged PR with at least one smoke test.
- A 🟡 → ✅ transition requires production use plus a green verify_command.
- A ✅ rating cannot be assigned to anything that has not been verified on
  `main` within the prior 30 days.

Stale tiers are worse than honest 🟡 tiers. Audit quarterly.

---

_Bound by The Nine v0.1.0. Per P5: when this vision and AGENTS.md conflict,
AGENTS.md wins._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
